---
name: wayfinder
description: 跨多个会话的大型模糊任务：建立决策地图、依赖前沿，逐项澄清路线；小任务不建地图，默认只规划不实施。
---

# 寻路：先搞清楚怎么走

当工作超出一次会话且存在未决问题时使用。目标是让通向 destination 的路线清楚，而不是直接完成产品。路线已清楚或任务很小时，返回普通计划，不建地图。

先读 [pi 宿主适配](../_maintenance/PI-RUNTIME.md) 与 [tracker 适配](references/tracker.md)。依用户已有 tracker；缺失时使用本地 Markdown，不要求运行其他宿主的设置命令。

## 地图与任务的职责

地图描述 destination、范围、已决问题的具名链接、尚无法具体描述的未知区。每个 ticket 解决一个问题，大小适合一次会话。

- 精确问题已有答案依赖：现在建 ticket 并标阻塞。
- 连问题还说不清：先放 Not yet specified，后续再细化。
- 明确不在目标内：放 Out of scope，不当成待办。
- 地图只是一份索引；调查详情在 ticket。长期工程约束交给 [decision-notes](../decision-notes/SKILL.md)，ticket 链接过去，不复制维护第二份。

地图骨架：

```markdown
# <目标名称>
## Destination
<什么状态意味着路线已经清楚>
## Notes
<范围、用户偏好、每次会话要读的材料>
## Decisions so far
- [已解决问题的名称](<ticket-link>)：一句摘要
## Not yet specified
<目前无法具体拆解的未知区>
## Out of scope
<明确排除及原因>
```

票据至少包含 Question、Type、Blocked by、Status、Owner、Resolution。Type 为 research / prototype / grilling / task。

- research：查外部或环境事实。先探测可用工具；较大独立调查可委派只读 explorer，禁止虚构 research skill 或配置。
- prototype：与用户一起验证可交互产物，读取 [prototype](../prototype/SKILL.md)。
- grilling：默认的取舍访谈，读取 [grilling](../grilling/SKILL.md)；涉及术语再读 [domain-modeling](../domain-modeling/SKILL.md)。Agent 不代替用户回答。
- task：为一个决定清除事实前置条件，例如准备测试夹具。不是借规划名义交付整个产品。

## 模式一：画地图

1. 按 grilling 的依赖前沿确定 destination 和范围，用户已有确认不重复问。
2. 广度优先找到未决问题及直接前置条件，不预先展开未知区。
3. 按已授权范围创建地图和能说清的问题；外部发布须已获授权，否则留本地草稿。
4. 先创建票据身份，再连阻塞关系，检查无环与引用存在。frontier 是开放、未认领且所有 blocker 已完成的任务。
5. 可并行启动已授权的独立只读调查。票据/地图由一个写入者维护；子 agent 返回证据，不替父会话关票。
6. 交付地图路径、当前 frontier 和未决问题。建图阶段不顺手实施。

## 模式二：推进地图

1. 读地图，不全量加载所有历史。
2. 用户指定 ticket 时处理它；否则从 frontier 选择一个。在实际 tracker 中记录 owner 认领；本地并发规则见 tracker 文档。
3. 按类型调查、做原型或访谈。事实先查；取舍由用户确认。
4. 记录答案、证据和仍存在的缺口。持久决定按 decision-notes 维护；确认设计仍不等于 implemented。
5. 只有该问题已解决才关闭 ticket；待验证、等待用户或被阻塞的 ticket 不提前关闭。关闭“决定任务”不代表实施完成。
6. 地图补具名链接；新暴露的问题先创建再连边。越界事项记录 Out of scope 并说明为何关闭。
7. 一次会话默认只手动解决一个 ticket；独立 research 可以并行收敛。仅当用户明确扩展范围时继续，保留清楚的交接点。

## 完成条件

destination 范围内没有未决或隐含选择；明确列出后续实施交接和非目标项。报告真实产物路径、已验证事实及剩余风险，不宣称代码已交付。凭据不写入地图或 Resolution。
