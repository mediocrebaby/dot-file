local M = {}
local platform = require('utils.platform')

function M.apply(config)
	---透明度---
	config.window_background_opacity = 0.6
	config.text_background_opacity = 1

	---平台相关：系统材质 / 模糊---
	if platform.is_windows() then
		config.win32_system_backdrop = "Mica"
	elseif platform.is_macos() then
		config.macos_window_background_blur = 20
	end

	---纯色背景---
	---不显式设置 config.background，
	---由 appearance.lua 的 color_scheme = "Ayu Mirage" 提供背景色 (≈ #1f2430)
end

return M
