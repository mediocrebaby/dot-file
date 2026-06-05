-- Rime 输入模式指示器(右侧,clock 左侧)。
--   MODE=cn → 显示 "中"(teal)   MODE=en → 显示 "英"(subtext0)
--
-- 事件驱动:helper/rime_provider 监听 ~/.cache/rime/ascii_mode 文件变化,
--   经 mach 直推 rime_ascii_mode_change 事件,携带 MODE=cn|en。
--
-- 降级:helper 未运行 / Rime 未部署时显示占位 "…",不报错、不崩溃。
-- 休眠唤醒:system_woke 触发 helper 重启,重建 kqueue 监听并推送最新状态。
local sbar     = require("sketchybar")
local settings = require("settings")
local colors   = require("colors")

local rime_helper = settings.paths.config .. "/helper/rime_provider"

-- 注册自定义事件(由 rime_provider 触发;注册幂等,重复调用无害)
sbar.add("event", "rime_ascii_mode_change")

-- 显示 item
local rime_item = sbar.add("item", "rime.input_mode", {
  position = "right",
  icon = { drawing = false },
  label = {
    string       = "…",                 -- 初始占位,直到 helper 推送首个事件
    color        = colors.subtext0,
    padding_left  = settings.item.label_padding,
    padding_right = settings.item.label_padding,
    font = settings.font_string(settings.font.text, "Regular", settings.size.label),
  },
})

-- 按 MODE 更新显示;未知值静默保持现状(优雅降级)
local function update_mode(env)
  local mode = env.MODE or ""
  if mode == "cn" then
    rime_item:set({ label = { string = "中", color = colors.teal } })
  elseif mode == "en" then
    rime_item:set({ label = { string = "英", color = colors.subtext0 } })
  end
end

-- 干净重启 helper:先 killall 旧进程,再以 nohup 后台启动新进程。
-- delay(秒,可选):唤醒后给 mach 端口稳定留缓冲时间。
local function start_helper(delay)
  local wait = delay and ("sleep " .. delay .. "; ") or ""
  sbar.exec(wait .. "killall rime_provider 2>/dev/null; nohup '"
    .. rime_helper .. "' >/dev/null 2>&1 &")
end

-- 隐藏的管理 item:订阅事件刷新 UI(drawing=false 时仍能接收事件)
local manager = sbar.add("item", "rime.manager", {
  position = "right",
  drawing  = false,
  updates  = true,
})
manager:subscribe("rime_ascii_mode_change", update_mode)
-- 休眠唤醒后 kqueue fd 失效,重启 helper 重建监听并重推最新状态
manager:subscribe("system_woke", function()
  start_helper(1)
end)

-- 加载时干净重启 helper;helper 启动后读初始 ascii_mode 文件触发首次事件
start_helper()
