---
id: WF-OPENAI-WEB-SEARCH-04
title: 确定模型选择与搜索能力探测策略
parent: ../map.md
labels:
  - wayfinder:grilling
status: open
assignee:
blocked_by:
  - WF-OPENAI-WEB-SEARCH-01
  - WF-OPENAI-WEB-SEARCH-12
---

## Question

OpenAI Web Search 应采用什么默认模型与覆盖规则，并如何判断直连或 CLIProxyAPI 路径确实支持 native `web_search`、来源返回和所需选项；模型别名、代理版本漂移或能力缺失时，是预检、请求后分类回退还是维护兼容矩阵？

## Resolution comments

### 2026-08-28 — 保守实现已完成，待 live probe 后决议

OpenAI 直连默认 `gpt-5.6`；`channel: "cliproxyapi"` 必须显式配置模型。实现不调用 `/models` 预检，也不把模型别名或代理版本当作能力证明。每个查询直接发送 native `web_search` 契约，再按 HTTP、JSON、来源和过滤器结果分类。

Unsupported model/tool/options、协议不兼容、畸形 JSON、无可归因来源和过滤器未被遵守均属于可回退能力失败。CLIProxyAPI `v7.2.144`、`gpt-5.5`、`gpt-5.6-sol` 仍只是待 live probe 的候选基线，文档不宣称普遍兼容。
