-- komorebi 工作区指示器(左侧)。复刻 yasb 圆点:
--   空闲 = 深青灰小圆 / 有窗口 = 青色小圆 / 活动 = 白色拉长胶囊
-- 事件驱动:由编译好的 C++ event provider(helper/komorebi_provider)直接经 mach
-- 触发 komorebi_workspace_change,携带 STATUS / FOCUSED / POPULATED / ICONS。
--   · STATUS=online  → 按 FOCUSED/POPULATED 渲染圆点
--   · STATUS=offline → komorebi 断连/未运行,隐藏圆点,改显亮绿 "komorebi offline"
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

-- 工作区数量(与 ~/.config/komorebi/komorebi.json 的 workspaces 数一致)
local WORKSPACE_COUNT = 3
local helper = settings.paths.helper
local komorebic = "/opt/homebrew/bin/komorebic" -- 绝对路径,兼容 launchd 受限 PATH

-- 三种状态的圆点/胶囊样式:用 label.width 控制宽度,background 着色
local STYLE = {
  empty     = { width = 12, color = colors.ws_empty },
  populated = { width = 12, color = colors.ws_populated },
  active    = { width = 30, color = colors.ws_active },
}

-- 注册自定义事件(由 helper 触发)
sbar.add("event", "komorebi_workspace_change")

-- 创建工作区圆点
local spaces = {}
for i = 1, WORKSPACE_COUNT do
  local space = sbar.add("item", "komorebi.space." .. i, {
    position = "left",
    icon = { drawing = false },
    label = {
      string = "",
      width = STYLE.empty.width,
      color = colors.transparent,
    },
    background = {
      drawing = true,
      height = 14,
      corner_radius = 7,
      color = colors.ws_empty,
      border_width = 0,
    },
    padding_left = 4,
    padding_right = 4,
  })

  -- 点击切换到该工作区(komorebi 为 0 起始索引)
  space:subscribe("mouse.clicked", function()
    sbar.exec(komorebic .. " focus-workspace " .. (i - 1))
  end)

  spaces[i] = space
end

-- 离线提示:komorebi 断连时替代圆点显示的亮绿文字(常驻,默认隐藏)
local offline = sbar.add("item", "komorebi.offline", {
  position = "left",
  drawing = false,
  icon = { drawing = false },
  label = { string = "komorebi offline", color = colors.offline_text },
  background = { drawing = false },
  padding_left = 4,
  padding_right = 4,
})

-- 在线渲染:显示圆点并按焦点/窗口数着色,复刻 yasb 圆点↔胶囊缩放
local function render_online(env)
  offline:set({ drawing = false })

  local focused = tonumber(env.FOCUSED or "-1")
  local populated = {}
  for n in (env.POPULATED or ""):gmatch("[^,]+") do
    populated[#populated + 1] = tonumber(n) or 0
  end

  for i = 1, WORKSPACE_COUNT do
    local style
    if (i - 1) == focused then
      style = STYLE.active
    elseif (populated[i] or 0) > 0 then
      style = STYLE.populated
    else
      style = STYLE.empty
    end
    spaces[i]:set({ drawing = true })
    sbar.animate("tanh", 18, function()
      spaces[i]:set({
        label = { width = style.width },
        background = { color = style.color },
      })
    end)
  end
end

-- 离线渲染:隐藏所有圆点,显示亮绿离线文字
local function render_offline()
  for i = 1, WORKSPACE_COUNT do
    spaces[i]:set({ drawing = false })
  end
  offline:set({ drawing = true })
end

-- 按事件 STATUS 分派渲染
local function update_spaces(env)
  if (env.STATUS or "online") == "offline" then
    render_offline()
  else
    render_online(env)
  end
end

-- 干净重启 helper:先杀旧进程,再启动新进程(绑定当前 sketchybar 的 bootstrap 端口)。
-- komorebi 侧断连重连由 helper 自身负责;sketchybar reload 由本次干净重启兜底。
local function start_helper()
  sbar.exec("killall komorebi_provider 2>/dev/null; nohup '"
    .. helper .. "' >/dev/null 2>&1 &")
end

-- 隐藏的管理 item:订阅事件刷新 UI(隐藏时仍接收事件)
local manager = sbar.add("item", "komorebi.manager", {
  position = "left",
  drawing = false,
  updates = true,
})
manager:subscribe("komorebi_workspace_change", update_spaces)

-- 加载时干净重启 helper;初始高亮由 helper 主动查 state 后发首个事件兜底。
start_helper()
