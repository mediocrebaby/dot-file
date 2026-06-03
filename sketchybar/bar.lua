-- bar 全局外观:复刻 yasb 顶部透明长条,各 widget 自带胶囊背景浮于其上。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

sbar.bar({
  position = "top",
  height = settings.bar.height,
  color = colors.transparent,        -- bar 本体透明,widget 自带 mantle 胶囊
  padding_left = settings.bar.padding,
  padding_right = settings.bar.padding,
  margin = settings.bar.margin,
  y_offset = settings.bar.y_offset,
  corner_radius = 0,
  border_width = 0,
  blur_radius = 0,
  sticky = true,
  topmost = "window",                -- 悬于窗口之上(配合 komorebi 留白)
  shadow = false,
})
