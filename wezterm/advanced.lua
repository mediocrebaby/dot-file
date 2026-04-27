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
end

return M
