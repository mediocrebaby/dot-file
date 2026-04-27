local wezterm = require('wezterm')
local M = {}
local platform = require('utils.platform')

function M.apply(config)
	config.font = wezterm.font_with_fallback({
		"JetBrainsLxgwNerdMono",
	})

	config.initial_cols, config.initial_rows = 120,35
end

return M
