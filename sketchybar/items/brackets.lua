-- 三段分组胶囊:用 bracket 把同区 item 包进统一背景。
-- 背景 mantle + 细边框,使胶囊在深色桌面 / komorebi 上轮廓清晰。
-- 注意:本文件必须在所有成员 item 创建之后再 require。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

local function capsule(name, members)
  return sbar.add("bracket", name, members, {
    background = {
      color = colors.mantle,
      border_color = colors.surface2,  -- 较亮边框,深色桌面上轮廓清晰
      border_width = 1,
      corner_radius = settings.item.corner_radius,
      height = settings.item.height,
    },
  })
end

-- 左:工作区圆点(含离线文案占位,离线时替代圆点显示)
capsule("bracket.workspaces", {
  "komorebi.space.1", "komorebi.space.2", "komorebi.space.3", "komorebi.offline",
})

-- 左二(紧跟工作区):堆叠应用图标(成员与 stack.lua 的 MAX_ICONS 一致)
-- 末位为离线颜文字占位,离线时替代图标显示。
local stack_members = {}
for i = 1, 14 do
  stack_members[i] = "komorebi.stack." .. i
end
stack_members[#stack_members + 1] = "komorebi.stack.offline"
capsule("bracket.stack", stack_members)

-- 右:系统信息(Rime 输入模式 + 时钟合并一个胶囊)
capsule("bracket.status", {
  "rime.input_mode", "clock",
})
