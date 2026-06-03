-- 时钟 + 日期(右侧)。复刻 yasb:短格式 "Jun 03, 21:51",点击切换长格式。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

local SHORT = "+%b %d, %H:%M"          -- Jun 03, 21:51
local LONG  = "+%A, %d %B %Y  %H:%M"   -- Wednesday, 03 June 2026  21:51

local clock = sbar.add("item", "clock", {
  position = "right",
  icon = { drawing = false },
  label = {
    string = "…",
    color = colors.text,
    padding_left = settings.item.label_padding,
  },
  update_freq = 30,
})

local show_long = false

local function refresh()
  local fmt = show_long and LONG or SHORT
  sbar.exec("date '" .. fmt .. "'", function(out)
    clock:set({ label = (out or ""):gsub("%s+$", "") })
  end)
end

clock:subscribe({ "routine", "forced", "system_woke" }, refresh)
clock:subscribe("mouse.clicked", function()
  show_long = not show_long
  refresh()
end)

refresh()
