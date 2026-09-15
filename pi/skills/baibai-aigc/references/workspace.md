# 工作区隔离与旧数据

`workspace_paths.py` 是唯一根目录策略：RESOURCE_ROOT 为安装根；WORKSPACE_ROOT 为进程启动前设置的 BAIBAI_WORKSPACE_ROOT，否则为启动 cwd。根目录在进程导入时确定，切换工作区需重启该进程。

输入/records/intermediate/progress/上传/导出走工作区；prompt、脚本、前端和 requirements 走资源目录。桌面显式选择的外部输入/导出路径仍兼容，但其记录保留在选定工作区。全局 app 模型配置仍在用户 APPDATA，不迁移、不打印其中凭据。

诊断：从目标项目运行 `python '<skill-dir>/scripts/workspace_paths.py'`，只输出资源/工作区/记录路径及旧记录是否存在，不读正文和凭据。

## 旧数据

本次改造不自动迁移或删除旧 origin/finish。首次续跑时检查旧安装根是否存在记录；如果存在而新工作区为空，不默认另开第一轮。

最安全兼容方式：显式将 BAIBAI_WORKSPACE_ROOT 设为旧数据根，继续沿用原位置。这是用户确认的 legacy 兼容例外；默认启动仍拒绝把安装目录当作工作区。

需要迁移时：停止所有写入进程 → 备份 origin、finish 及记录 → 复制到用户选定的空目标目录 → 核对每轮 input/output/manifest/progress 的存在与内容 → 对绝对旧路径逐项核对再调整副本 → 用新工作区查询轮次 → 用户确认后才决定是否清理旧副本。不要合并两个同名 JSON 文件，也不盲目字符串替换路径。

无旧记录不创建空的迁移文件。多个项目即使有同名论文，其 records 也必须分离。
