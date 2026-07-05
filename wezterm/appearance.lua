local M = {}
local platform  = require('utils.platform')

function M.apply(config)
	--- 主题和性能配置 ---
	config.color_scheme = "Ayu Mirage"
	config.max_fps = 120
	config.front_end = "WebGpu"
	config.webgpu_power_preference = "HighPerformance"

	--- 窗口样式 ---
  if platform.is_macos() then
    config.window_decorations = "TITLE | RESIZE | MACOS_USE_BACKGROUND_COLOR_AS_TITLEBAR_COLOR "
  elseif platform.is_windows() then
    config.window_decorations = "TITLE | RESIZE"
    config.win32_caption_color = "auto"
  end
	config.window_frame = {
		active_titlebar_bg = "#090909",
		inactive_titlebar_bg = "#090909",
	}
	config.adjust_window_size_when_changing_font_size = false
	config.window_close_confirmation = "NeverPrompt"

	--- 标签栏与配色 ---
	config.enable_tab_bar = false
	config.colors = {
		scrollbar_thumb = "#242936",
	}
end

return M
