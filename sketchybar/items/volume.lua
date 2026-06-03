-- 音量(右侧)。粉色图标,随音量分档切换图标。
-- 系统音量变化通过内置 volume_change 事件实时更新(无需轮询);
-- 点击切换静音。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")
local icons = require("icons")

local volume = sbar.add("item", "volume", {
  position = "right",
  icon = { string = icons.volume.high, color = colors.pink },
  label = { string = "…" },
})

local function icon_for(vol, muted)
  if muted or vol <= 0 then return icons.volume.muted end
  if vol < 34 then return icons.volume.low end
  if vol < 67 then return icons.volume.mid end
  return icons.volume.high
end

local function apply(vol, muted)
  volume:set({
    icon = { string = icon_for(vol, muted) },
    label = { string = muted and "muted" or (vol .. "%") },
  })
end

-- 用脚本读取初始状态(含静音)
local function refresh()
  sbar.exec("'" .. settings.paths.plugins .. "/volume.sh'", function(out)
    local vol_str, muted_str = (out or ""):match("(%d+)|(%a+)")
    if vol_str then apply(tonumber(vol_str), muted_str == "true") end
  end)
end

-- 系统音量变化事件:env.INFO 为当前音量百分比
volume:subscribe("volume_change", function(env)
  local vol = tonumber(env.INFO) or 0
  apply(vol, vol <= 0)
end)

-- 点击切换静音
volume:subscribe("mouse.clicked", function()
  sbar.exec("osascript -e 'set volume output muted (not (output muted of (get volume settings)))'", refresh)
end)

refresh()
