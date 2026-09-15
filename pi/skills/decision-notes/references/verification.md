# 验证、归档与限制

运行 Python 3.10+ 自带检查器 `scripts/notes.py`，路径相对 skill 根。命令始终带 `--project`，输出 JSON，失败非零退出。

## 验证

`verify` 自动发现 .agents/notes、docs/adr、docs/decisions；多处存在时要求 --root，不猜。空库返回 status=skipped，并说明未覆盖记录；任务确实需要记录时加 --require-record，空活跃区失败；ADR 的 README/INDEX 等说明文件不计作决定。它不能判断 diff 是否重要，也不能证明此次改动有对应的记录，提交者仍须核对归属。

notes：目录/真实日期/状态/必需非空小节/占位正文/提案标题/文件链接/归档头部与原始字节封印。既有 ADR：只查标题与本项目内文件链接，不强套格式。正文时态、理由、备选真实性、外部网页和标题锚点不由脚本保证。

归档封印格式兼容 version=1、files={归档相对路径: sha256:...}。使用原始字节计算，不静默归一化换行。跨平台仓库应在归档前审视 .gitattributes，例如为归档区设置 `-text`，避免 Git 自动换行修改历史快照；不要在检查器中掩盖真实差异。

有 Git 时默认对比 HEAD 的既有 manifest。CI 必须显式 --base-ref 指向变更前提交，并完整获取该提交；无效基线报错，不当成“历史没有 manifest”。新仓库无提交、无 Git 时明确提示仅做自一致性检查，不承诺防止文件与哈希一起被改。

## 归档

先确认旧 implemented 不再约束当前行为，新 implemented 接管其仍有价值的理由。已有 ADR 不运行此命令，沿用自身生命周期。

```bash
python '<skill-dir>/scripts/notes.py' archive --project '<project-root>' --source '.agents/notes/implemented/architecture/<old>.md' --superseded-by '.agents/notes/implemented/architecture/<new>.md'
```

默认只返回计划，不落盘。修复报告的活跃入站链接：指向继任决定，而不是还不存在的归档路径。再次预检通过，用户授权归档后加 --apply。

执行前验证决策库与既有 manifest，扫描整个项目 Markdown 入站引用（含根 README/其他 docs，排除 VCS、依赖、构建目录和冻结区）；检查源/继任均为 implemented、无同名目标、无遗留入站链接。损坏 manifest 直接失败，绝不重建抹去历史。执行只给旧篇插入 Archived 行（保留 BOM/CRLF），生成封印，在继任篇追加历史链接，移除旧活跃文件，然后再次验证。

每个写入使用临时文件替换，捕获到异常时恢复修改前内容；这不是跨多个文件的断电事务。归档前保留 Git/备份，单写入者串行操作，进程被强杀或磁盘损坏后要人工检查恢复。命令不自动提交、不批量删除历史；代码注释和非 Markdown 引用仍需人工同步。
