---
id: WF-OPENAI-WEB-SEARCH-01
title: 验证 OpenAI 与 CLIProxyAPI 的 Responses 搜索契约
parent: ../map.md
labels:
  - wayfinder:research
status: open
assignee:
blocked_by:
  - ./12-run-live-contract-probe.md
context_pointers:
  - ../../../research/openai-web-search-cli-proxyapi-preliminary.md
research_asset: ../../../research/openai-web-search-cli-proxyapi-contract.md
---

## Question

OpenAI 直连与一个明确记录版本和模型路径的 CLIProxyAPI 基线，在非流式 `/v1/responses` 请求中实际接受哪些 `web_search` 请求字段、鉴权方式和搜索选项，又分别返回哪些搜索事件、来源 URL、引用、错误与空结果形状？形成对照矩阵和脱敏响应夹具，并明确哪些能力已验证、仅由文档声称或仍未知。

## Resolution comments

### 2026-08-28 — 文档与源码基线完成，待 live probe 决议

研究结果见 [OpenAI 与 CLIProxyAPI Responses Web Search 契约验证](../../../research/openai-web-search-cli-proxyapi-contract.md)。OpenAI 官方非流式 Responses Web Search 的工具、引用、来源 include 和主要控制项已有稳定文档；CLIProxyAPI `v7.2.144` 存在 `/v1/responses` 路由和搜索事件翻译源码，但 native `web_search`、完整来源、过滤器和不同模型路径的端到端透传仍未获真实请求证明。当前环境没有可用服务或安全凭据，因此将实际认证工作推进到 [运行 OpenAI 与 CLIProxyAPI 实际契约探测](12-run-live-contract-probe.md)。
