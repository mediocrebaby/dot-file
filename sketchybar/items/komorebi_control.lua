-- komorebi 控制按钮(右侧,并入 status 胶囊)。
--   · 右键 → 开/收 popup 菜单:启动 / 停止 / 重启 komorebi
--   · 左键 → 无动作
-- 图标为预处理过的透明 PNG(img/komorebi.png);按钮静态,不反映 komorebi 运行状态。
-- 启停后由常驻 helper 的离线态机制自动联动左侧工作区/堆叠组件,本组件不订阅状态事件。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

-- 绝对路径,兼容 launchd 受限 PATH(与 komorebi.lua 一致)
local komorebic = "/opt/homebrew/bin/komorebic"
local icon_image = settings.paths.config .. "/img/komorebi.png"

-- 按钮主 item:透明 PNG 当图标,自带向下展开的 popup 菜单
local control = sbar.add("item", "komorebi.control", {
  position = "right",
  icon = { drawing = false },
  label = {
    drawing = true,
    string = "",
    width = 26,                   -- 占位宽度,撑开 item 以容纳背景图标
    color = colors.transparent,
  },
  background = {
    drawing = true,
    color = colors.transparent,   -- 容器透明,只显示图标
    image = {
      string = icon_image,
      scale = 0.2,                -- 128px 源 → ≈26px 显示
      drawing = true,
    },
  },
  popup = {
    drawing = false,
    align = "center",
    background = {
      color = colors.mantle,
      border_color = colors.surface2,
      border_width = 1,
      corner_radius = settings.item.corner_radius,
    },
  },
  padding_left = settings.item.padding,
  padding_right = settings.item.padding,
})

-- 添加一行纯文字菜单项:点击执行命令后收起 popup
local function add_menu_item(name, text, command)
  local entry = sbar.add("item", name, {
    position = "popup.komorebi.control",
    icon = { drawing = false },
    label = {
      string = text,
      color = colors.text,
      align = "left",
      padding_left = settings.item.label_padding,
      padding_right = settings.item.label_padding,
    },
    background = { drawing = false },
  })
  entry:subscribe("mouse.clicked", function()
    sbar.exec(command)
    control:set({ popup = { drawing = false } })
  end)
end

add_menu_item("komorebi.control.start", "启动 komorebi", komorebic .. " start")
add_menu_item("komorebi.control.stop", "停止 komorebi", komorebic .. " stop")
add_menu_item("komorebi.control.restart", "重启 komorebi",
  komorebic .. " stop; " .. komorebic .. " start")

-- 仅右键开/收 popup(交给 sketchybar 自身 toggle,避免状态不同步);左键不响应
control:subscribe("mouse.clicked", function(env)
  if (env.BUTTON or "") == "right" then
    control:set({ popup = { drawing = "toggle" } })
  end
end)
