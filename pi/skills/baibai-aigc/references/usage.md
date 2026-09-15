# 对话处理与 API 处理

## 无 API 的对话模式

资源路径相对本 skill 根目录；执行器 cwd/BAIBAI_WORKSPACE_ROOT 指向用户工作区。

1. 将 skill 的绝对 scripts 目录加入临时 Python 驱动程序的 sys.path。调用 `get_document_round_state(...)` 或 `build_execution_context(...)` 得到正确轮次、输入、输出、manifest。后者在 DOCX 场景可能生成提取文本，不是纯只读操作。
2. 使用 `build_manifest(text, chunk_limit=..., chunk_metric=get_chunk_metric(profile))` 获取块 ID；助手只读取本轮 prompt 并逐块改写。将真实块结果保存到工作区的本轮辅助 JSON，键为 chunk_id，值为正文。
3. 调用 `run_skill_round(source_path, transform=..., prompt_profile=...)`；transform 接口为 `(chunk_text, prompt_input, round_number, chunk_id) -> str`，从已经完成的块结果读取，缺块抛错。共享 service 负责验证、恢复、progress 和最终 records。
4. 不用身份回显 transform 当作真实改写；测试夹具可用回显，但必须在临时目录，不能进入用户记录。若没有完成全部块，保留进度并明确未完成。
5. 第二轮必须使用记录中上一轮的输出。中文每次只做一轮，英文只有一轮；同一工作区的写入串行执行，当前 JSON 记录不是多进程事务数据库。

原始输入和结果仍须人工/模型核对事实忠实度；机器验证只覆盖格式和状态等有限条件。

## 显式 API 模式

仅用户要求 CLI/API 自动调用模型时使用 `scripts/run_aigc_round.py`。API key 由环境注入，避免命令行和日志泄露。配置项仍为 BAIBAIAIGC_API_KEY、BAIBAIAIGC_MODEL、BAIBAIAIGC_BASE_URL，以及已有接口类型选项。

查看参数先运行脚本 `--help`。真实调用会访问配置的远端并写用户工作区；不要在依赖检查或技能验收时执行。

`--dry-run` 优先于 API 配置：只读取输入与当前 prompt，输出分块预览 JSON；不调用模型，不创建 output/manifest/progress，不更新 records。`--echo-prompt-inputs` 会把原文块包含在 stdout，仅用户明确需要排查时使用，不把敏感正文保存到共享日志。

API 缺配置只影响 API 模式，不代表对话模式不可用。
