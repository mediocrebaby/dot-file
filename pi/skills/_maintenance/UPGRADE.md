# Skills 改造记录（2026-09-15）

状态：核心实施、自动化验证及多轮独立审查完成。提交前最终复审未发现 P0/P1 阻断。新会话模型行为、真实 Word 渲染及桌面完整构建尚未验收。

## 范围与备份

- 修改范围仅 `C:/Users/10094/Code/dot-file/pi/skills`，全局入口是链接 `C:/Users/10094/.pi/agent/skills`。
- 改造前 dot-file 工作区干净；全量备份：`C:/Users/10094/.pi/agent/backups/skills-20260915-145802/skills`。
- 保留原有 15 个 skill，新增 decision-notes；grill-me / grill-with-docs 改为手动入口。skills-lock.json、SYSTEM.md、settings、凭据未修改；没有自动提交/推送，没有搬迁用户数据。
- 参考 write-notes-like-deepseek 的生命周期、检索与门禁思想；适配后的 Python 检查器不依赖 tsx，也不复制其固定“所有行为变化必写/至少两个选项”的要求。

## 阶段一：pi 与工作区适配

- 以已安装 pi 0.85.1 实现核对发现、手动入口、相对资源读取与 /reload；修复跨 skill 的失效调用及缺失的外部设置命令。
- 资源/数据根分离：Python 数据路径统一到 workspace_paths；prompts 始终从资源根读。Web 启动接受 -Workspace，Tauri 分别定位资源和工作区，不再通过用户数据目录猜脚本路径。
- CLI dry-run 提前返回 JSON 预览，优先于 API 配置；不调用模型、不写文件、不推进轮次。
- AIGC 入口拆分工作区/对话/API/高级模式参考，保留中文两轮、英文一轮和单次单轮约束。
- DOCX 明确依赖探测、原件保护、结构与渲染验证区别；新增预检后安全解包，替代先解包再删除 symlink。

验证：先建立 5 项 AIGC 回归，基线全部失败（工作区错位、缺资源分离、dry-run 可进入真实执行）；修复后全部通过。测试使用临时目录与回显夹具，不代表语言改写质量测评。

## 阶段二：共享决策维护

- decision-notes 统一判断免写/更新/新建，事实变化不重复开篇，翻转决定不覆写旧理由。
- 保留已有 ADR 目录、编号、模板和状态语义；设计确认不当成实施完成。
- 连接 domain-modeling、grilling、原型、调试、提交、wayfinder 与 spec/tickets；Issue 管执行，CONTEXT 管术语，决定正文只有一个维护点。
- 中文单行 commit 风格及不读 git log 的提交习惯保留；新增暂存区归属、非交互拆分与关联文档同主题提交规则。
- wayfinder 提供真实 tracker 探测和本地 fallback，明确本地文件认领不是并发锁；恢复架构审查缺失的本地设计参考。

选择理由：一个共享 skill 比把 Note 规则抄入每个入口更易维护；已有 ADR 原位兼容比强制全量迁移风险小。代价是需要保持交接链接有效，并由语义审查确认理由；静态门禁不能推断所有重要 diff。

## 阶段三：验证工具

- [doctor.py](doctor.py)：技能入口、资源引用、宿主指令、脚本路径、Python 语法及行为场景覆盖；--probe 只探测依赖，不自动安装。
- [tests](tests/)：Notes/ADR、归档基线、CRLF/BOM、空覆盖、AIGC 工作区/轮次/dry-run/路径边界，以及安全 DOCX 解包与打包。
- [behavior-cases.json](behavior-cases.json)：16 个 skill 各一组 trigger/skip 与预期/禁止行为。仅完成用例结构检查，未运行 32 个真实模型对话。

## 已执行验证

1. `python -B .../_maintenance/doctor.py --probe`：通过，16 个入口，11 个自动、5 个手动，无静态错误/告警。
2. `python -B -m unittest discover -s .../_maintenance/tests -v`：首轮 31 项通过，审查驱动的安全回归扩展后为 **54 项全部通过**。
3. pi 自身 `loadSkillsFromDir`：16 个入口，diagnostics 为空；维护目录未被误加载为 skill。
4. `git diff --check`：通过；部分既有 CRLF 文档收到 Git 将归一化为 LF 的提示，不是检查失败。
5. Rust `rustfmt --edition 2021 --emit stdout`：解析通过，仅输出到空设备，不重排文件。`rustfmt --check` 未通过；备份中的原文件同样失败，本次未把既有全文件排版变化混入功能修复，不宣称格式门禁通过。
6. PowerShell AST ParseFile：通过，未启动服务或安装依赖。
7. `cargo check --offline`：**未完成**；本机缓存缺少锁定的 iri-string 0.7.11。没有联网拉依赖，不能报告 Tauri 构建通过。
8. `npm run build:web`：**未完成**；当前 app 目录没有可用的本地 `tsc`，且本次未获授权安装依赖，不能报告前端构建通过。

