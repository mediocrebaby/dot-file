local wezterm = require('wezterm')
local config = wezterm.config_builder()

require('events').setup()
require('font').apply(config)
require('appearance').apply(config)
require('tab_style').setup()
require('shell').apply(config)
require('keybindings').apply(config)
require('domains').setup()
require('background').apply(config)
require('advanced').apply(config)

return config
