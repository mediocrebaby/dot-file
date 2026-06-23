return {
  {
    -- claudecode.nvim：纯 Lua 实现 Claude Code 的 WebSocket/MCP 协议，
    -- 等价于官方 VS Code 扩展的「IDE 级」集成：选区发送、行内 diff 接受/拒绝、
    -- 自动同步诊断与已打开的文件。无 Node 依赖。
    -- 运行模型：nvim 内部起一个 WS 服务器，再在终端里拉起 claude CLI，
    -- CLI 通过环境变量自动连上该服务器。
    "coder/claudecode.nvim",
    -- 终端后端复用项目里已有的 snacks.nvim（LazyVim 默认自带）。
    dependencies = { "folke/snacks.nvim" },
    opts = {
      -- 加载时自动启动 WS 服务器，触发键位时 claude 才能即刻连上。
      auto_start = true,
      -- claude CLI 命令；若不在 PATH，可改成绝对路径，
      -- 例如本地安装版 "~/.claude/local/claude"，Windows 上写 claude.cmd 的完整路径。
      terminal_cmd = nil,
      terminal = {
        -- 明确指定用 snacks 承载 claude 终端（默认 "auto" 也会优先选它）。
        provider = "snacks",
        -- 终端窗口开在右侧，占 30% 宽。
        split_side = "right",
        split_width_percentage = 0.30,
      },
    },
    -- 懒加载：仅在用到这些命令时才载入插件。
    cmd = {
      "ClaudeCode",
      "ClaudeCodeFocus",
      "ClaudeCodeSelectModel",
      "ClaudeCodeAdd",
      "ClaudeCodeSend",
      "ClaudeCodeTreeAdd",
      "ClaudeCodeStatus",
      "ClaudeCodeStart",
      "ClaudeCodeStop",
      "ClaudeCodeOpen",
      "ClaudeCodeClose",
      "ClaudeCodeDiffAccept",
      "ClaudeCodeDiffDeny",
      "ClaudeCodeCloseAllDiffs",
    },
    -- 键位统一挂在 <leader>a（a = AI）组下，与现有配置不冲突。
    keys = {
      { "<leader>a", nil, desc = "AI/Claude Code" },
      { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
      { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
      { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
      { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
      { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select Claude model" },
      { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
      -- 可视模式：把选区发送给 claude。
      { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
      -- 在文件树/oil 等缓冲区：把光标处文件加入上下文。
      {
        "<leader>as",
        "<cmd>ClaudeCodeTreeAdd<cr>",
        desc = "Add file",
        ft = { "NvimTree", "neo-tree", "oil", "minifiles", "netrw", "snacks_picker_list" },
      },
      -- diff 模式下接受/拒绝 claude 提出的改动。
      { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
      { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
    },
  },
}
