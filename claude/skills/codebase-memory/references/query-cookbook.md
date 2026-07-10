# query_graph 速查手册

`query_graph(project, query="<Cypher>")` 用于 `search_graph` / `trace_path` 表达不了的多跳模式、聚合、跨服务分析和性能审计。返回含 `total`（返回行数）；有 10 万行硬顶——宽查询在 Cypher 里自己加 `LIMIT`，或改用 `search_graph` 的 `offset`/`limit` 翻页。

## 目录

- [基础模式](#基础模式)
- [跨服务 / HTTP](#跨服务--http)
- [性能与复杂度审计](#性能与复杂度审计)
- [节点复杂度属性参考](#节点复杂度属性参考)

## 基础模式

```cypher
// 按名称正则找函数
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path

// main 直接调用了谁
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name

// 某函数的所有调用方（含调用方文件）
MATCH (a)-[:CALLS]->(b:Function) WHERE b.name = 'saveUser'
RETURN a.name, a.file_path
```

## 跨服务 / HTTP

```cypher
// 实际的 HTTP 调用边（search_graph 只能按度数过滤，看不到边本身）
MATCH (a)-[r:HTTP_CALLS]->(b)
RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20

// 异步 / 消息通道边
MATCH (a)-[r:ASYNC_CALLS]->(b) RETURN a.name, b.name, r.channel LIMIT 20
```

## 性能与复杂度审计

每个 Function / Method 节点都带算好的复杂度属性，一条 Cypher 就能捞出全部热点候选：

```cypher
// 热点总扫描：深层嵌套循环 或 循环内线性查找（隐藏的 O(n²)）
MATCH (f:Function)
WHERE f.transitive_loop_depth >= 3 OR f.linear_scan_in_loop >= 1
RETURN f.qualified_name, f.transitive_loop_depth, f.linear_scan_in_loop
ORDER BY f.transitive_loop_depth DESC

// 圈复杂度 / 认知复杂度最高的函数（重构候选）
MATCH (f:Function)
RETURN f.qualified_name, f.complexity, f.cognitive
ORDER BY f.complexity DESC LIMIT 20

// 无守卫的递归（潜在栈溢出）
MATCH (f:Function) WHERE f.unguarded_recursion = true
RETURN f.qualified_name

// 循环内分配 / 循环内递归
MATCH (f:Function)
WHERE f.alloc_in_loop >= 1 OR f.recursion_in_loop = true
RETURN f.qualified_name, f.alloc_in_loop, f.recursion_in_loop
```

## 节点复杂度属性参考

| 属性 | 含义 |
|---|---|
| `complexity` | 圈复杂度 |
| `cognitive` | 认知复杂度 |
| `loop_count` | 循环数量 |
| `loop_depth` | 本函数内最大嵌套循环深度（多项式次数的近似） |
| `transitive_loop_depth` | 沿 CALLS 边传播的过程间最坏嵌套循环次数 |
| `linear_scan_in_loop` | 循环内 find/contains/indexOf 式线性扫描次数（loop_depth 抓不到的隐藏 O(n²)） |
| `alloc_in_loop` | 循环内的分配 / append 次数 |
| `recursion_in_loop` | 循环内存在自调用 |
| `unguarded_recursion` | 递归但无带条件守卫的基线情形 |
| `recursive` | 递归标记 |
| `param_count` | 参数个数（结构坏味） |
| `max_access_depth` | 最大成员访问深度（结构坏味） |
