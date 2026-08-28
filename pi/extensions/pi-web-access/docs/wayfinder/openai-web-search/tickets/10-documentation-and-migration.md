---
id: WF-OPENAI-WEB-SEARCH-10
title: 确定用户文档与配置迁移规则
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
  - WF-OPENAI-WEB-SEARCH-07
  - WF-OPENAI-WEB-SEARCH-09
---

## Question

README、工具 schema、配置示例、包描述和限制说明应怎样解释新的默认 OpenAI → DuckDuckGo 行为、零凭据回退、CLIProxyAPI 基线、本地网关安全要求及旧 `provider`/`searchProvider` 配置，才能避免把 OpenAI Web Search 错称为 Codex 专用 API或破坏已有显式 DuckDuckGo 用户？

## Resolution comments

### 2026-08-28 — 文档实现已完成，待上游 blocked tickets 关闭

README、SECURITY、工具 schema、配置示例和 package 描述现统一称为 OpenAI Web Search / Responses `web_search`，默认行为为 OpenAI → DuckDuckGo，零凭据仍可直接工作。显式 `provider: "duckduckgo"` 保持旧行为；`webSearch.provider` 为新首选配置，顶层 `searchProvider` / `provider` 继续兼容读取。

文档说明了 CLIProxyAPI loopback 安全边界、候选版本/模型而非全量认证、受控 header、credential 优先级、recency best-effort，以及 `fetch_content`、视频、Gemini、Firecrawl 链不受影响。
