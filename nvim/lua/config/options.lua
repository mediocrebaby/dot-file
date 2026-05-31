-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- 关闭保存时自动格式化（LazyVim 默认开启）
vim.g.autoformat = false

-- 关闭拼写检查
vim.opt.spell = false

-- WSL 下与 Windows 共享系统剪贴板（依赖 win32yank 等 provider）
if require("utils.platform").is_wsl() then
  vim.opt.clipboard = "unnamedplus"
end
