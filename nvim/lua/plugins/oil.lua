return {
  -- 禁用 LazyVim 默认的 snacks explorer 键位，交给 oil 接管
  {
    "folke/snacks.nvim",
    keys = {
      { "<leader>e", false },
      { "<leader>E", false },
    },
  },

  {
    "stevearc/oil.nvim",
    dependencies = { "nvim-mini/mini.icons" },
    -- oil 需要在启动时接管 netrw，不能懒加载
    lazy = false,
    ---@module "oil"
    ---@type oil.SetupOpts
    opts = {
      -- 接管 netrw，作为默认文件浏览器
      default_file_explorer = true,
      -- 在文件浏览器中显示隐藏文件的开关由 g. 切换，默认隐藏
      view_options = {
        show_hidden = false,
      },
      -- 删除文件时移动到系统回收站（需要 trash 工具支持）
      delete_to_trash = true,
      keymaps = {
        ["g?"] = { "actions.show_help", mode = "n" },
        ["<CR>"] = "actions.select",
        ["<C-v>"] = { "actions.select", opts = { vertical = true } },
        ["<C-s>"] = { "actions.select", opts = { horizontal = true } },
        ["<C-t>"] = { "actions.select", opts = { tab = true } },
        ["<C-p>"] = "actions.preview",
        ["<C-c>"] = { "actions.close", mode = "n" },
        ["q"] = { "actions.close", mode = "n" },
        ["<C-l>"] = "actions.refresh",
        ["-"] = { "actions.parent", mode = "n" },
        ["_"] = { "actions.open_cwd", mode = "n" },
        ["gs"] = { "actions.change_sort", mode = "n" },
        ["gx"] = "actions.open_external",
        ["g."] = { "actions.toggle_hidden", mode = "n" },
        ["g\\"] = { "actions.toggle_trash", mode = "n" },
      },
    },
    keys = {
      -- oil 经典用法：在当前窗口打开父目录（buffer 形式）
      { "-", "<cmd>Oil<cr>", desc = "Open parent directory (oil)" },
      -- 在当前窗口打开当前工作目录（cwd）
      {
        "<leader>e",
        function()
          require("oil").open()
        end,
        desc = "Explorer oil (file dir)",
      },
      -- 在当前窗口打开当前文件所在目录
      {
        "<leader>E",
        function()
          require("oil").open(vim.fn.getcwd())
        end,
        desc = "Explorer oil (cwd)",
      },
    },
  },
}
