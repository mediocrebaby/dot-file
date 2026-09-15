---
name: baibai-aigc
description: 对中文或英文技术/学术文本作自然化改写；中文按记录串行执行两轮，英文一轮，每次调用只处理当前一轮，保留事实与术语。
user-invocable: true
---

# 单轮学术文本改写

用户提出降 AIGC、论文去 AI 味、人性化改写或继续上一轮时使用。目标是自然、准确、克制的表达，不承诺检测器分数或规避检测效果。

## 路径和输入

脚本、prompts、参考文件属于本 skill 安装目录；`origin/`、`finish/aigc_records.json`、`finish/intermediate/` 属于用户工作区。

先确定工作区，再启动 Python：默认 cwd，也可通过 `BAIBAI_WORKSPACE_ROOT` 显式指定。用本 skill 的绝对脚本路径执行，不能为了找到脚本而切到安装目录。需要确认路径或续接旧数据时读 [工作区与兼容](references/workspace.md)。

- 用户明确给路径：尊重该路径，不擅自重新解释到 origin 下。
- 未给文件但显然处理文件：在工作区 origin 下定位；多个候选无法区分时再问。
- 粘贴文本/上传附件：需要跨会话续跑时使用 `managed_sources.py` 保存为受管源，保持稳定 doc_id；不要把相同原文自动当不同文档重复开始。
- `.docx` 输入读取 [docx](../docx/SKILL.md)，文本提取/导出复用本 skill 的 `docx_pipeline.py`。纯文本提取不承诺保留原 Word 排版。

## 每次调用的顺序

1. 用 `skill_round_helper.py` 查询记录与当前 profile。中文 `cn` 为 1 → 2；英文 `en` 只有 1。仅 completed 轮次推进；interrupted/in_progress 续当前轮。已完成 profile 时默认停止。
2. 只读取当前轮 prompt：中文第 1 轮 [baibaiaigc1.md](prompts/baibaiaigc1.md)，第 2 轮 [baibaiaigc2.md](prompts/baibaiaigc2.md)；英文 [baibaiaigc-en.md](prompts/baibaiaigc-en.md)。不可提前读取下一轮并混合执行。
3. 当前输入是原始文本或上一轮真实输出。缺失上一轮文件时报告恢复缺口，不从原文跳生成第二轮。
4. 复用 `chunking.py` 和共享 round service 分块。按段落及自然边界尽量拆分；极长片段可能更细分，不承诺永不切开句子。逐块改写，不整篇一次处理。
5. 使用 `run_skill_round(...)`/共享 service 合并块结果，写输出、manifest、progress，只有真实完成才更新记录。无 API 的对话模式见 [使用说明](references/usage.md)；不能用原文回显或 dry-run 冒充完成。
6. 检查事实、数值、术语、编号、段落对应和结论。结构可检查，事实忠实度仍需语义核对。失败保留恢复信息，不能标为完成。
7. 报告当前轮次、profile、输入输出和记录路径。中文第 1 轮完成后提醒新开聊天继续第 2 轮；中文第 2 轮/英文第 1 轮完成后说明标准轮次结束，不建议不存在的下一轮。

## 内容约束

保持原意、逻辑关系、专业术语、编号结构和关键结论。不新增数据、引文、文献、案例或实验结论。prompt 与事实冲突时事实优先；原文已自然时最小化修改。没有依据不生成评分或检测结果。

文本直接输入默认展示本轮正文；文件任务默认交付路径，不重复展开整篇。用户只要正文时省略分析，但在文件交付信息中保留续跑状态。

## 按分支下钻

- 默认对话模式：不要求 API key。助手逐块产生改写，复用脚本的切块、验证、恢复与记录；见 [usage.md](references/usage.md)。
- 用户明确要求 API/批处理：运行 `run_aigc_round.py`，凭据用环境变量，不放命令行或报告；缺配置不能冒充调用成功。`--dry-run` 只输出 JSON 预览，不访问 API、不写结果、不推进轮次。
- Web/app、局部修订 `current_round_revision` 或 `next_round_partial`：仅明确请求时读取 [高级模式](references/advanced.md)，不要丢弃 revisions 和选择范围字段。
- 自检参考 [checklist.md](references/checklist.md)；保留准确性优先，不把主观评分当外部检测。

工具与绝对路径规则见 [pi 宿主适配](../_maintenance/PI-RUNTIME.md)。本 skill 运行产物不是工程 Note，不为每轮文本处理创建 ADR。
