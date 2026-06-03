-- komorebi 工作区指示器(左侧)。复刻 yasb 圆点:
--   空闲 = 深青灰小圆 / 有窗口 = 青色小圆 / 活动 = 白色拉长胶囊
-- 事件驱动:plugins/komorebi_listener.sh 把 komorebi socket 事件桥接为
-- 自定义事件 komorebi_workspace_change(携带 FOCUSED 与 POPULATED)。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

-- 工作区数量(与 ~/.config/komorebi/komorebi.json 的 workspaces 数一致)
local WORKSPACE_COUNT = 3
local listener = settings.paths.plugins .. "/komorebi_listener.sh"
local komorebic = "/opt/homebrew/bin/komorebic" -- 绝对路径,兼容 launchd 受限 PATH

-- 三种状态的圆点/胶囊样式:用 label.width 控制宽度,background 着色
local STYLE = {
  empty     = { width = 12, color = colors.ws_empty },
  populated = { width = 12, color = colors.ws_populated },
  active    = { width = 30, color = colors.ws_active },
}

-- 注册自定义事件(由监听器触发)
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
      height = 12,
      corner_radius = 6,
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

-- 根据事件载荷刷新所有圆点
local function update_spaces(env)
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
    -- 动画过渡宽度与颜色,复刻 yasb 的圆点↔胶囊缩放
    sbar.animate("tanh", 18, function()
      spaces[i]:set({
        label = { width = style.width },
        background = { color = style.color },
      })
    end)
  end
end

-- 确保监听器存活(看门狗:不在则拉起)
local function ensure_listener()
  sbar.exec("pgrep -f komorebi_listener.sh >/dev/null 2>&1 || nohup '"
    .. listener .. "' >/dev/null 2>&1 &")
end

-- 隐藏的管理 item:订阅事件刷新 UI + 周期看门狗保活
local manager = sbar.add("item", "komorebi.manager", {
  position = "left",
  drawing = false,
  updates = true,        -- 隐藏时仍接收事件/更新
  update_freq = 10,
})
manager:subscribe("komorebi_workspace_change", update_spaces)
manager:subscribe("routine", ensure_listener)

-- 启动时立即查询一次当前状态,消除重载/开机后高亮的延迟(不必等监听器首个事件)
sbar.exec("'" .. settings.paths.plugins .. "/komorebi_query.sh'", function(out)
  local focused, populated = (out or ""):match("(%d+)|([%d,]*)")
  if focused then
    update_spaces({ FOCUSED = focused, POPULATED = populated })
  end
end)

-- 加载时干净重启监听器(sketchybar reload 后状态一致)
sbar.exec(
  "pkill -f komorebi_listener.sh 2>/dev/null; "
  .. "pkill -f 'nc -lkU.*komorebi/sketchybar' 2>/dev/null; "
  .. "sleep 0.3; nohup '" .. listener .. "' >/dev/null 2>&1 &"
)
