# Tracker 适配

规划内容与其存储位置分离。先读项目指引和已提供的 tracker 文档，探测实际工具；不要求固定的安装命令、外部账户或标签。

## 已有外部 tracker

- 仅在用户授权发布/修改时调用。发现具体工具后读取参数，沿用项目标签，不假设 `ready-for-agent` 已存在。
- 依赖使用原生 blocking/sub-issue 功能；没有时用具名链接字段。
- 创建问题后确认返回的真实身份，再建立关联；记录操作失败，不能将本地草稿称为已发布。
- 不擅自关闭或修改父 Issue，除非当前用户明确授权地图维护。

## 本地 fallback

工作区 `.scratch/<effort>/map.md` 存地图，`issues/<NN>-<slug>.md` 每票一个文件，`spec.md` 存需求。名称取当前目标，先检查目录避免覆盖另一项工作。

```markdown
# 01: <问题或任务名称>
Type: grilling
Status: open
Owner: unassigned
Blocked by: none

## Question
<这一票解决什么>

## Acceptance criteria
- <可检查的完成条件>

## Resolution
<未完成时留空；完成时写结果、证据链接及决定链接>
```

状态为 open / in-progress / closed；“blocked”由未完成依赖推导，不额外维护第二套状态。依赖用相对链接，引用必须存在，图必须无环。

本地文件不是事务型 tracker：认领前重新读取，确认无人持有后填 owner；并行会话不能靠普通文件更新保证互斥。存在并发时指定一个协调写入者，其他会话只交付证据，或换用支持原子认领的 tracker。不要声称 Markdown 认领是分布式锁。

本地任务是过程资产，不代替 ADR/Notes。长期决定落在仓库的权威记录，`.scratch` 被清理后仍能检索理由。
