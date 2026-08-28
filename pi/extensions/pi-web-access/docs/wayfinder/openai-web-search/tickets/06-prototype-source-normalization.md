---
id: WF-OPENAI-WEB-SEARCH-06
title: 原型化 Responses 来源归一化
parent: ../map.md
labels:
  - wayfinder:prototype
status: open
assignee:
blocked_by:
  - WF-OPENAI-WEB-SEARCH-01
  - WF-OPENAI-WEB-SEARCH-12
---

## Question

基于已验证的 OpenAI 与 CLIProxyAPI 脱敏夹具，怎样把 Responses 的消息、`web_search_call`、来源列表和 URL 引用粗略归一化为现有 `answer` 与 `SearchResult { title, url, snippet }`，并处理重复来源、缺失标题、引用不完整、无来源回答和代理事件差异，使最终行为足够具体可供人评审？

## Resolution comments

### 2026-08-28 — 原型与实现已完成，待 live probe 夹具确认

`openai-web-search.ts` 拼接所有 `message.content[].output_text` 作为 answer；先收集 `web_search_call.action.sources`，再用 `url_citation` 补充标题、引用片段和缺失 URL。URL 去 fragment 后按首次出现顺序去重，标题回退到 hostname，snippet 回退为空字符串。

已覆盖完整 source list、重复 URL、缺标题、citation-only 代理响应、无 `web_search_call`、畸形 JSON和无来源回答。只要 citation 有完整 HTTP(S) URL，代理丢失 `web_search_call` 仍可接受；没有任何可归因 URL 则回退。
