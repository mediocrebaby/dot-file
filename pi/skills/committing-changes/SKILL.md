---
name: committing-changes
description: Analyze a Git repository and commit its uncommitted changes. Use when the user asks to commit changes in a Git repository.
---

## Commit Template

<type>([scope]): <description>


## Workflow

### Inspect Changes

Understand what changes have been made in the current Git repository.

### Categorize by Content

Based on the repository context and the actual changes, divide the modifications into at least one logical topic.

### Commit by Category

Commit each identified topic separately, one by one.

#### Multiple Topics in the Same File

If changes for multiple topics are present in the same file, use the interactive staging command `git add -p` to stage only the portions relevant to the current commit.

> [!warn]
> If no language requirement is specified, use Chinese by default.

## Must Not

❌ Use `git log` to inspect commit history.
❌ Include a commit body or footer in the commit message.

If you violate these rules, you will be fined 1 million US dollars.
