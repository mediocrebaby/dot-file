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

-- 左:工作区圆点
capsule("bracket.workspaces", {
  "komorebi.space.1", "komorebi.space.2", "komorebi.space.3",
})

-- 左二(紧跟工作区):堆叠应用图标(成员与 stack.lua 的 MAX_ICONS 一致)
local stack_members = {}
for i = 1, 14 do
  stack_members[i] = "komorebi.stack." .. i
end
capsule("bracket.stack", stack_members)

-- 右:系统信息(CPU/内存/音量/WiFi/时钟合并一个胶囊)
capsule("bracket.status", {
  "cpu", "memory", "volume", "wifi", "clock",
})
