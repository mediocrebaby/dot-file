-- item 默认样式:所有 widget 共享的胶囊外观(复刻 yasb .widget)
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

sbar.default({
  updates = "when_shown",
  scroll_texts = true,

  icon = {
    font = settings.font_string(settings.font.icon, "Regular", settings.size.icon),
    color = colors.text,
    padding_left = settings.item.icon_padding,
    padding_right = settings.item.gap,
  },

  label = {
    font = settings.font_string(settings.font.text, "Semibold", settings.size.label),
    color = colors.text,
    padding_left = 0,
    padding_right = settings.item.label_padding,
  },

  -- 默认不画背景;胶囊由 items/brackets.lua 的 bracket 统一提供。
  -- 工作区圆点 / 堆叠图标会各自覆盖此项(它们的 background 有功能用途)。
  background = {
    drawing = false,
  },

  -- item 之间的水平间距
  padding_left = settings.item.padding,
  padding_right = settings.item.padding,
})
