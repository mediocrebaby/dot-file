# 格式与兼容

## 新 notes 库

文件头：`# Agent Note: 标题`、空行、`Status: proposed|implemented|rejected — 原因`、空行。日期用真实首次提出日期。

小节支持以下成对别名，正文语言服从用户/项目要求：

| 英文 | 中文 |
|---|---|
| Problem | 问题 |
| Proposal | 提案 / 方案 |
| Decision | 决策 / 决定 |
| Alternatives considered | 备选方案 / 已考虑的替代方案 |
| Acceptance criteria | 验收标准 |
| Risks | 风险 |
| Consequences | 后果 / 影响 |
| Verification | 验证 / Testing / 测试 |

proposed 必需：问题、提案、备选、验收、风险。implemented 必需：问题、决策、备选、后果、验证；明确未验证的缺口也可以是验证小节正文。rejected 必需：问题、原提案、备选，否决原因写状态行。

检查器要求必需小节非空，忽略注释/代码围栏；不计备选数量、不扫描正文时态、不判断语义真实性。implemented 不保留提案/计划/验收标准标题。模板中的占位内容必须替换。

## 既有 ADR

采用 `--layout adr`：仅检查非空标题和项目内相对文件链接，不要求目录状态、日期、五个小节或修改既有编号。保留宿主的 frontmatter、Markdown 状态行和生命周期。

已有 ADR 的内容审核由宿主规范及语义审查负责。简单格式检查成功不代表实现已完成。root 必须位于用户指定项目中；自动发现歧义时显式指定 `--root`，不猜测。

普通文件链接应使用具名相对 Markdown 链接。检查器支持常见行内链接，不检查网页可达性、章节锚点或完整 Markdown 语法。
