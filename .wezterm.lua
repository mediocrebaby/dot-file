--- 字体配置 ---
local wezterm = require("wezterm")

wezterm.on("toggle-tab-bar", function(window, pane)
	local overrides = window:get_config_overrides() or {}
	if overrides.enable_tab_bar == nil then
		overrides.enable_tab_bar = false
	else
		overrides.enable_tab_bar = not overrides.enable_tab_bar
	end
	window:set_config_overrides(overrides)
end)

local config = wezterm.config_builder() -- 配置构建器
config.font = wezterm.font_with_fallback({
	"FiraCode Nerd Font Mono",
})
config.font_size = 12

---窗口大小---
config.initial_rows = 30
config.initial_cols = 100

--- 主题和性能配置 ---
config.color_scheme = "Ayu Mirage"
config.max_fps = 60
config.front_end = "WebGpu"
config.webgpu_power_preference = "HighPerformance"

--- 自动选择shell ---
if wezterm.target_triple:find("windows") ~= nil then
	-- Windows 系统: pwsh → powershell → cmd
	local function command_exists(cmd)
		local success, stdout, _ = wezterm.run_child_process({ "where", cmd })
		return success and stdout and stdout ~= ""
	end
	if command_exists("pwsh.exe") then
		config.default_prog = { "pwsh.exe", "-l" }
	elseif command_exists("powershell.exe") then
		config.default_prog = { "powershell.exe", "-NoLogo" }
	else
		config.default_prog = { "cmd.exe" }
	end
else
	-- Unix 系统:zsh → bash → sh
	local function command_exists(cmd)
		local success, stdout, _ = wezterm.run_child_process({
			"sh",
			"-c",
			"command -v " .. cmd,
		})
		return success and stdout and stdout ~= ""
	end
	if command_exists("zsh") then
		config.default_prog = { "zsh", "-i" }
	elseif command_exists("bash") then
		config.default_prog = { "bash", "-i" }
	else
		config.default_prog = { "sh", "-i" }
	end
end

--- 窗口样式 ---

config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"
config.window_frame = {
	active_titlebar_bg = "#090909",
	inactive_titlebar_bg = "#090909",
}
config.integrated_title_button_alignment = "Right"
config.integrated_title_button_style = "Windows"
config.integrated_title_buttons = { "Hide", "Maximize", "Close" }
config.adjust_window_size_when_changing_font_size = false
config.window_close_confirmation = "NeverPrompt"

--- 标签栏与配色 ---

config.enable_tab_bar = false
config.show_new_tab_button_in_tab_bar = true
config.show_tab_index_in_tab_bar = true
config.switch_to_last_active_tab_when_closing_tab = true
config.tab_max_width = 25
config.use_fancy_tab_bar = true
config.colors = {
	scrollbar_thumb = "#242936",
	tab_bar = {
		active_tab = { bg_color = "#090909", fg_color = "#ff6565" },
		inactive_tab = { bg_color = "#090909", fg_color = "#95e6cb" },
		inactive_tab_hover = { bg_color = "#0f1419", fg_color = "#95e6cb" },
		new_tab = { bg_color = "#090909", fg_color = "#95e6cb" },
		new_tab_hover = { bg_color = "#42a5f5", fg_color = "#ffffff" },
	},
}

---启动菜单---
config.launch_menu = {
	{ label = "Bash", args = { "bash", "-l" } },
	{ label = "Zsh", args = { "zsh", "-l" } },
	{
		label = "Pwsh",
		args = { "pwsh.exe", "-NoLogo" },
	},
	{
		label = "PowerShell",
		args = { "powershell.exe", "-NoLogo" },
	},
	{
		label = "WSL: Ubuntu",
		args = { "wsl.exe", "-d", "Ubuntu-22.04" },
	},
}

--- 键位设计 ---
config.disable_default_key_bindings = true
config.leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1500 }

