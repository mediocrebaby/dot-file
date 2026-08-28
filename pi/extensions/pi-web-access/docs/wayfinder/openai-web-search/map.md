---
id: WF-OPENAI-WEB-SEARCH-MAP
title: 规划 OpenAI Web Search 与 CLIProxyAPI 支持
labels:
  - wayfinder:map
status: open
assignee:
tracker: local-markdown
---

## Destination

形成一份可直接交给实现 Agent 的完整决策规格：在 `pi-web-access` 中新增 OpenAI Web Search 提供器，以 OpenAI Responses `web_search` 为协议，默认逐查询尝试 OpenAI、失败后回退 DuckDuckGo，并同时支持 OpenAI 直连与经过验证的 CLIProxyAPI 网关通道。

## Notes

- 领域：`pi-web-access` 的搜索提供器、配置、凭据、安全、curator、存储与 `source_check` 证据链。
- 每次会话应查阅 `research`、`grilling` 与 `domain-modeling`；处理响应形状时使用 `prototype`。
- 本地图最初只产出决策规格；按后续用户指令，已在同一仓库同步落地实现与自动化验证。
- 公共提供器名称为 `openai`；不宣称存在 Codex 专用搜索 API。
- 使用非流式 Responses 请求；流式 Responses 和 WebSocket 不在本次范围内。
- 未指定提供器或 `provider: "auto"` 时按 OpenAI → DuckDuckGo 路由；`provider: "openai"` 同样允许回退；显式 `provider: "duckduckgo"` 只使用 DuckDuckGo。
- 回退按查询独立发生。未配置凭据、不可达、鉴权失败、限流、超时、服务端错误、协议不兼容或无可用来源可触发回退；主动取消、非法参数和安全策略拒绝不触发回退。
- 不新增专门的用户可见“发生回退”提示；现有实际提供器归因是否及如何保留，由相关决策票明确。
- 只覆盖 `web_search`、`source_check` 及其 curator、存储和证据链；不改变 `fetch_content`、视频理解和内容提取链。
- CLIProxyAPI 支持以经过真实契约验证的基线版本与模型路径为准，不承诺所有版本或所有上游模型。
- 允许显式配置本地网关 API 基址，但必须单独确定凭据、重定向和内网访问边界。
- 初步事实材料见 [Preliminary OpenAI Web Search and CLIProxyAPI Research](../../research/openai-web-search-cli-proxyapi-preliminary.md)。

## Decisions so far

<!-- Closed ticket decisions are indexed here; detail remains in the ticket. -->

- [确定 OpenAI 搜索配置与凭据优先级](tickets/02-configuration-and-credentials.md)：采用 `webSearch.openai` 深模块配置与专用环境变量优先级，不借用摘要模型凭据。
- [确定可配置 API 基址的安全边界](tickets/03-endpoint-security-boundary.md)：HTTPS 公网校验、HTTP literal loopback、禁止重定向和危险头覆盖。

## Implementation progress pending live probe

以下 blocked tickets 已有研究、保守实现或自动化验证，但按 Wayfinder frontier 规则保持 open，直至 [运行 OpenAI 与 CLIProxyAPI 实际契约探测](tickets/12-run-live-contract-probe.md) 关闭后再做最终决议：

- [验证 OpenAI 与 CLIProxyAPI 的 Responses 搜索契约](tickets/01-verify-responses-contract.md)
- [确定模型选择与搜索能力探测策略](tickets/04-model-and-capability-detection.md)
- [确定搜索选项的跨提供器语义](tickets/05-search-option-fidelity.md)
- [原型化 Responses 来源归一化](tickets/06-prototype-source-normalization.md)
- [确定逐查询路由与静默回退规则](tickets/07-routing-and-fallback-taxonomy.md)
- [确定超时、取消与资源预算](tickets/08-timeouts-cancellation-and-budgets.md)
- [确定 curator、存储与证据归因](tickets/09-attribution-storage-and-curator.md)
- [确定用户文档与配置迁移规则](tickets/10-documentation-and-migration.md)
- [确定兼容性与验证矩阵](tickets/11-verification-matrix.md)

## Not yet specified

- [运行 OpenAI 与 CLIProxyAPI 实际契约探测](tickets/12-run-live-contract-probe.md) 仍需用户提供授权凭据和固定 CLIProxyAPI `v7.2.144` 通道。
- 若 live probe 揭示当前宽容归一化无法覆盖的 `x_search`、翻译事件或模型专属字段，再新增适配票；在此之前网关路径保持候选兼容状态。

## Out of scope

- 发布、部署和版本发布说明；功能编码与自动化验证已按用户后续指令完成。
- 启动或控制本地 Codex CLI、Codex SDK 或 Codex app-server 来执行搜索。
- 把 ChatGPT/Codex OAuth 当作公开稳定的第三方 REST 鉴权契约直接实现。
- Chat Completions 搜索模型、旧 `web_search_preview`、流式 Responses 和 WebSocket 搜索。
- 改造 `fetch_content`、Gemini、Firecrawl、视频或其他内容提取能力。
- 宣称兼容 CLIProxyAPI 的所有版本、翻译器、上游提供器和模型。
