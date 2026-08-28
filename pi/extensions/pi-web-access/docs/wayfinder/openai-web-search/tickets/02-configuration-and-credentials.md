---
id: WF-OPENAI-WEB-SEARCH-02
title: 确定 OpenAI 搜索配置与凭据优先级
parent: ../map.md
labels:
  - wayfinder:grilling
status: closed
assignee:
blocked_by: []
---

## Question

公共配置应如何表达 OpenAI Web Search 的 API 基址、API Key、模型、额外受控请求头和超时；配置文件、显式 credential source 与兼容环境变量之间采用什么优先级，才能同时覆盖 OpenAI 直连和 CLIProxyAPI，而不与摘要模型或其他提供器的凭据混淆？

## Resolution comments

### 2026-08-28 — 配置与凭据决策已实现

公共配置采用 `webSearch.provider` 与 `webSearch.openai`：后者包含 `channel`、`baseUrl`、`apiKey`、`model`、`timeoutSeconds`、`searchContextSize` 和受控 `headers`。调用参数优先于 `webSearch.provider`，随后兼容顶层 `searchProvider`、`provider`，默认 `auto`。

OpenAI Key 优先级为：显式 `$ENV`/`!command` source → `PI_WEB_SEARCH_OPENAI_API_KEY` → `OPENAI_API_KEY` → literal 配置。显式 source 失败不会退回陈旧环境变量，也不会借用摘要模型 registry、Codex OAuth、浏览器 Cookie 或 `auth.json`。Base URL/model 采用配置 → 专用环境变量 → 兼容环境变量/默认值。
