local M = {}

function M.apply(config)
	---高级功能---
	config.enable_scroll_bar = false
	config.scrollback_lines = 20000
	config.automatically_reload_config = true
	config.exit_behavior = "CloseOnCleanExit"
	config.exit_behavior_messaging = "Verbose"
	config.status_update_interval = 50000
	config.notification_handling = "AlwaysShow"
  config.default_cursor_style = "SteadyBar"
  config.force_reverse_video_cursor=true
  config.cursor_smear_duration_ms = 150
  config.cursor_thickness = 2
  config.cursor_trail_size = 1.0
end

return M
