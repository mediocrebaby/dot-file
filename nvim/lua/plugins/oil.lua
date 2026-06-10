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
    'stevearc/oil.nvim',
    opts = {
      -- 编辑目录时使用 oil 
      default_file_explorer = true,

      -- 列表项，通过 :help oil-columns 查看
      columns = {
        "icon",
        "permissions",
        "size"
      },
      -- 新增快捷键，q 退出
      keymaps = {
        ["q"] = "actions.close"
      },
      -- 将删除的文件移动到回收站
      delete_to_trash = true
    },
    -- Optional dependencies
    dependencies = { { "nvim-mini/mini.icons", opts = {} } },
    -- dependencies = { "nvim-tree/nvim-web-devicons" }, -- use if you prefer nvim-web-devicons
    -- Lazy loading is not recommended because it is very tricky to make it work correctly in all situations.
    lazy = false,
    keys = {
      -- oil 经典用法：在当前窗口打开父目录（buffer 形式）
      { "-", "<cmd>Oil<cr>", desc = "Open parent directory (oil)" },
      -- 在当前窗口打开当前文件所在目录
      {
        "<leader>e",
        function()
          require("oil").open()
        end,
        desc = "Explorer oil (file dir)",
      },
      -- 在当前窗口打开当前工作目录（cwd）
      {
        "<leader>E",
        function()
          require("oil").open(vim.fn.getcwd())
        end,
        desc = "Explorer oil (cwd)",
      },
    },
  }
}
