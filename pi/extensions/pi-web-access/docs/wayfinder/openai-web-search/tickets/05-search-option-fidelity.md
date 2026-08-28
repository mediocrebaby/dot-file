---
id: WF-OPENAI-WEB-SEARCH-05
title: 确定搜索选项的跨提供器语义
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

现有 `numResults`、`recencyFilter`、`domainFilter`、查询文本和 `includeContent` 在 OpenAI Web Search 中应如何映射；当 OpenAI 或 CLIProxyAPI 无法严格表达某项约束时，是客户端裁剪、提示词约束、直接回退 DuckDuckGo，还是明确降级为 best-effort，才能避免表面兼容但语义失真？

## Resolution comments

### 2026-08-28 — 保守实现已完成，待 live probe 后决议

`numResults` 在归一化后客户端裁剪，最大 20。非法 `domainFilter` 在 provider 调用前拒绝且不回退；合法项归一化为 `filters.allowed_domains` / `filters.blocked_domains`；返回 URL 会再次校验，若 provider 未遵守则触发 DuckDuckGo 回退，避免静默失真。OpenAI 每类 domain 上限 100，超限按能力不足回退。

Responses 没有独立 recency 字段，`recencyFilter` 以明确的内部提示词约束传递并在文档中标为 best-effort。`includeContent` 不进入 OpenAI 请求，仍只对实际 provider 的最终来源运行现有内容抓取链。
