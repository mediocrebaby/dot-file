# Issue tracker: Local Markdown

本仓库的任务与规格保存在仓库根目录的 `.scratch/`，通过读写本地 Markdown 管理。

## 文件约定

- 每项功能使用独立目录：`.scratch/<feature-slug>/`。
- 规格保存为 `.scratch/<feature-slug>/spec.md`。
- 实现任务按文件拆分：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 编号，每个任务一个文件。
- 分诊状态在任务文件顶部附近以 `Status:` 行记录；状态值见 `triage-labels.md`。
- 评论和讨论按时间追加到文件底部的 `## Comments` 下。

## 当技能要求“发布到任务追踪系统”

在对应的 `.scratch/<feature-slug>/` 下创建文件，按需创建目录。发布实现任务时，使用上述 `issues/<NN>-<slug>.md` 路径。

## 当技能要求“获取相关任务”

读取用户指定路径的完整文件。仅提供编号时，在相关功能目录中查找；跨功能存在重号且上下文无法确定时，请用户指定路径。

## Wayfinding operations

供 `wayfinder` 使用。规划地图及决策任务与实现任务分开使用功能目录；决策任务采用以下认领与完成状态，而非分诊状态。

- **Map**：`.scratch/<effort>/map.md`，保存目标、说明、决策索引和尚未明确的问题。
- **Child ticket**：`.scratch/<effort>/issues/<NN>-<slug>.md`，从 `01` 编号，正文记录待解决的问题。`Type:` 为 `research`、`prototype`、`grilling` 或 `task`。未认领时省略 `Status:`，认领后为 `claimed`，完成后为 `resolved`。
- **Blocking**：在顶部附近用 `Blocked by: NN, NN` 记录同一目录中的阻塞任务编号；所有阻塞任务均为 `resolved` 时解除阻塞。无阻塞时省略该行。
- **Frontier**：扫描该地图的 `issues/`，筛选未完成、无未解决阻塞且未认领的任务，按编号选择第一个。
- **Claim**：开始工作前，先写入并保存 `Status: claimed`。
- **Resolve**：在 `## Answer` 下追加结论，设置 `Status: resolved`，并在 `map.md` 的 `## Decisions so far` 中追加任务名称、相对链接与一句话摘要；详细结论保留在任务文件中。
