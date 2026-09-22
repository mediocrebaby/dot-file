# T4 · 将 Pi 推理设置传递给 Qoder

状态：implemented（档位转发完成；关闭推理待验证）
负责人：Friday
拆分：已确认
发布：未外部发布

## What to build

支持的推理档位写入上游请求，不再仅影响本地正文标签解析。检查 `stream.ts` 的请求构造、模型能力信息及 Pi 的推理选项契约。

## Acceptance criteria

- [x] 建立 Pi 推理档位到 Qoder `parameters.reasoning_effort` 的明确映射。
- [x] 结合模型能力处理不支持的档位，不盲目发送。
- [x] 未指定档位时保留服务端默认行为。
- [x] 明确区分“关闭推理生成”和“关闭 thinking 标签解析”。
- [x] 覆盖支持推理、不支持推理、未指定档位及 `off` 场景。
- [ ] 确认有效的上游关闭参数，并解决 Pi UI off 与未指定的传参区分后验收关闭行为。

## Blocked by

无票据依赖。关闭推理行为的实现与验收需要先确认有效上游参数。

## Open questions

Qoder 关闭推理的有效参数尚未验证；不得假定 `off` 等同于某个 effort 值。已找到第三方实现将 disabled 映射为 `none`，但未作为已验证契约采用。

Pi 0.87 UI off 会被转换为 undefined，与未指定相同；当前 provider 无法在保留默认语义的同时从这个值识别关闭请求。

## Resolution

- 新增 `reasoning.ts`：minimal→low，其余 Pi 档位同名映射，只接受目录明确声明的档位。未知或不支持的显式值在 HTTP 前返回错误，不悄悄改变用户选择。
- `stream.ts` 在请求编码之前添加 effort；未指定时不添加字段。保留 Kimi 的原始 is_reasoning=false，按其 efforts 能力允许档位转发。
- 增加独立 `parseThinkingTags` 选项；运行时显式 off/false 不再仅控制标签，而是明确拒绝尚未验证的生成关闭请求。API reasoning_content 不受标签开关影响。
- 实施取舍、固定版本源码依据及待验收边界见 [推理设置决定](../../../.agents/notes/implemented/feature/2026-09-22-qoder-reasoning-settings.md)。README 已说明直接调用者的迁移方式及 UI off 限制。

验证：

- 修复前首批 10 项测试中 9 项失败、1 项通过。
- 修复后 `node --import jiti/register --test tests/*.test.ts`：53 项通过（新增 11 项 reasoning 测试），检查 fetch 实际收到的编码请求。全部目录/SSE 为模拟，没有调用真实接口。
- `git diff --check`、decision-notes 结构检查通过。

关闭行为仍待验证和实施，不将“拒绝显式 off”当作“成功关闭上游推理”。真实验证需另行取得调用授权或提供可靠契约；也需有能区分 UI off 与未指定的宿主选项。
