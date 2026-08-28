---
id: WF-OPENAI-WEB-SEARCH-08
title: 确定超时、取消与资源预算
parent: ../map.md
labels:
  - wayfinder:grilling
status: open
assignee:
blocked_by:
  - WF-OPENAI-WEB-SEARCH-01
  - WF-OPENAI-WEB-SEARCH-04
  - WF-OPENAI-WEB-SEARCH-12
---

## Question

OpenAI 搜索请求应采用什么超时、搜索上下文、来源数量、token 或工具预算，以及怎样贯穿 `AbortSignal`；这些预算如何与多查询串行流程、curator 生命周期、回退后的 DuckDuckGo 请求和潜在 API 成本协调？

## Resolution comments

### 2026-08-28 — 保守实现已完成，待 live probe 后决议

OpenAI 每 query 默认 30 秒，可配置 1–120 秒；调用者 `AbortSignal` 与内部 timeout 使用独立信号和错误类别。调用者取消立即传播且不回退，provider timeout 可回退；同一 signal 继续贯穿 DuckDuckGo fallback。多查询维持现有串行流程和 DuckDuckGo pacing。

请求固定非流式、`tool_choice: "required"`、默认 `search_context_size: "medium"`，输出上限 1200 tokens。实现不自动 retry、不启用 unlimited returned-token budget，也不改变 curator 自身 idle 生命周期。
