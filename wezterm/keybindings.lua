local wezterm = require('wezterm')
local M = {}
local platform = require('utils.platform')
local domains = require('domains')

function M.apply(config)
	--- 键位设计 ---
	config.disable_default_key_bindings = true
  local mod_key = ""
	if platform.is_macos() then
    mod_key = "CMD"
  else
    mod_key = "CTRL"
  end

  local super_key = "CTRL"


  config.leader = { key = "a", mods = mod_key, timeout_milliseconds = 1500 }
	--- 快捷键 ---
	config.keys = {
		-- F11:切换全屏
		{ key = "F11", mods = "NONE", action = wezterm.action.ToggleFullScreen },
		-- Leader + m:隐藏窗口
		{ key = "m", mods = "LEADER", action = wezterm.action.Hide },
		-- Leader + n:新建窗口
		{ key = "n", mods = "LEADER", action = wezterm.action.SpawnWindow },
		-- Leader + w:关闭当前标签页(不确认)
		{ key = "w", mods = "LEADER", action = wezterm.action.CloseCurrentTab({ confirm = false }) },
		-- Leader + 方向键:在窗格之间移动
		{ key = "LeftArrow",  mods = "LEADER",     action = wezterm.action.ActivatePaneDirection("Left") },
		{ key = "DownArrow",  mods = "LEADER",     action = wezterm.action.ActivatePaneDirection("Down") },
		{ key = "UpArrow",    mods = "LEADER",     action = wezterm.action.ActivatePaneDirection("Up") },
		{ key = "RightArrow", mods = "LEADER",     action = wezterm.action.ActivatePaneDirection("Right") },
		-- Ctrl + Shift + 方向键:调整窗格大小
		{ key = "LeftArrow",  mods = mod_key.."|SHIFT", action = wezterm.action.AdjustPaneSize({ "Left",  5 }) },
		{ key = "DownArrow",  mods = mod_key.."|SHIFT", action = wezterm.action.AdjustPaneSize({ "Down",  5 }) },
		{ key = "UpArrow",    mods = mod_key.."|SHIFT", action = wezterm.action.AdjustPaneSize({ "Up",    5 }) },
		{ key = "RightArrow", mods = mod_key.."|SHIFT", action = wezterm.action.AdjustPaneSize({ "Right", 5 }) },
		-- Ctrl + Shift + W:关闭当前窗格(不带确认)
		{ key = "w", mods = mod_key.."|SHIFT", action = wezterm.action.CloseCurrentPane({ confirm = false }) },
		-- Leader + -:垂直分割(WSL domain 下继承父 pane cwd)
		{ key = "-",  mods = "LEADER", action = wezterm.action_callback(function(window, pane)
			domains.split_with_cwd(window, pane, "Vertical")
		end) },
		-- Leader + \:水平分割(WSL domain 下继承父 pane cwd)
		{ key = "\\", mods = "LEADER", action = wezterm.action_callback(function(window, pane)
			domains.split_with_cwd(window, pane, "Horizontal")
		end) },
		-- Leader + f:搜索
		{ key = "f", mods = "LEADER", action = wezterm.action.Search("CurrentSelectionOrEmptyString") },
		-- Leader + p:打开 Launcher
		{ key = "p", mods = "LEADER", action = wezterm.action.ActivateCommandPalette },
		-- Leader + k:清除滚动缓冲区
		{ key = "k", mods = "LEADER", action = wezterm.action.ClearScrollback("ScrollbackAndViewport") },
		-- Leader + Home/End:快速滚动到顶部/底部
		{ key = "Home", mods = "LEADER", action = wezterm.action.ScrollToTop },
		{ key = "End",  mods = "LEADER", action = wezterm.action.ScrollToBottom },
		-- Ctrl + V:粘贴
		{ key = "v", mods = mod_key, action = wezterm.action.PasteFrom("Clipboard") },
    -- Leader + x:  进入 Copy 模式
		{ key = "x", mods = "LEADER", action = wezterm.action.ActivateCopyMode },
	}

	-- Alt + 1-9 切换标签页
	for i = 1, 9 do
		table.insert(config.keys, {
			key = tostring(i),
			mods = super_key,
			action = wezterm.action.ActivateTab(i - 1),
		})
	end

	---鼠标行为---
	config.bypass_mouse_reporting_modifiers = "SHIFT"
	config.disable_default_mouse_bindings = false
	config.mouse_bindings = {
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "NONE",
			action = wezterm.action.CompleteSelection("Clipboard"),
		},
		{
			event = { Down = { streak = 1, button = "Right" } },
			mods = "NONE",
			action = wezterm.action.PasteFrom("Clipboard"),
		},
		{
			event = { Drag = { streak = 1, button = "Left" } },
			mods = "CTRL|ALT",
			action = wezterm.action.StartWindowDrag,
		},
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "CTRL",
			action = wezterm.action.OpenLinkAtMouseCursor,
		},
	}
end

return M
