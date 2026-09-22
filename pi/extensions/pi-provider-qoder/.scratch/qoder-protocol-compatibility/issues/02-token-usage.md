# T2 · 将上游 token usage 映射到 Pi

状态：implemented（离线实现完成，待上游语义验收）
负责人：Friday
拆分：已确认
发布：未外部发布

## What to build

Pi 展示上游实际返回的 token 用量，而非始终为零。主要涉及 `stream.ts` 中的 usage 提取与输出消息更新。

来源：本次协议源码对比，尚未调用真实 Qoder 接口。

## Acceptance criteria

- [ ] 根据确认过的上游字段映射输入、输出、缓存及总量。（已实现有第三方源码依据的兼容映射；尚缺真实样本或官方契约确认，尤其是缓存写入语义。）
- [x] 支持只有 `usage`、没有有效 `choices` 的 SSE 帧。
- [x] 重复累计快照不会被重复相加。
- [x] 缺少统计时不伪造用量；无可靠价格时不推算费用。
- [x] 使用脱敏响应样本或明确标注的模拟样本覆盖有统计、无统计及重复统计场景。

## Blocked by

无票据依赖。字段映射的最终验收需要确认上游统计语义。

## Open questions

实际 usage 字段及缓存计数语义需在实施时确认，不得将猜测当作上游契约。

## Resolution

实现和离线回归已完成，协议验收未完成。没有调用真实接口或读取真实凭证。

- 新增 `token-usage.ts`，在 `stream.ts` 的 choices 分支之前更新 usage；支持单独的统计尾帧及部分字段快照。
- 已知字段按快照替换而非累加，保留原始 prompt 以防重复扣减缓存；缺失和非法字段不覆盖已有统计，有效零值可覆盖。
- 总量只采用上游 `total_tokens`，费用保持零；不将 credit/credits 当作货币费用。
- 依据和字段取舍统一记录在 [映射决定](../../../.agents/notes/implemented/feature/2026-09-22-qoder-token-usage.md)，其中区分了第三方说明、本地容错规则和待验证上游行为。

验证：

- 修复前，新增测试首批 13 项中 11 项失败、2 项通过，复现所有统计始终为零。
- 修复后，`node --import jiti/register --test tests/*.test.ts`：30 项全部通过（新增 16 项 usage 测试）。所有 SSE 数据均为明确标注的模拟样本。
- `git diff --check` 和 decision-notes 结构检查通过。

待验收：提供可确认模型、区域的脱敏原始 SSE，至少含首次请求/缓存命中对照及多帧统计，或提供官方契约；重点核对 `cacheable_tokens` 是否等于实际缓存写入、prompt 是否包含缓存、usage 是否始终为请求累计快照。需真实调用时另行取得授权。
