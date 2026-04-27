local wezterm = require('wezterm')
local M = {}

function M.setup()
	--- 切换标签栏显示/隐藏 ---
	wezterm.on("toggle-tab-bar", function(window, pane)
		local overrides = window:get_config_overrides() or {}
		if overrides.enable_tab_bar == nil then
			overrides.enable_tab_bar = false
		else
			overrides.enable_tab_bar = not overrides.enable_tab_bar
		end
		window:set_config_overrides(overrides)
	end)

	--- 窗口创建时居中 ---
	wezterm.on("gui-startup", function(cmd)
		local screen = wezterm.gui.screens().active
		local tab, pane, window = wezterm.mux.spawn_window(cmd or {})

		local gui_win = window:gui_window()
		local dimensions = gui_win:get_dimensions()

		local x = (screen.width - dimensions.pixel_width) / 2 + screen.x
		local y = (screen.height - dimensions.pixel_height) / 2 + screen.y

		gui_win:set_position(x, y)
	end)
end

return M
