# Prompt History

为 pi 的输入编辑器增加按工作区持久化的指令历史。

## 功能

- 自动记录当前工作区提交过的用户输入。
- 退出并重新进入 pi 后，仍可使用 `↑` / `↓` 浏览历史。
- 每个工作区单独保存，最多保留最近 100 条。
- 连续提交相同内容时不重复记录。
- 保留 pi 原有的多行光标移动行为：只有光标位于首行或正在浏览历史时，方向键才切换历史。

## 安装

把本目录放到以下任一位置，然后执行 `/reload`：

- 全局：`~/.pi/agent/extensions/prompt-history/`
- 项目：`.pi/extensions/prompt-history/`

本仓库已按 pi 扩展目录结构组织；如果 `pi/extensions` 已链接到 `~/.pi/agent/extensions`，无需额外安装。

## 数据位置

历史记录保存在：

```text
$PI_CODING_AGENT_DIR/workspace-history/<workspace-hash>.json
```

未设置 `PI_CODING_AGENT_DIR` 时，默认使用：

```text
~/.pi/agent/workspace-history/<workspace-hash>.json
```
