---
name: codebase-memory
description: 用代码知识图谱（codebase-memory MCP：search_graph / get_code_snippet / trace_path / detect_changes / query_graph 等）查询代码库的结构与关系，返回结构化结果约 500 token，等效 grep 往往要烧 80K token 且仍会漏掉调用边。这些 MCP 工具优先于内置 Read/Grep/Glob——查符号别用 Grep、读某个函数的实现别直接 Read 整个文件、排查影响别用 Grep/Search。TRIGGER：接触任意已有代码库的第一步探索；用户说"看看这个项目/这是干嘛的/讲下架构/代码怎么组织的/带我熟悉一下"；动手改代码前摸清相关模块；定位符号（X 定义在哪、有哪些函数/类/接口/handler/路由）；读某个函数或类的实现；调用关系（谁调用了 X、X 调用了什么、调用链、依赖、跨服务 HTTP 调用、数据流）；影响分析（改这里会波及谁、git diff/PR 影响了哪些符号）；代码质量与性能（死代码、未使用函数、高扇入/扇出、圈复杂度、嵌套循环、O(n²) 热点、重构候选、审计）；以及 search_graph/query_graph 用法、Cypher 示例、边类型。SKIP：已有精确文件路径且只需读单个文件的某一段；非代码仓库（纯文档/配置）；索引不存在且用户拒绝建索引。
---

# Codebase Memory — 代码知识图谱

图工具把"结构与关系"问题变成一次精确查询：约 500 token 拿到结构化答案；换成 grep 往往要烧 80K token，而且仍会漏掉真实调用边、间接分发和跨服务调用。

## 一条硬规则：代码导航走图工具，别退回内置工具

**本技能一旦加载，本次任务里所有"查代码结构 / 关系 / 实现"的动作都走 MCP 图工具，而不是内置 Read/Grep/Glob。** 这不是"看情况优先"，而是默认路径反转——内置工具是例外，只在下方 SKIP 情形才用。

每次准备按下 Grep 或 Read 前，先自检一句：**这个问题图工具能不能答？能就用图工具。** 要主动纠正的三个默认倾向：

- 想 Grep 找符号定义 → 改 `search_graph`
- 想 Read 打开整个文件看某个函数 → 改 `get_code_snippet`
- 想 Grep 找"谁调用了它 / 改了会影响谁" → 改 `trace_path` / `detect_changes`

## 默认动作 → 替换

| 你正想做 | 别用 | 改用 | 为什么内置工具在这里不够 |
|---|---|---|---|
| 找符号 / 定义 / 实现在哪 | Grep/Glob | `search_graph(query="自然语言描述")` | 结构化、按结构重要性排序、约 500 token；grep 只给一堆原始行，还得再逐个 Read |
| 读某函数 / 类的源码 | Read 整个文件 | `get_code_snippet(qualified_name 或短名)` | 直接拿到该符号的精确片段；`include_neighbors=true` 还能连调用方/被调用方一起返回 |
| 谁调用了 X / 调用链 / 影响面 | Grep | `trace_path(direction="inbound")` | grep 只匹配文本，漏掉真实调用边与间接分发，且没有深度和链路 |
| 一处改动 / PR 会波及谁 | Grep 逐个查 | `detect_changes()` | 把 git diff 映射到受影响符号并算传递影响；grep 算不出传递闭包 |
| 跨服务 / HTTP 调用 | Grep | `trace_path(mode="cross_service")` | grep 连不起 client 调用与 server 路由 |
| 某个值流向了哪里 | Grep | `trace_path(mode="data_flow")` | 沿数据流边追参数传播，带每一跳的实参 |
| 性能 / 复杂度热点 | 读代码人肉找 | `query_graph`（圈复杂度、嵌套循环等属性） | 图上已算好指标，一条 Cypher 全捞出，见 references/query-cookbook.md |
| 找字面量 / 配置 / 注释文本 | Grep | `search_code`（图增强 grep） | 把匹配去重到所属函数、按结构重要性排序 |

## 起手式

不确定项目是否已索引时，第一步是 `list_projects`（不是 Grep）。所有工具都需要 `project` 参数，名字从这里拿：

- 已索引 → 直接用图工具
- 未索引 → 询问用户是否 `index_repository`；用户拒绝才退回 Grep/Glob

## 读源码：两步一气呵成，别中途退回 Read

1. `search_graph(project, query="...")` 定位 → 拿到 `qualified_name`
2. `get_code_snippet(project, qualified_name)` 读实现

**拿到 qualified_name 后就用 get_code_snippet 读，别去打开文件。** 它返回该符号的精确片段，`include_neighbors=true` 还能把调用方/被调用方一并带回。get_code_snippet 也直接接受短函数名（不唯一时返回候选），所以很多时候第一步都能省掉、一步到位。

## 决策速查（带真实参数）

- 谁调用 X：`trace_path(function_name, project, direction="inbound")`
- X 调用了什么：`trace_path(..., direction="outbound")`
- 完整调用上下文：`direction="both"`（默认；单用 outbound 会漏掉跨服务调用方）
- 自然语言找代码：`search_graph(query="update settings")`（BM25，首选）
- 词汇对不上时：`search_graph(semantic_query=["send","publish","pubsub"])`（必须是数组）
- 名称正则：`search_graph(name_pattern=".*Handler.*")`
- 死代码：`search_graph(max_degree=0, exclude_entry_points=true)`
- 高扇出/扇入：`search_graph(min_degree=10, relationship="CALLS", direction="outbound" / "inbound")`
- 分支/本地变更影响：`detect_changes(since="HEAD~5")` 或 `detect_changes(base_branch="main")`
- 架构总览：`get_architecture`（含 Leiden 社区聚类，看真实模块边界）
- 复杂 Cypher / 性能分析：`query_graph`，模式和示例见 **references/query-cookbook.md**

## SKIP：这些情形才用内置工具

- 已有精确文件路径、只需读单个文件的某一段 → Read
- 纯文档 / 配置等非代码仓库
- 项目未索引且用户拒绝建索引 → 退回 Grep/Glob

## 注意事项

1. `search_graph` 结果默认上限 200；检查 `total` / `has_more`，用 `offset` 翻页。
2. `search_graph(relationship=...)` 是按度数过滤节点；要看**实际的边**请用 `query_graph` 的 Cypher。
3. `trace_path` 需要精确函数名；先 `search_graph(name_pattern=...)` 确认。
4. `query_graph` 有 10 万行硬顶；宽查询自己在 Cypher 里加 `LIMIT`。
5. `search_code` 无 offset；要更多结果就调大 `limit` 或用 `file_pattern` / `path_filter` 收窄。

## 工具与边类型

14 个工具：index_repository, index_status, list_projects, delete_project, search_graph, search_code, trace_path, detect_changes, query_graph, get_graph_schema, get_code_snippet, get_architecture, manage_adr, ingest_traces

边类型：CALLS, HTTP_CALLS, ASYNC_CALLS, DATA_FLOWS, IMPORTS, DEFINES, DEFINES_METHOD, HANDLES, IMPLEMENTS, OVERRIDE, USAGE, FILE_CHANGES_WITH, CONTAINS_FILE, CONTAINS_FOLDER, CONTAINS_PACKAGE
