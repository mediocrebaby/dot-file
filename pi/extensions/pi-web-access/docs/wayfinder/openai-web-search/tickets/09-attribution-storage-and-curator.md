---
id: WF-OPENAI-WEB-SEARCH-09
title: 确定 curator、存储与证据归因
parent: ../map.md
labels:
  - wayfinder:grilling
status: open
assignee:
blocked_by:
  - WF-OPENAI-WEB-SEARCH-06
  - WF-OPENAI-WEB-SEARCH-07
---

## Question

在不新增专门回退通知的前提下，最终实际提供器、默认 curator 标签、活动监控、session storage、`source_check` artifact、错误条目和恢复后的历史结果应记录和展示哪些信息，才能保持现有归因契约并避免将 DuckDuckGo 结果误标为 OpenAI？

## Resolution comments

### 2026-08-28 — 实现与验证已完成，待上游 blocked tickets 关闭

`QueryResultData.provider`、session storage、curator 结果卡和活动监控均使用实际 provider。Curator 新增 OpenAI、DuckDuckGo、mixed/unknown 标签；错误路径不再用默认 provider 猜测。成功回退不新增专门用户提示，但最终结果显示 DuckDuckGo 归因。

`source_check` 为每个 `ResearchSource` 保存 provider；同一 artifact 同时包含 OpenAI 与 DuckDuckGo 来源时顶层 provider 为 `mixed`。错误条目可保存 provider/category，旧 session 缺失 provider 时保持兼容并按 unknown 展示。
