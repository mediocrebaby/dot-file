# Web、桌面与局部修订

仅用户明确请求这些模式时读取。

## 启动

Web 开发入口是 `scripts/start_web_dev.ps1`。用 `-Workspace <已存在的用户工作区>` 明确数据目录；从安装根启动时必须指定。脚本可能创建安装目录下的 .venv 并安装依赖，运行前明确副作用；`-SkipInstall` 不会安装缺失依赖。

桌面开发启动前设置 BAIBAI_WORKSPACE_ROOT 为用户数据目录；资源由安装/源码位置定位，不能用数据目录猜 scripts 路径。源码移动或打包后可用 BAIBAI_RESOURCE_ROOT 指定完整资源根。当前仍是依赖外部 Python/资源树的桌面开发方案，不承诺独立可分发安装包。

Web/app 的真实改写可能调用外部 API，模型配置由既有 app_config 管理；不会因为检查技能而自动启动服务或读取 key。离线演示不代表语言改写质量，也不要把演示记录并入真实论文工作区。

## 局部模式

- `current_round_revision`：在当前轮基础上，对指定段落生成 revN。
- `next_round_partial`：基于上一轮，仅让选定段落进入下一轮。

使用 `build_execution_context(..., execution_options=...)`、`run_round_for_app(...)` 和现有共享 service；保留 revisions、revision_number、target_paragraph_indexes、based_on_output_path、based_on_manifest_path、source_round/target_round 等字段。不自行压平为普通 completed 轮次，默认整轮模式不自动升级为局部模式。

测试与手动验收分别记录：脚本级状态验证不等于 Web/Tauri 界面和打包验证完成。
