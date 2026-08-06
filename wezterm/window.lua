local wezterm = require('wezterm')
local M = {}

--- 已最大化过的窗口 ID 集合在 wezterm.GLOBAL 中的键名。
--- 必须存 GLOBAL：模块级 table 会随配置重载重建的 lua 状态一起丢失,
--- 那样每次改配置都会把用户手动还原的窗口强行重新最大化。
local MAXIMIZED_IDS_KEY = 'maximized_window_ids'

--- 剔除已关闭窗口的 ID,避免集合在进程生命周期内无界增长。
--- 窗口创建是低频事件,且 mux 窗口数量极小,这里的全量扫描成本可忽略。
local function prune_closed(seen)
	local alive = {}
	for _, mux_window in ipairs(wezterm.mux.all_windows()) do
		alive[tostring(mux_window:window_id())] = true
	end

	local kept = {}
	for id in pairs(seen) do
		if alive[id] then
			kept[id] = true
		end
	end
	return kept
end

--- window-config-reloaded 会在每个 GUI 窗口创建时触发一次,
--- 但配置重载、ReloadConfiguration、set_config_overrides 同样会触发它。
--- 因此按 window_id 去重,只在窗口首次出现时最大化。
--- 回调收到的 window 已经是 GuiWindow,直接调 maximize(),不要再走 gui_window()。
local function maximize_once(window)
	local id = tostring(window:window_id())
	local seen = wezterm.GLOBAL[MAXIMIZED_IDS_KEY] or {}
	local already_maximized = seen[id] == true

	seen = prune_closed(seen)
	seen[id] = true
	wezterm.GLOBAL[MAXIMIZED_IDS_KEY] = seen

	if not already_maximized then
		window:maximize()
	end
end

function M.setup()
	wezterm.on('window-config-reloaded', function(window)
		maximize_once(window)
	end)
end

return M
