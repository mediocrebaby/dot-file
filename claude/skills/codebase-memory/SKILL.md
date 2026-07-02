---
  ## name: codebase-memory
  description: 使用代码库知识图谱进行结构化代码查询。触发场景：探索代码库、理解架构、有哪些函数、展示结构、谁调用了这个函数、X 调用了什么、追踪调用链、查找调用方、展示依赖、影响分析、死代码、未使用函数、高扇出、重构候选、代码质量审计、图查询语法、Cypher 查询示例、边类型、如何使用 search_graph。
---

# Codebase Memory — 知识图谱工具

  图工具可以返回精确的结构化结果，约 500 个 token；相比之下，使用 grep 可能需要约 80K 个 token。

## 快速决策矩阵

   问题                工具调用
  ━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   谁调用了 X？        trace_path(direction="inbound")
  ──────────────────  ───────────────────────────────────────────────────────
   X 调用了什么？      trace_path(direction="outbound")
  ──────────────────  ───────────────────────────────────────────────────────
   完整调用上下文      trace_path(direction="both")
  ──────────────────  ───────────────────────────────────────────────────────
   按名称模式查找      search_graph(name_pattern="...")
  ──────────────────  ───────────────────────────────────────────────────────
   死代码              search_graph(max_degree=0, exclude_entry_points=true)
  ──────────────────  ───────────────────────────────────────────────────────
   跨服务边            使用 Cypher 调用 query_graph
  ──────────────────  ───────────────────────────────────────────────────────
   本地变更影响        detect_changes()
  ──────────────────  ───────────────────────────────────────────────────────
   按风险分类的追踪    trace_path(risk_labels=true)
  ──────────────────  ───────────────────────────────────────────────────────
   文本搜索            search_code 或 Grep

## 探索工作流

1. list_projects — 检查项目是否已建立索引
2. get_graph_schema — 了解节点和边类型
3. search_graph(label="Function", name_pattern=".*Pattern.*") — 查找代码
4. get_code_snippet(qualified_name="project.path.FuncName") — 阅读源码

## 追踪工作流

1. search_graph(name_pattern=".*FuncName.*") — 找到精确名称
2. trace_path(function_name="FuncName", direction="both", depth=3) — 进行追踪
3. detect_changes() — 将 git diff 映射到受影响的符号

## 质量分析

- 死代码：search_graph(max_degree=0, exclude_entry_points=true)
- 高扇出：search_graph(min_degree=10, relationship="CALLS", direction="outbound")
- 高扇入：search_graph(min_degree=10, relationship="CALLS", direction="inbound")

## 14 个 MCP 工具

  index_repository, index_status, list_projects, delete_project,
  search_graph, search_code, trace_path, detect_changes,
  query_graph, get_graph_schema, get_code_snippet, get_architecture,
  manage_adr, ingest_traces

## 边类型

  CALLS, HTTP_CALLS, ASYNC_CALLS, IMPORTS, DEFINES, DEFINES_METHOD,
  HANDLES, IMPLEMENTS, OVERRIDE, USAGE, FILE_CHANGES_WITH,
  CONTAINS_FILE, CONTAINS_FOLDER, CONTAINS_PACKAGE

## Cypher 示例（用于 query_graph）

  MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
  MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path
  MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name

## 注意事项

1. `search_graph(relationship="HTTP_CALLS")` 是按度数过滤节点；若要查看实际边，请使用带 Cypher 的 `query_graph`
2. `query_graph` 最多返回 200 行；如需计数，请使用带度数过滤的 `search_graph`。
3. `trace_path` 需要精确名称；请先使用 `search_graph(name_pattern=...)`。
4. `direction="outbound"` 会漏掉跨服务调用方；请使用 `direction="both"`。
5. 结果默认每页 10 条；请检查 `has_more` 并使用 `offset`。-
