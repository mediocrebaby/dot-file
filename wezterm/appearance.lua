local M = {}
local platform  = require('utils.platform')

function M.apply(config)
	--- 主题和性能配置 ---
	config.color_scheme = "Ayu Mirage"
	config.max_fps = 120
	config.front_end = "WebGpu"
	config.webgpu_power_preference = "HighPerformance"

	--- 窗口样式 ---
	config.window_decorations = "RESIZE"
	config.window_frame = {
		active_titlebar_bg = "#090909",
		inactive_titlebar_bg = "#090909",
	}
	config.adjust_window_size_when_changing_font_size = false
	config.window_close_confirmation = "NeverPrompt"

	--- 标签栏与配色 ---
	config.enable_tab_bar = true
	config.show_new_tab_button_in_tab_bar = false
	config.show_tab_index_in_tab_bar = false
	config.switch_to_last_active_tab_when_closing_tab = true
	config.tab_max_width = 25
	config.use_fancy_tab_bar = false
	config.colors = {
		scrollbar_thumb = "#242936",
		tab_bar = {
			background = "rgba(31,36,48,0.8)",
		},
	}
end

return M
