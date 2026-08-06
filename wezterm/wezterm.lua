local wezterm = require('wezterm')
local config = wezterm.config_builder()

require('font').apply(config)
require('appearance').apply(config)
require('shell').apply(config)
require('keybindings').apply(config)
require('domains').setup()
require('window').setup()
-- require('background').apply(config)
require('advanced').apply(config)

return config
