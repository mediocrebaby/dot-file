# T1 · 正确报告 SSE 信封中的上游错误

状态：done
负责人：Friday
拆分：已确认
发布：未外部发布

## What to build

HTTP 200 建流后收到业务错误时，Pi 显示失败，不再返回空的成功回复。主要涉及 `stream.ts` 的 SSE 信封解析与错误事件处理。

来源：本次 pi-provider-qoder 与 qoder2api-hub 的源码对比；远端参照版本为 `81eee37f0b4f3d7a6382c3ff402937cba565bfd1`。对比仅做静态检查，未进行真实接口验证。

## Acceptance criteria

- [x] 非成功 `statusCodeValue` 转为 Pi `error` 事件，保留状态码与可用错误详情。
- [x] 同时接受数字 `200` 和字符串 `"200"`。
- [x] 区分 JSON 解析失败与上游业务错误，业务错误不被空 `catch` 吞掉。
- [x] 覆盖首帧错误、输出中途错误、正常结束与用户取消的测试。
- [x] 错误结束后不再发送成功 `done`；错误信息不包含鉴权凭证。

## Blocked by

无。

## Scope

本票不加入自动重试或账号切换。建议优先推进，但不是其他票的必要前置。

## Resolution

已完成实现与离线回归；未调用真实接口。

- `stream.ts`：JSON 容错与业务状态检查分离，业务错误进入唯一终止错误路径；保留中途已输出内容。
- 兼容数字/字符串成功码，保留字符串或对象错误详情及信封错误字段回退。
- 原始及信封内 `[DONE]` 均结束读取；在结束、错误或取消后清理 reader，避免继续解析后续帧。
- 终止错误统一脱敏，包括已知 token、刷新凭证、签名鉴权头及常见敏感字段；不增加请求重试。
- `tests/stream-errors.test.ts`：新增 11 项模拟 SSE 测试，使用真实 Pi 事件流类型及隔离 HOME。运行方式见 `tests/README.md`。

验证环境：Node v26.0.0、宿主 `@earendil-works/pi-ai` 0.87.0、jiti 2.7.0（本地链接，无网络安装）。

- 修复前：首批 10 项测试中 7 项失败、1 项 DONE 等待超时、2 项取消测试通过，复现业务错误被吞及字符串成功码丢失问题。
- 修复后：`node --import jiti/register --test tests/*.test.ts`，全部 14 项通过（原有 3 项 + 新增 11 项）。
- `git diff --check` 通过。

限制：样本均为模拟，不声称真实区域/模型兼容性已验证；畸形 JSON 继续忽略。T2 的 usage、T3 的 finish reason 等后续票据行为未改动。
