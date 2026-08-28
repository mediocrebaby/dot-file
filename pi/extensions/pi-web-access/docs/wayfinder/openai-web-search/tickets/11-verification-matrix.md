---
id: WF-OPENAI-WEB-SEARCH-11
title: 确定兼容性与验证矩阵
parent: ../map.md
labels:
  - wayfinder:grilling
status: open
assignee:
blocked_by:
  - WF-OPENAI-WEB-SEARCH-02
  - WF-OPENAI-WEB-SEARCH-03
  - WF-OPENAI-WEB-SEARCH-04
  - WF-OPENAI-WEB-SEARCH-05
  - WF-OPENAI-WEB-SEARCH-06
  - WF-OPENAI-WEB-SEARCH-07
  - WF-OPENAI-WEB-SEARCH-08
  - WF-OPENAI-WEB-SEARCH-09
  - WF-OPENAI-WEB-SEARCH-10
---

## Question

实现交付必须具备哪些自动化单元、夹具契约、错误与取消、凭据脱敏、SSRF、curator、存储、`source_check`、配置兼容和文档检查；哪些 OpenAI 与 CLIProxyAPI 路径需要可选的真实 smoke test，采用什么版本记录和证据才足以称为支持？

## Resolution comments

### 2026-08-28 — 自动化矩阵已建立，待 live probe 完成最终验证

Node test suite 覆盖 Responses 请求体/头、source/citation 归一化、citation-only 代理夹具、凭据优先级、header allowlist、secret redaction、HTTPS/loopback/私网/URL 安全、domain fidelity、recency prompt、result cap、无凭据、DNS/fetch timeout 与 cancel、逐查询回退、显式 DuckDuckGo 隔离、双失败归因、curator 实际 provider、session storage 兼容和 mixed-provider research artifact。TypeScript 全量 typecheck 纳入交付检查。

可选真实 smoke test 由 `evidence/openai-web-search-contract-probe.mjs` 提供，输出只保留脱敏状态、事件类型和来源 hostname。未生成 live evidence 时，只能称 OpenAI 官方契约已实现、CLIProxyAPI 为候选兼容路径。
