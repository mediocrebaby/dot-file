local wezterm = require('wezterm')
local M = {}
local platform = require('utils.platform')
local local_config = require('utils.local_config')

function M.apply(config)
	config.font = wezterm.font_with_fallback({
		"JetBrainsLxgwNerdMono",
	})

	if local_config.font_size then
		config.font_size = local_config.font_size
	end

	config.initial_cols, config.initial_rows = 120,35
end

return M
