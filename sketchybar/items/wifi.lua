-- Wi-Fi(右侧)。蓝色图标 + SSID;未连接显示断开图标。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")
local icons = require("icons")

local wifi = sbar.add("item", "wifi", {
  position = "right",
  icon = { string = icons.wifi, color = colors.blue },
  label = { string = "…" },
  update_freq = 10,
})

local function refresh()
  sbar.exec("'" .. settings.paths.plugins .. "/wifi.sh'", function(out)
    local ssid = (out or ""):gsub("%s+$", ""):gsub("^%s+", "")
    if #ssid > 0 then
      wifi:set({ icon = { string = icons.wifi }, label = { string = ssid } })
    else
      wifi:set({ icon = { string = icons.wifi_off }, label = { string = "未连接" } })
    end
  end)
end

wifi:subscribe({ "routine", "forced", "wifi_change", "system_woke" }, refresh)
refresh()
