local M = {}
local wezterm = require 'wezterm'

function M.apply(config)
	---透明效果---
	config.window_background_opacity = 0.3
	config.text_background_opacity = 0.5

	---窗口图片设置---
	config.background = {
		{
			source = {
				File = wezterm.home_dir .. "/.config/wezterm/back.jpg",
			},
			opacity = 0.9,
			hsb = {
				brightness = 0.2,
				saturation = 1.0,
				hue = 1.0,
			},
      repeat_x = "Repeat",
      horizontal_offset="-20cell"
		},
	}

	config.foreground_text_hsb = {
		hue = 1.0,
		saturation = 1.0,
		brightness = 1.0,
	}
end

return M
