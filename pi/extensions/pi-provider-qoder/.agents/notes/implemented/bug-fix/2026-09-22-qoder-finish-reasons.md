# Agent Note: 截断结束原因优先于工具调用

Status: implemented

## Problem

`stream.ts` 原样写入上游 `finish_reason`，但最终按工具状态数组是否非空覆盖为 `toolUse` 或 `stop`。结果是 `length` 丢失，且被截断的工具参数可能按普通工具调用交给宿主。

## Decision

显式映射后再更新 `stopReason`，不把任意上游值写入 Pi 枚举：

| 上游原因 | Pi 行为 |
| --- | --- |
| `stop`、`end` | `stop`；若已输出工具调用则沿用本 provider 的 `toolUse` 行为 |
| `tool_calls`、`function_call` | `toolUse`；后者仅为结束原因兼容，不新增旧式工具 delta 转换 |
| `length` | `length`，优先于任何普通/工具结束标记 |
| 缺失、`null`、空字符串 | 不覆盖已有原因；最终按已输出的 ToolCall 回退 `toolUse` 或 `stop` |
| `content_filter`、`network_error`、其他未知或非法类型 | 进入现有脱敏错误处理，发送 `error`，不发送 `done` |

同一回复一旦报告 `length`，之后普通或工具结束帧不消除截断标志；业务错误、未知结束原因和用户取消仍进入更高优先级的错误路径。继续读取结束标记前的 usage 尾帧，不在首次 finish_reason 时提前退出。

最终回退检查 `output.content`，不检查稀疏工具状态数组长度：只有工具 id/name、尚未产生参数块时，不凭空声称存在已输出工具调用。明确的 `tool_calls` 原因仍保留，即使上游没给工具内容。

### Pi 契约依据

本机 `@earendil-works/pi-ai` / `@earendil-works/pi-agent-core` 均为 0.87.0：

- Pi AI `dist/types.d.ts` L516–522：`done.reason` 允许 `stop | length | toolUse | deferred`，失败和取消使用独立 `error` 事件。
- Pi AI `dist/api/openai-completions.js` 的 `mapStopReason`（L1188–1209）：`length` 独立于工具原因，内容过滤、网络错误及未知原因映射为错误。
- Agent Core `dist/agent-loop.js` L143–165、L340–354：错误/取消终止当前回合；存在 ToolCall 且 stopReason 为 `length` 时调用 `failToolCallsFromTruncatedMessage`，生成失败工具结果而不执行工具。完整 JSON 也不能证明截断消息中的整个工具批次完整。

因此保留工具块并正常发送 `toolcall_end`，但终止事件及消息必须保持 `length`。阻止工具执行由宿主执行层负责，不把 `length` 偷换成 `toolUse`，也不将所有工具块删除。

## Alternatives considered

- 工具优先可保留旧行为，但会抹掉截断信号，绕过当前宿主对不完整参数的保护，故不采用。
- 把截断都改成 `error` 可阻止工具执行，但会丢失 Pi 原生长度限制语义及宿主生成工具失败结果的恢复路径，故不采用。
- 未知原因回退 `stop` 容忍更多上游变化，但可能把过滤或新增失败类型报告为成功；采用与 Pi OpenAI provider 一致的错误回退。缺失原因则保留本扩展既有的宽容策略。

## Consequences

Pi 能区分普通结束、工具调用和输出截断；正常工具调用仍保持 `toolUse`。新结束原因会显式失败，需有证据后扩展映射。

本次不改工具参数 JSON 解析、ThinkingTagParser 的块事件行为或 SSE 终止协议。工具参数被截断时现有解析仍可能回退为空对象，但 `length` 会保留；不承诺旧版或其他宿主也有同样的执行保护。

## Verification

- 修改前，新建的 12 项结束原因测试有 8 项失败、4 项通过，复现 `length` 被覆盖、未知原因被当作成功及稀疏工具状态导致误报。
- `node --import jiti/register --test tests/*.test.ts`：42 项全部通过（新增 12 项）。覆盖完整/残缺/并行工具参数截断、usage 尾帧、重复结束原因、缺失/未知原因和错误脱敏。
- `git diff --check` 通过。测试使用明确构造的模拟 SSE 和真实 Pi 事件流，不访问真实 Qoder。
- 宿主阻止截断工具执行的行为为上述版本源码核对；未新增 Agent Core 集成测试，未验证其他宿主版本。
