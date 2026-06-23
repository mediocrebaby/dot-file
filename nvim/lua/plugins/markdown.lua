return {
  {
    -- markview.nvim：在缓冲区内直接美化渲染 markdown（标题、列表、代码块、表格等）。
    -- 纯渲染插件，不带 LSP/lint；编辑增强类功能不在此插件职责内。
    "OXY2DEV/markview.nvim",
    -- 官方明确建议不要懒加载：插件内部已做按需渲染，自身已是 lazy 的。
    lazy = false,
    -- 复用项目里 oil 已引入的 mini.icons 作为图标来源。
    dependencies = { "nvim-mini/mini.icons" },
    opts = {
      preview = {
        -- 用 mini.icons 提供文件/语言图标（默认是内置的 "internal"）。
        icon_provider = "mini",
        -- 不开 hybrid_modes：普通模式整页保持渲染，进入插入模式才整体关渲染（始终全渲染手感）。
      },
    },
    keys = {
      -- 放在 LazyVim 的 toggle/UI 组（<leader>u）下，全局切换渲染开/关。
      { "<leader>um", "<cmd>Markview Toggle<cr>", desc = "Toggle Markview (render)" },
    },
  },
}
