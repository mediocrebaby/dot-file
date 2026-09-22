# Agent Note: Qoder token usage 的兼容映射与证据边界

Status: implemented

## Problem

`streamQoder()` 初始化 usage 后从未更新，Pi 始终显示零 token。Qoder 的额度接口 `usage.ts` 返回账号额度，并非逐次生成的 token 统计，不能混用。

当前没有真实 Qoder SSE 样本或官方字段契约。本次仅访问公开源码，没有读取真实凭证、调用推理接口。以下是有源码依据的兼容策略，不宣称已验证所有区域、模型的上游语义。

## Decision

在 `token-usage.ts` 维护每请求独立的原始计数；在 `stream.ts` 处理 choices 之前消费内层 `usage`，因此无 choices 的尾帧也能更新结果。

### 来源

- [Hub `qoder_proxy.py`，固定版本 81eee37](https://github.com/shuishuipingan/qoder2api-hub/blob/81eee37f0b4f3d7a6382c3ff402937cba565bfd1/qoder_proxy.py#L336-L350)：`_extract_usage` 读取 prompt/completion/total、`prompt_cache_hit_tokens` 和 nested cached_tokens。`aggregate_stream` 在 L2778–2781 用新 usage 替换旧值，不按帧累加。Hub 的 `_test_qoder.py` L897–923 只有模拟统计样本，不是线上证据。
- [qodercli2api `convert.go`，固定版本 b8b595f](https://github.com/Liki4/qodercli2api/blob/b8b595fabbed733c5899019fed4b660ea23d94e0/convert.go#L428-L499)：声明 `prompt_tokens_details.cached_tokens`、`cacheable_tokens`；注释明确将前者解释为缓存读取、后者解释为缓存写入，描述 miss/hit 时的字段变化。此说明来自第三方实现，未在本次独立复核。
- [同版本 `proxy.go` L501–509](https://github.com/Liki4/qodercli2api/blob/b8b595fabbed733c5899019fed4b660ea23d94e0/proxy.go#L501-L509)：从 `PromptTokens` 扣除 cache read/write 后作为普通输入，替换而非累加输出计数。
- 本地 Pi AI 0.87.0 的 `dist/api/openai-completions.js` L1159–1183 同样将缓存读写从 inclusive prompt 中扣除。`dist/types.d.ts` 的 `Usage` 要求计数及 cost 为数字。

### 映射及本地处理规则

| Pi 字段 | 来源/规则 |
| --- | --- |
| `cacheRead` | 优先 `prompt_tokens_details.cached_tokens`，其次 `prompt_cache_hit_tokens`；有效零值也优先，不使用真假值回退 |
| `cacheWrite` | `prompt_tokens_details.cacheable_tokens`，依据上述 Qoder 专用实现，不把“可缓存”这个名称本身当作写入证明 |
| `input` | `prompt_tokens - cacheRead - cacheWrite`；prompt 未报告时为零，不反推 |
| `output` | `completion_tokens`；不额外累加 reasoning token |
| `totalTokens` | 直接保留 `total_tokens`；缺失时不加总估算 |
| `cost.*` | 保留零值，不把 credit/credits、倍率或模型价格兜底值换算成费用 |

usage 按字段替换累计快照；缺失或非法字段保留之前有效值，合法零值覆盖。保留原始 inclusive prompt，不能在已经扣除缓存的 `input` 上再次扣除。部分字段合并是本地容错策略，不宣称上游必然发送部分快照。

只接受非负安全整数。缓存读写之和超过已知 prompt 时不采用该拆分，普通输入回退为 prompt、缓存输出为零；原始缓存值仍保留，以便后续有效 prompt 快照重新验证。prompt 缺失但缓存计数存在时只展示已报告的缓存，不捏造普通输入或总量。

## Alternatives considered

- 直接照搬 Hub 的所有缓存候选字段能覆盖更多变体，但 `completion_tokens_details.cached_tokens` 位于输出详情，当前证据不足以确认它是输入缓存读取，故不映射。也不补猜测性的 `cache_creation_input_tokens`、`cache_write_tokens` 等别名。
- 只展示 inclusive prompt 最简单，但同时展示缓存会重复计入 Pi 的输入分类；采用 Qoder 专用实现和 Pi provider 一致的扣除规则。
- 完全等待真实样本可避免第三方解释风险，但会继续丢弃已报告统计。先交付可测试的兼容实现，T2 的上游语义验收仍保留待确认项，尤其是缓存写入。

## Consequences

重复统计不翻倍，正常完成、错误和取消均保留已报告计数；不影响额度查询、结束原因和推理请求设置。

Pi 必需数字字段的零默认值无法区分“未报告”和“确实为零”。部分快照可能暂时不满足各项之和等于上游总量，不据此篡改总量。若服务端 usage 是分步骤增量，或模型对 cacheable 的含义不同，应依据真实样本调整，不将当前快照策略当作官方保证。

完成上游语义验收需脱敏原始样本及模型/区域信息，至少包含首次请求与缓存命中的对照、重复或变化 usage 帧。真实调用需另行授权。

## Verification

- 修改前：`node --import jiti/register --test tests/stream-usage.test.ts`，首批 13 项中 11 项失败、2 项通过，复现 usage 始终为零。
- 修改后：`node --import jiti/register --test tests/*.test.ts`，30 项通过（新增 16 项 usage 测试）；测试全部使用明确构造的模拟 SSE、真实 Pi 事件流和隔离 HOME。
- `git diff --check` 通过。
- 未验证真实 Qoder 上游；未计算实际货币费用。
