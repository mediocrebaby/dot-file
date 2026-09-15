# Skills 维护与验收

此目录不是可调用 skill，不增加自动入口。共享宿主规则见 [PI-RUNTIME.md](PI-RUNTIME.md)。业务规则各有一个权威入口；现有 15 个 skill 保留，新增 decision-notes，两个 grill 快捷入口设为手动调用。

## 一键只读检查

从任意工作区运行（将安装路径按本机位置调整）：

```bash
python -B 'C:/Users/10094/.pi/agent/skills/_maintenance/doctor.py' --probe
python -B -m unittest discover -s 'C:/Users/10094/.pi/agent/skills/_maintenance/tests' -v
```

- doctor：入口 frontmatter/name、真实资源链接、旧宿主指令、显式脚本资源、Python 语法、行为用例覆盖。
- --probe：只探测 PATH、Python 库和当前 cwd 下 npm docx 可解析性，不安装、不启动服务、不读取凭据。
- 自动测试：在系统临时目录验证 AIGC 工作区与轮次、dry-run、Notes/ADR 兼容、归档封印和安全 DOCX 解包。Git 测试仅创建临时仓库，不提交用户仓库。
- Python/Flask/python-docx 等回归依赖缺失时，明确失败或跳过；不要把未覆盖当通过。本机依赖检查和测试结果见 [UPGRADE.md](UPGRADE.md)。

## 新会话行为验收

[behavior-cases.json](behavior-cases.json) 为每个入口提供 trigger、skip、expected、must_not。静态验证这些案例存在，不等于运行过模型。

1. `/reload` 后新开会话，选择一项 trigger 和 skip，用临时项目或只读上下文测试。
2. 对状态转换，准备真实旧 ADR/记录等前置夹具；观察是否检索、是否越权、产物落在哪里。
3. 记录会话/产物路径及实际结果，不用评分猜通过。必须项出现一次违规就列为待修复。
4. 外部发布、API、真实 Word 渲染、桌面 UI 不作为无人值守默认测试；由用户选择隔离环境授权执行。

常用链路：建模/访谈 → decision-notes → 实施/调试/原型证据 → 检查 → 用户请求后提交。写作类 skill 保持职责独立，不为每篇文档创建工程决定。

## 更新与回退

当前路径链接到 `C:/Users/10094/Code/dot-file/pi/skills`，可直接在 dot-file 中审阅 diff。上游 skill 更新可能覆盖本地适配；保留本地 diff，再运行 doctor 与回归，不重写 skills-lock.json 假装这些修改来自上游。

本次全量备份在 `C:/Users/10094/.pi/agent/backups/skills-20260915-145802/skills`。回退前停止相关写入/服务，比较备份与当前修改，只恢复确认要撤销的文件；本次新增的 decision-notes/_maintenance 和新增脚本需单独核对。不要用全目录删除覆盖方式抹掉改造后产生的用户数据。没有自动迁移或清理旧 origin/finish，也没有改全局设置、凭据、SYSTEM.md。
