# Agent Note: 按模型目录转发推理档位，分离本地标签解析

Status: implemented

## Problem

`streamQoder()` 原先没有发送 `parameters.reasoning_effort`；运行时 `off`/`false` 只关闭正文 thinking 标签解析，并不能证明上游停止推理。Pi、Qoder 模型目录和本地解析器的能力不能混为一谈。

## Decision

### 档位转发

新增 `reasoning.ts`：Pi `minimal` 映射为 `low`，`low/medium/high/xhigh/max` 同名映射。`minimal → low` 是本扩展的明确兼容选择，不宣称上游有 minimal 契约。

只在 `thinking_config.enabled.efforts` 为对象、并明确包含目标档位时发送。动态缓存优先，已有静态配置只按实际声明的档位使用；不根据 `supportsEffort`、`is_reasoning` 或模型名称猜测允许值。Kimi 的原始 `is_reasoning=false` 不覆盖有效 efforts 声明，发送时也不篡改原始模型标志。

显式请求的档位不支持、目录缺失档位证据或传入未知值时，在 HTTP 前返回 Pi `error`，列出确认支持的档位；不偷偷降级、升级或改用服务端默认。`undefined` 不写 effort，连目录标注的默认档位也不主动发送。

现有静态 GLM 5.3/Kimi K3 可接受 low/high/max；其他静态配置若只有 reasoning 布尔标志，须先有包含 efforts 的缓存目录才能转发显式档位。这会使先前被静默忽略的请求显式报错；用户可刷新目录、选择列出的档位或保留未指定状态。

### 关闭行为与本地解析

`QoderStreamOptions` 扩展 Pi 的 `SimpleStreamOptions`，增加 `parseThinkingTags?: boolean`。默认解析标签，设为 false 时保留正文原始标签；它不改变请求、模型能力或 API 的 `reasoning_content` 输出，也没有对应的 Pi UI 开关。

Pi 类型不包含 `off`/`false`，但运行时调用可能传入。现在这两种值明确报“关闭推理参数尚未验证”，不发送推理请求。原来依赖它们关闭标签解析的直接调用者应改用 `parseThinkingTags: false`。

**Pi UI 的 off 不等于直接调用传入字符串 off。** 当前宿主会将 UI off 转成 undefined，因此本 provider 只能维持服务端默认，不能承诺 UI off 关闭 Qoder 推理。缺少区分能力时不把所有 undefined 都当作关闭，否则违反“未指定保留服务端默认”。

### 证据边界

- 本地 Pi AI 0.87.0 `dist/types.d.ts` 的 `ThinkingLevel` 与 `SimpleStreamOptions` 定义六种档位，不包含 off；Agent Core 0.87.0 `dist/agent.js` L305 将 UI off 转为 undefined，`agent-loop.js` 的回合更新也有同样转换。
- [Hub 固定版本 81eee37 的 qoder_proxy.py](https://github.com/shuishuipingan/qoder2api-hub/blob/81eee37f0b4f3d7a6382c3ff402937cba565bfd1/qoder_proxy.py#L2181-L2194) 转发 `parameters.reasoning_effort`；L1602–1613 从目录 efforts 提取档位，并把 `disabled` 的存在作为可关闭能力信息，但未证明请求应使用什么关闭值。
- [qodercli2api 固定版本 b8b595f 的 convert.go](https://github.com/Liki4/qodercli2api/blob/b8b595fabbed733c5899019fed4b660ea23d94e0/convert.go#L394-L402) 将 disabled 转为 `reasoning_effort: "none"`。这是候选参数的第三方实现依据，不是本次验证结果；未直接采用。

## Alternatives considered

- 将 unsupported 档位自动取邻近值可以减少错误，但不同目录档位集合不一致，可能在用户不知情时增加推理量或改变结果。仅保留公开约定的 minimal→low，其余精确匹配，不自动选择。
- 直接把 off 当 none 能更快接通关闭功能，但未确认按模型/区域的有效性；目录 disabled 存在也不能证明参数值。保留明确错误，等待授权验证或可靠契约。
- 保留 off 只关标签的旧行为兼容直接调用者，却容易让人误以为停止了推理生成。改用独立选项，且保留 API thinking 内容。

## Consequences

已知档位真正进入编码后的请求，而不是只影响 UI 内容。所有本地解析行为和上游 effort 可以独立控制，T1–T3 的流处理与 usage 保留不变。

T4 的档位实施完成，**关闭推理仍待协议及宿主传参验收**：需确认 none 等候选值在授权环境中的效力，以及如何在不改变 undefined 语义的前提下从 Pi UI 传递显式 off。未调用真实接口，不宣称推理量或模型输出已经线上验证。

## Verification

- 修改前首批 10 项测试中 9 项失败、1 项通过，复现请求未包含 effort、off 仅影响标签及未校验模型能力的问题。
- `node --import jiti/register --test tests/*.test.ts`：53 项通过（新增 11 项 reasoning 测试）。测试使用隔离 HOME、模拟目录和 SSE，并解码 fetch 实际收到的请求体检查参数；不是上游集成验证。
- 覆盖全部档位、未指定、能力缺失、Kimi 原始标志、静态回退、运行时 off/false、未知值及本地解析独立性。
- `git diff --check` 及 decision-notes 结构检查通过。
