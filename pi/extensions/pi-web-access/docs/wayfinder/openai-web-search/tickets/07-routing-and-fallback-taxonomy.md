---
id: WF-OPENAI-WEB-SEARCH-07
title: 确定逐查询路由与静默回退规则
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

在已确定的 OpenAI → DuckDuckGo、逐查询、无专门用户提示的原则下，每种凭据、网络、HTTP、协议、能力、空结果、过滤器、安全和取消错误应如何分类；是否允许重试、何时立即回退、怎样避免重复计费或把主动取消误当失败，并如何保持显式 DuckDuckGo 路由不触碰 OpenAI？

## Resolution comments

### 2026-08-28 — 保守实现已完成，待 live probe 后决议

`auto` 和 `openai` 每个 query 先尝试一次 OpenAI，eligible failure 后尝试一次 DuckDuckGo；显式 `duckduckgo` 从不触碰 OpenAI。无自动 OpenAI retry，避免重复计费。成功响应始终记录实际 provider。

可回退：无凭据、401/403、408/内部 timeout、429、网络错误、5xx、unsupported/capability、协议错误、无来源和 domain fidelity 失败。不回退：调用者取消、非法本地参数、endpoint 安全拒绝、配置错误和显式 credential-source 解析失败。双提供器都失败时保留两个脱敏 attempt，并以 `mixed` 归因失败链。
