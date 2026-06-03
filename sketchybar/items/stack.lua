-- komorebi 聚焦窗口图标(左侧,紧跟工作区圆点)。纯事件驱动:
-- plugins/komorebi_listener.sh 在每条 komorebi 通知上算好「聚焦目标」的图标(已转 png),
-- 通过事件 komorebi_workspace_change 的 ICONS 参数(逗号分隔的 png 路径)下发,本组件同步渲染。
-- 与左侧工作区圆点消费「同一条通知的 .state」,不再另起 komorebic state 命令查询,
-- 从根上消除「命令 state 滞后于通知」导致的图标停留。
--   · 聚焦单窗口        → 1 个图标
--   · 聚焦堆叠容器      → 堆叠内全部窗口图标
--   · 空工作区/无聚焦目标 → ICONS 为空 → 全部隐藏
-- 预创建固定数量的图标槽位并复用,按需显示/隐藏,避免频繁增删导致闪烁。
local sbar = require("sketchybar")
local settings = require("settings")
local colors = require("colors")

local script = settings.paths.plugins .. "/komorebi_stack.sh"
local MAX_ICONS = 14      -- 图标槽位上限
local ICON_SCALE = 0.30   -- 64px 缓存 → ≈19px 显示
local ICON_WIDTH = 24     -- 占位宽度(撑开 item 以容纳图标)
local GROUP_GAP = 32      -- 工作区胶囊与堆叠胶囊之间的间隔宽度

-- 工作区胶囊与堆叠胶囊之间的间隔:独立透明占位 item,不归属任何 bracket
-- (brackets.lua 的 workspaces/stack 都不含它),故不会撑大任一胶囊背景,
-- 只把后续堆叠图标整体右推,在两个胶囊之间留出真实空白。
sbar.add("item", "komorebi.stack.gap", {
  position = "left",
  icon = { drawing = false },
  label = { drawing = true, string = "", width = GROUP_GAP, color = colors.transparent },
  background = { drawing = false },
  padding_left = 0,
  padding_right = 0,
})

local items = {}
for i = 1, MAX_ICONS do
  items[i] = sbar.add("item", "komorebi.stack." .. i, {
    position = "left",
    drawing = false,
    icon = { drawing = false },
    label = {
      drawing = true,
      string = "",
      width = ICON_WIDTH,
      color = colors.transparent,
    },
    background = {
      drawing = true,
      color = colors.transparent,    -- 容器透明,只显示图标
      corner_radius = 5,
      image = {
        scale = ICON_SCALE,
        corner_radius = 5,
        drawing = true,
      },
    },
    padding_left = 2,
    padding_right = 2,
  })
end

-- 用 png 路径列表填充图标槽位:有则显示该图标,无则隐藏
local function render(paths)
  for i = 1, MAX_ICONS do
    if paths[i] then
      items[i]:set({
        drawing = true,
        background = { image = { string = paths[i] } },
      })
    else
      items[i]:set({ drawing = false })
    end
  end
end

-- 主路径:从事件参数 ICONS(逗号分隔的 png 路径)同步渲染
local function on_event(env)
  local paths = {}
  for p in (((env or {}).ICONS) or ""):gmatch("[^,]+") do
    if #p > 0 then paths[#paths + 1] = p end
  end
  render(paths)
end

-- 初始化路径:仅在加载时用脚本查一次(此刻无事件可用,且状态已稳定)
local function on_script(out)
  local paths = {}
  for line in (out or ""):gmatch("[^\r\n]+") do
    if #line > 0 then paths[#paths + 1] = line end
  end
  render(paths)
end

-- 隐藏管理 item:订阅 listener 桥接的「工作区/聚焦变化」事件
local mgr = sbar.add("item", "komorebi.stack.mgr", {
  position = "left",
  drawing = false,
  updates = true,        -- 隐藏时仍接收事件
})
mgr:subscribe("komorebi_workspace_change", on_event)

-- 加载时初始化一次(reload 后立即有内容,不必等首个事件)
sbar.exec("'" .. script .. "'", on_script)