## 独立审查与收尾

首轮独立 reviewer 在 31 项测试通过后仍发现 4 个真实缺口，已逐一处理：

1. 归档入站检索扩至项目 README 和其他 Markdown，不只检查决策根；新增阻断与零写入回归。
2. DOCX 顶层指引统一安全解包，新增 safe_pack 的排他创建输出；旧文件不被 rm -f 删除，新增保留已有输出回归。
3. 架构审查与 HTML 参考统一使用本地 design.md、按作用域发现 ADR/Notes；默认 HTML 离线，无残留失效命令。doctor 新增对此类失效引用的检查并实际捕获了遗漏的参考文档。
4. to-spec/to-tickets 的入口描述与正文统一为本地生成或明确授权后发布。

额外补上归档写入异常回滚测试、ADR README 不计作真实决定、根目录规范化，以及 prototype 分支的授权边界。早期第二轮 reviewer 已确认上述 4 项修复并独立执行当时的 36 项测试。

提交前继续进行独立门禁审查，新增并修复了：

- Notes 与 DOCX 在递归前拒绝 symlink/junction/reparse point，兼容 Python 3.10+；归档写入再次检查父路径。
- safe_pack 在 ZIP 或输出流关闭失败时清理本次创建的不完整文件。
- PowerShell 全程使用 LiteralPath；隐式安装目录工作区被拒绝，显式 legacy 续跑保留。
- AIGC 绝对路径、`..`、junction、局部修订 basedOn、恢复 progress、Web 导出格式和共享 CLI 输出边界统一校验。
- 离线模式不再用原文回显完成轮次；桌面显式选择的外部首轮输入仍保留，派生输入与全部输出限制在工作区。

最终 reviewer 在 54 项回归通过后给出“可提交”结论，未发现 P0/P1 或明确契约冲突。早期独立复审日志：`C:/Users/10094/.pi/agent/sessions/--C--Users-10094-Code-write-notes-like-deepseek--/2026-09-15T06-36-04-024Z_01a0a3c7-a036-7147-a2b5-ad3f0b392a70/510e6002/run-0/session.jsonl`。

备份目录 `C:/Users/10094/.pi/agent/backups/skills-20260915-145802/` 中的 `doctor.json`、`tests.txt`、`pi-loader.json`、`diff-check.txt` 是早期阶段日志；最终命令已在提交前重新运行。当前 53 个修改/新增文件均位于 pi/skills；源参考项目 write-notes-like-deepseek 保持干净。

## 未完成的环境/行为验证

- soffice、pdftoppm 在 PATH 不可用；npm docx 在当前工作目录不可解析。没有安装这些依赖，也没有声称真实 Word 排版通过。
- Web/Tauri UI、打包和真实 API 未运行；前端本地 `tsc` 缺失，Rust 离线缓存缺少 iri-string 0.7.11。既有 app 的更多业务/安全行为不在本次全面重写范围。
- 新会话行为需 /reload 后按场景验收。静态规则、样例测试和独立代码审查都不是模型遵循率保证。
- 归档是单写入者的多个原子文件替换，异常可回滚，但强杀/断电不构成多文件事务；跨平台换行需要宿主 .gitattributes 配合。
- AIGC JSON 记录仍是单工作区串行写入模型，不承诺多进程并发更新。旧数据续跑/迁移步骤在其 workspace 参考文件。

## 激活

执行 `/reload` 并开启新会话，让新 description、正文与入口生效。grill-me 和 grill-with-docs 保留为 `/skill:grill-me`、`/skill:grill-with-docs` 手动快捷入口；其他原手动入口仍为手动。完整模型行为验收按 behavior-cases 执行，不在旧上下文里把已读的新规则当作自动发现证明。

回退和日常使用见 [README.md](README.md)。
