-- 内存占用(右侧)。黄色图标。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")
local icons = require("icons")

local mem = sbar.add("item", "memory", {
  position = "right",
  icon = { string = icons.memory, color = colors.yellow },
  label = { string = "…" },
  update_freq = 5,
})

local function refresh()
  sbar.exec("'" .. settings.paths.plugins .. "/memory.sh'", function(out)
    local v = (out or ""):gsub("%s+", "")
    if #v > 0 then mem:set({ label = v .. "%" }) end
  end)
end

mem:subscribe({ "routine", "forced" }, refresh)
refresh()
