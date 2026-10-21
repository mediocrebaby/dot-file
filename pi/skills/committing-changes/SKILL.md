---
name: committing-changes
description: 用户明确要求提交 Git 改动时，检查、验证并按逻辑主题提交。
---

# comitting-changes

本技能用于指导 AI 模型提交 git 仓库中的变动，AI 模型应严格遵循本技能中描述的提交规范。


## 提交流程

1. 首先使用 `git status` 查看存在哪些文件变动。
2. 然后使用 `git diff <path>` 查看每个文件内容变动的具体情况。
3. 根据获取到的变动信息，将变动划分为不同的主题。
4. 使用 `git add ` 将同一主题下的所有变动的文件添加到暂存区。
5. 提交该主题

## 提交规范

1. 提交格式： <type>(scope): <description>
2. 如果一个文件中包含了多个变动主题，需要进行拆分提交。
