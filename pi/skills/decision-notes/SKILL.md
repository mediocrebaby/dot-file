---
name: decision-notes
description: 在确认技术取舍、形成非显然约束、修复易复发问题或取代旧决定时，检索并维护项目已有 ADR/Notes；机械小改不新建记录。
---

# 工程决策维护

记录下一位维护者无法仅从代码和测试恢复的理由，不记录聊天流水账。本 skill 管决定，不负责替用户拍板、排任务、自动提交或发布。

## 1. 先判断是否需要写

- 排版、错字、无歧义机械改名、看局部 diff 即懂的修复：不新建记录。若改动使旧记录中的路径/符号失真，仍同步那处事实。
- 真正比较过路线，形成隐含安全/所有权/时序约束，有容易重走的失败方案，或选择逆转成本高：检索后记录。
- 仅因修改了行为、文件很多或用户说“优化”不自动立 Note。判断依据是未来是否需要这些理由。
- 用户要求只读分析时，只给建议；写文件必须在用户授权任务的范围内。明确的实施请求已授权相关文档同步，不再机械地重复确认全部决定；遇到新增重大取舍才询问。

完成条件：给出免写、更新、新建或等待决策中的一种；不要为每次免写额外创建日志。

## 2. 找到唯一归属

先读项目指引，发现 `docs/adr/`、`docs/decisions/`、`.agents/notes/` 或指引指定的位置。存在多套时按作用域选择；仍不清楚就问，不创建第三套。

按机制/模块名检索活跃决定及 rejected。可用 `rg --hidden --glob '!**/archived/**' '<关键词>' '<决策根目录>'`。顺着相关引用读历史；archived 不是现行约束。事实自己查，只有选择交给用户。

- 已有归属且理由不变：原地同步事实，不另立篇、不追加流水账。
- 方向/理由翻转：新记录说明变化条件、继承仍适用的约束，关联前任。
- 部分覆盖：两篇保留，划清各自适用范围。
- 重复或过时：本次处理命中的重叠项；删除或迁移属于独立授权，不顺手批量清理。

## 3. 沿用宿主格式

已有 ADR：保持编号、目录、状态定义和模板，见 [格式与兼容](references/format.md)。不要把 `accepted` 自动解释为已实施，也不强迁到本 skill 格式。

没有记录体系：按需创建 `.agents/notes/<状态>/<类别>/yyyy-mm-dd-topic.md`。

- 状态：`proposed`、`implemented`、`rejected`、`archived`。
- 类别：`feature`、`bug-fix`、`architecture`、`process`、`testing`、`simplification`。普通保持行为的重构可归 simplification，不以代码行数减少作硬条件。
- 文件日期是首次提出日期。相同主题/日期冲突时加有意义的后缀，不覆盖。
- 模板：[提案](templates/proposed.md)、[落地决定](templates/implemented.md)、[否决](templates/rejected.md)。不要新建手工维护的总 INDEX；需要浏览时生成视图。

只记录真实考虑过的备选，先写对方最强理由，再写具体否决条件。没有额外备选就如实说明，不凑两个。后果同时写收益、代价和重访信号。

## 4. 同步生命周期与实现

确认方案 ≠ 完成实现。设计获准但代码尚未落地仍为 proposed。

实施后，与代码同批移动到 implemented，改状态、将 Proposal 改成现在时 Decision，将验收/计划折成真实 Verification 和 Consequences。未跑的验证明确写“未验证”和原因，不能写成通过。

否决时记录原因与防重犯价值；不值得长期保留的草稿不强制进 rejected。

完全取代时，新记录继承仍有价值的理由并引用前任；默认保留历史。归档仅用于不再约束当前实现的 implemented，需显式授权并按 [归档与验证](references/verification.md) 执行。不能直接编辑已冻结正文。

## 5. 验证并交接

先用宿主项目的检查命令；没有时运行本 skill 自带的 Python 3.10+ 检查器（将脚本路径解析为绝对路径，项目目录显式传入）：

```bash
python '<skill-dir>/scripts/notes.py' verify --project '<project-root>'
# 本任务确认必须有记录时，不能接受空库跳过；不代表自动判断 diff 是否重要。
python '<skill-dir>/scripts/notes.py' verify --project '<project-root>' --require-record
# 既有自定义 ADR 位置
python '<skill-dir>/scripts/notes.py' verify --project '<project-root>' --root docs/adr --layout adr
```

结构检查不判断理由真实性。用 [语义检查](references/quality.md) 检查问题、备选、代价和证据。交付只报记录路径、实际验证和仍存在的缺口。

代码、测试与对应记录属于同一逻辑提交；只有用户要求提交时交给 [committing-changes](../committing-changes/SKILL.md)。Issue 管执行，CONTEXT.md 管术语，其余位置链接到决定正文，不重复维护。

工具、跨 skill 加载及路径规则见 [pi 宿主适配](../_maintenance/PI-RUNTIME.md)。