--- 快捷键 ---
config.keys = {
	-- F11:切换全屏
	{ key = "F11", mods = "NONE", action = wezterm.action.ToggleFullScreen },
	-- Leader + m:隐藏窗口
	{ key = "m", mods = "LEADER", action = wezterm.action.Hide },
	-- Leader + n:新建标签页
	{ key = "n", mods = "LEADER", action = wezterm.action.SpawnTab("CurrentPaneDomain") },
	-- Leader + w:关闭当前标签页(不确认)
	{ key = "w", mods = "LEADER", action = wezterm.action.CloseCurrentTab({ confirm = false }) },
	-- Leader + Tab:切换到下一个标签页
	{ key = "Tab", mods = "LEADER", action = wezterm.action.ActivateTabRelative(1) },
	-- Leader + \\:水平分割
	{ key = "\\", mods = "LEADER", action = wezterm.action.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	-- Leader + -:垂直分割
	{ key = "-", mods = "LEADER", action = wezterm.action.SplitVertical({ domain = "CurrentPaneDomain" }) },
	-- Leader + 方向键:在窗格之间移动
	{ key = "LeftArrow", mods = "LEADER", action = wezterm.action.ActivatePaneDirection("Left") },
	{ key = "DownArrow", mods = "LEADER", action = wezterm.action.ActivatePaneDirection("Down") },
	{ key = "UpArrow", mods = "LEADER", action = wezterm.action.ActivatePaneDirection("Up") },
	{ key = "RightArrow", mods = "LEADER", action = wezterm.action.ActivatePaneDirection("Right") },
	-- Ctrl + Shift + 方向键:调整窗格大小
	{ key = "LeftArrow", mods = "CTRL|SHIFT", action = wezterm.action.AdjustPaneSize({ "Left", 5 }) },
	{ key = "DownArrow", mods = "CTRL|SHIFT", action = wezterm.action.AdjustPaneSize({ "Down", 5 }) },
	{ key = "UpArrow", mods = "CTRL|SHIFT", action = wezterm.action.AdjustPaneSize({ "Up", 5 }) },
	{ key = "RightArrow", mods = "CTRL|SHIFT", action = wezterm.action.AdjustPaneSize({ "Right", 5 }) },
	-- Ctrl + Shift + W:关闭当前窗格(带确认)
	{ key = "w", mods = "CTRL|SHIFT", action = wezterm.action.CloseCurrentPane({ confirm = true }) },
	-- Leader + t:切换标签栏显示 / 隐藏
	{ key = "t", mods = "LEADER", action = wezterm.action.EmitEvent("toggle-tab-bar") },
	-- Leader + f:搜索
	{ key = "f", mods = "LEADER", action = wezterm.action.Search("CurrentSelectionOrEmptyString") },
	-- Leader + p:打开 Launcher(类似 VS Code 命令面板)
	{ key = "p", mods = "LEADER", action = wezterm.action.ShowLauncher },
	-- Leader + k:清除滚动缓冲区
	{ key = "k", mods = "LEADER", action = wezterm.action.ClearScrollback("ScrollbackAndViewport") },
	-- F1:帮助 / 命令面板
	{
		key = "F1",
		action = wezterm.action.ShowLauncherArgs({
			flags = "FUZZY|LAUNCH_MENU_ITEMS|DOMAINS|KEY_ASSIGNMENTS",
		}),
	},
	-- Leader + Home/End:快速滚动到顶部/底部
	{ key = "Home", mods = "LEADER", action = wezterm.action.ScrollToTop },
	{ key = "End", mods = "LEADER", action = wezterm.action.ScrollToBottom },
	{ key = "v", mods = "CTRL", action = wezterm.action.PasteFrom("Clipboard") },
}

---鼠标行为---
config.disable_default_mouse_bindings = false
config.mouse_bindings = {
	{ -- 左键选择文本并复制到剪贴板
		event = { Up = { streak = 1, button = "Left" } },
		mods = "NONE",
		action = wezterm.action.CompleteSelection("Clipboard"),
	},
	{ -- 右键粘贴剪贴板内容
		event = { Down = { streak = 1, button = "Right" } },
		mods = "NONE",
		action = wezterm.action.PasteFrom("Clipboard"),
	},
	{
		-- 按住 Ctrl+Alt 拖动左键移动窗口
		event = { Drag = { streak = 1, button = "Left" } },
		mods = "CTRL|ALT",
		action = wezterm.action.StartWindowDrag,
	},
	{
		-- 按住 Ctrl 点击左键打开超链接
		event = { Up = { streak = 1, button = "Left" } },
		mods = "CTRL",
		action = wezterm.action.OpenLinkAtMouseCursor,
	},
}

---高级功能---
config.enable_scroll_bar = true
config.scrollback_lines = 20000
config.automatically_reload_config = true
config.exit_behavior = "CloseOnCleanExit"
config.exit_behavior_messaging = "Verbose"
config.status_update_interval = 50000

---超链接处理规则---
-- config.hyperlink_rules = {
-- 	{ regex = "\\", format = "1", highlight = 1 },
-- 	{ regex = "\\{(\\w+://\\S+)\\}", format = "1", highlight = 1 },
-- 	{ regex = "\\b\\w+://\\S+[)/a-zA-Z0-9-]+", format = "0" },
-- }

return config
