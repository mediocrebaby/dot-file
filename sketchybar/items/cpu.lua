-- CPU 使用率(右侧)。绿色图标。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")
local icons = require("icons")

local cpu = sbar.add("item", "cpu", {
  position = "right",
  icon = { string = icons.cpu, color = colors.green },
  label = { string = "…" },
  update_freq = 3,
})

local function refresh()
  sbar.exec("'" .. settings.paths.plugins .. "/cpu.sh'", function(out)
    local v = (out or ""):gsub("%s+", "")
    if #v > 0 then cpu:set({ label = v .. "%" }) end
  end)
end

cpu:subscribe({ "routine", "forced" }, refresh)
refresh()
