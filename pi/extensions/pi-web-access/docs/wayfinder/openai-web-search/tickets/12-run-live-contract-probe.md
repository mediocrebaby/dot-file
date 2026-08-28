---
id: WF-OPENAI-WEB-SEARCH-12
title: 运行 OpenAI 与 CLIProxyAPI 实际契约探测
parent: ../map.md
labels:
  - wayfinder:task
status: open
assignee:
hitl: true
blocked_by: []
context_pointers:
  - ../../../research/openai-web-search-cli-proxyapi-contract.md
---

## Question

在不暴露凭据的授权环境中，启动或提供 OpenAI 直连与 CLIProxyAPI `v7.2.144` 的可用测试通道，按研究资产中的清单对非流式 Responses Web Search、`gpt-5.5`、`gpt-5.6-sol`、来源 include、过滤器、鉴权错误、空来源和取消进行实际探测，并保存足以供后续决策使用的脱敏状态码、事件类型和响应夹具。

## Resolution comments

### 2026-08-28 — Probe harness 已准备，等待授权通道

已新增 `evidence/openai-web-search-contract-probe.mjs` 和运行说明 `evidence/OPENAI-WEB-SEARCH-CONTRACT-EVIDENCE.md`。脚本覆盖非流式 native `web_search`、完整来源 include、allowed/blocked domains、空/无匹配来源、缺失/无效鉴权和客户端取消；输出记录目标版本与 wire API，并只保存状态码、顶层键、事件类型、来源/citation hostname、耗时和脱敏错误。基线无完整来源时标记为 `inconclusive` 并非零退出。

当前环境仍没有可安全使用的 OpenAI/CLIProxyAPI probe key，也没有已确认运行中的 CLIProxyAPI `v7.2.144` 授权通道，因此本票保持 open/hitl。不得在没有用户提供授权环境的情况下伪造 live evidence 或把候选网关路径称为已认证。
