# T3 · 保留输出截断等结束原因

状态：done
负责人：Friday
拆分：已确认
发布：未外部发布

## What to build

Pi 能区分正常结束、工具调用和输出长度耗尽。主要涉及 `stream.ts` 的 `finish_reason` 映射及流结束逻辑。

## Acceptance criteria

- [x] 按 Pi 支持的枚举映射上游 `finish_reason`。
- [x] `length` 不再被最终逻辑覆盖为 `stop`。
- [x] 正常工具调用仍触发 `toolUse`。
- [x] 明确并测试“存在工具调用但输出被截断”的处理规则。
- [x] 未知或缺失结束原因有明确回退行为，不产生非法事件。

## Blocked by

无票据依赖。

## Open questions

已依据本机 Pi AI / Agent Core 0.87.0 契约确定：`length` 优先于 `toolUse`，即便工具参数恰好能解析为完整 JSON。当前宿主会对这类工具调用生成失败结果而不执行。

## Resolution

- `stream.ts` 显式映射结束原因，保留 `length`，最终 `done` 不再用类型断言掩盖非法原因。
- 缺失原因按已输出内容回退；未知原因及过滤/网络失败走脱敏 `error` 路径，不冒充成功。
- 新增 `tests/stream-finish-reasons.test.ts` 共 12 项模拟 SSE 测试。
- 映射、优先级及宿主契约证据见 [结束原因决定](../../../.agents/notes/implemented/bug-fix/2026-09-22-qoder-finish-reasons.md)。

验证：修复前新增测试 8 项失败、4 项通过；修复后 `node --import jiti/register --test tests/*.test.ts` 全部 42 项通过。`git diff --check` 通过。

未调用真实接口；宿主拒绝执行截断工具的行为经 0.87.0 源码核对，未验证其他版本。T2 的上游语义验收仍独立待确认，本票不改推理参数及工具参数解析策略。
