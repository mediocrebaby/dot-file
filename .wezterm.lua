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
	"JetBrainsLxgwNerdMono",
})
config.font_size = 12

-- 中等窗口大小
config.initial_cols = 120
config.initial_rows = 35

-- 窗口创建时设置居中位置
wezterm.on("gui-startup", function(cmd)
	local screen = wezterm.gui.screens().active
	local tab, pane, window = wezterm.mux.spawn_window(cmd or {})

	-- 等待窗口完全创建后获取实际尺寸
	local gui_win = window:gui_window()
	local dimensions = gui_win:get_dimensions()

	-- 使用实际窗口尺寸计算居中位置
	local x = (screen.width - dimensions.pixel_width) / 2 + screen.x
	local y = (screen.height - dimensions.pixel_height) / 2 + screen.y

	gui_win:set_position(x, y)
end)

--- 主题和性能配置 ---
config.color_scheme = "Ayu Mirage"
config.max_fps = 120
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
config.window_decorations = "RESIZE"
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
config.enable_tab_bar = true
config.show_new_tab_button_in_tab_bar = false
config.show_tab_index_in_tab_bar = false
config.switch_to_last_active_tab_when_closing_tab = true
config.tab_max_width = 25
config.use_fancy_tab_bar = false
config.colors = {
	scrollbar_thumb = "#242936",
	tab_bar = {
		background = "rgba(0,0,0,0)",
	},
}

--- Cells 工具类 (用于构建格式化文本) ---
local Cells = {}
Cells.__index = Cells

function Cells:new()
	return setmetatable({ segments = {} }, self)
end

function Cells:add_segment(segment_id, text, color, attributes)
	color = color or {}
	local items = {}
	if color.bg then
		table.insert(items, { Background = { Color = color.bg } })
	end
	if color.fg then
		table.insert(items, { Foreground = { Color = color.fg } })
	end
	if attributes and #attributes > 0 then
		for _, attr in ipairs(attributes) do
			table.insert(items, attr)
		end
	end
	table.insert(items, { Text = text })
	table.insert(items, "ResetAttributes")
	self.segments[segment_id] = {
		items = items,
		has_bg = color.bg ~= nil,
		has_fg = color.fg ~= nil,
	}
	return self
end

function Cells:update_segment_text(segment_id, text)
	local idx = #self.segments[segment_id].items - 1
	self.segments[segment_id].items[idx] = { Text = text }
	return self
end

function Cells:update_segment_colors(segment_id, color)
	local has_bg = self.segments[segment_id].has_bg
	local has_fg = self.segments[segment_id].has_fg
	if color.bg and has_bg then
		self.segments[segment_id].items[1] = { Background = { Color = color.bg } }
	end
	if color.fg then
		local fg_idx = has_bg and 2 or 1
		if has_fg then
			self.segments[segment_id].items[fg_idx] = { Foreground = { Color = color.fg } }
		end
	end
	return self
end

function Cells:render(ids)
	local cells = {}
	for _, id in ipairs(ids) do
		for _, item in pairs(self.segments[id].items) do
			table.insert(cells, item)
		end
	end
	return cells
end

--- 自定义标签页样式 (圆角药丸形状) ---
local nf = wezterm.nerdfonts
local GLYPH_SCIRCLE_LEFT = nf.ple_left_half_circle_thick --
local GLYPH_SCIRCLE_RIGHT = nf.ple_right_half_circle_thick --
local GLYPH_CIRCLE = nf.fa_circle --
local GLYPH_ADMIN = nf.md_shield_half_full -- 󰞀
local GLYPH_LINUX = nf.cod_terminal_linux --

local TAB_TITLE_INSET = 4

local tab_title_colors = {
	text_default = { bg = "#61637E", fg = "#1C1B19" },
	text_hover = { bg = "#517EAB", fg = "#1C1B19" },
	text_active = { bg = "#74C7EC", fg = "#11111B" },
	scircle_default = { bg = "rgba(0, 0, 0, 0)", fg = "#45475A" },
	scircle_hover = { bg = "rgba(0, 0, 0, 0)", fg = "#3A5A7A" },
	scircle_active = { bg = "rgba(0, 0, 0, 0)", fg = "#5795B1" },
}

local function clean_process_name(proc)
	local a = string.gsub(proc, "(.*[/\\])(.*)", "%2")
	return a:gsub("%.exe$", "")
end

local function create_tab_title(process_name, base_title, max_width, inset)
	local title
	title = base_title

	-- 如果 title 为空字符串，使用 process_name
	if not title or title == "" then
		title = process_name
	end
	
	-- 计算可用宽度
	local available_width = max_width - inset

	-- 使用 wezterm.column_width 正确计算显示宽度（支持中文等全角字符）
	if wezterm.column_width(title) > available_width then
		-- 逐字符截断，确保不超过可用宽度
		local truncated = ""
		for _, char in utf8.codes(title) do
			local next_str = truncated .. utf8.char(char)
			if wezterm.column_width(next_str) > available_width then
				break
			end
			truncated = next_str
		end
		title = truncated
	end
	return title
end


wezterm.on("format-tab-title", function(tab, tabs, panes, config_obj, hover, max_width)
	local process_name = clean_process_name(tab.active_pane.foreground_process_name)
	local is_wsl = process_name:match("^wsl") ~= nil
	local is_admin = (tab.active_pane.title:match("^Administrator: ") or tab.active_pane.title:match("(Admin)")) ~= nil
	local inset = (is_admin or is_wsl) and 6 or TAB_TITLE_INSET
	local title = create_tab_title(process_name, tab.active_pane.title, max_width, inset)

	local tab_state = "default"
	if tab.is_active then
		tab_state = "active"
	elseif hover then
		tab_state = "hover"
	end

	local cells = Cells:new()
	cells
		:add_segment("scircle_left", GLYPH_SCIRCLE_LEFT, tab_title_colors["scircle_" .. tab_state])
		:add_segment("admin", " " .. GLYPH_ADMIN, tab_title_colors["text_" .. tab_state])
		:add_segment("wsl", " " .. GLYPH_LINUX, tab_title_colors["text_" .. tab_state])
		:add_segment(
			"title",
			" " .. title,
			tab_title_colors["text_" .. tab_state],
			{ { Attribute = { Intensity = "Bold" } } }
		)
		:add_segment("padding", " ", tab_title_colors["text_" .. tab_state])
		:add_segment("scircle_right", GLYPH_SCIRCLE_RIGHT, tab_title_colors["scircle_" .. tab_state])

	local render_order
	if is_admin then
		render_order = { "scircle_left", "admin", "title", "padding", "scircle_right" }
	elseif is_wsl then
		render_order = { "scircle_left", "wsl", "title", "padding", "scircle_right" }
	else
		render_order = { "scircle_left", "title", "padding", "scircle_right" }
	end

	return cells:render(render_order)
end)


--- 键位设计 ---
config.disable_default_key_bindings = true
config.leader = { key = "a", mods = "CTRL", timeout_milliseconds = 1500 }

--- 快捷键 ---
config.keys = {
	-- F11:切换全屏
	{ key = "F11", mods = "NONE", action = wezterm.action.ToggleFullScreen },
	-- Leader + m:隐藏窗口
	{ key = "m", mods = "LEADER", action = wezterm.action.Hide },
	-- Leader + n:新建窗口
	{
		key = "n",
		mods = "LEADER",
		action = wezterm.action_callback(function(window, pane)
			local screen = wezterm.gui.screens().active
			local dimensions = window:get_dimensions()

			local x = (screen.width - dimensions.pixel_width) / 2 + screen.x
			local y = (screen.height - dimensions.pixel_height) / 2 + screen.y

			wezterm.mux.spawn_window({
				position = {
					x = x,
					y = y,
					origin = "ActiveScreen",
				},
			})
		end),
	},
	-- Leader + w:关闭当前标签页(不确认)
	{ key = "w", mods = "LEADER", action = wezterm.action.CloseCurrentTab({ confirm = false }) },
	-- Leader + Tab:切换到下一个标签页
	{ key = "Tab", mods = "LEADER", action = wezterm.action.ActivateTabRelative(1) },
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
	-- Ctrl + Shift + W:关闭当前窗格(不带确认)
	{ key = "w", mods = "CTRL|SHIFT", action = wezterm.action.CloseCurrentPane({ confirm = false }) },
	-- Leader + t:切换标签栏显示 / 隐藏
	{ key = "t", mods = "LEADER", action = wezterm.action.EmitEvent("toggle-tab-bar") },
	-- Leader + f:搜索
	{ key = "f", mods = "LEADER", action = wezterm.action.Search("CurrentSelectionOrEmptyString") },
	-- Leader + p:打开 Launcher
	{ key = "p", mods = "LEADER", action = wezterm.action.ActivateCommandPalette },
	-- Leader + k:清除滚动缓冲区
	{ key = "k", mods = "LEADER", action = wezterm.action.ClearScrollback("ScrollbackAndViewport") },
	-- Leader + Home/End:快速滚动到顶部/底部
	{ key = "Home", mods = "LEADER", action = wezterm.action.ScrollToTop },
	{ key = "End", mods = "LEADER", action = wezterm.action.ScrollToBottom },
	{ key = "v", mods = "CTRL", action = wezterm.action.PasteFrom("Clipboard") },
}
for i = 1, 9 do
	table.insert(config.keys, {
		key = tostring(i),
		mods = "ALT",
		action = wezterm.action.ActivateTab(i - 1),
	})
end

---鼠标行为---
-- 当应用（如 Neovim）开启鼠标上报时，按住这些修饰键会绕过上报，让 WezTerm 自己处理鼠标事件
-- 这样可保证 Ctrl+Alt+拖动 仍能用于移动窗口
config.bypass_mouse_reporting_modifiers = "SHIFT"

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

--- 新增命令（专用于Windows) ---

local WSL_DISTRO = "Ubuntu-"

local function url_decode(str)
	if not str then
		return str
	end
	return (str:gsub("%%(%x%x)", function(hex)
		return string.char(tonumber(hex, 16))
	end))
end

local function cwd_uri_to_windows_path(cwd_uri)
	if not cwd_uri then
		return nil
	end

	local uri = tostring(cwd_uri)
	if not uri:match("^file:") then
		return nil
	end

	-- file:///C:/Users/...  or  file://hostname/C:/Users/...  or  file://wsl.localhost/Ubuntu-22.04/home/me
	local host, path = uri:match("^file://([^/]*)(/.*)$")
	if not path then
		path = uri:match("^file:(/.*)$")
	end
	if not path then
		return nil
	end

	path = url_decode(path)

	-- Some environments encode the WSL host as the first path segment:
	--   /wsl.hostname/Ubuntu-22.04/home/me
	-- Map it to a Windows UNC path so we can convert consistently.
	if not host or host == "" then
		local derived_host, rest = path:match("^/(wsl%.[^/]+)/(.+)$")
		if derived_host and rest then
			return ("\\\\%s\\%s"):format(derived_host, rest:gsub("/", "\\"))
		end
	end

	-- WSL URIs are represented as file://wsl.*/<distro>/...; map them to a Windows UNC path.
	if host and host ~= "" then
		local h = host:lower()
		if h == "wsl$" or h:match("^wsl%.") then
			local clean = path:gsub("^/", ""):gsub("/", "\\")
			return ("\\\\%s\\%s"):format(host, clean)
		end
	end

	-- /C:/Users -> C:\Users
	path = path:gsub("^/([A-Za-z]:)", "%1")
	path = path:gsub("/", "\\")
	return path
end

local function cwd_uri_to_unix_path(cwd_uri, distro)
	if not cwd_uri then
		return nil
	end

	local uri = tostring(cwd_uri)
	if not uri:match("^file:") then
		return nil
	end

	local host, path = uri:match("^file://([^/]*)(/.*)$")
	if not path then
		path = uri:match("^file:(/.*)$")
	end
	if not path then
		return nil
	end

	path = url_decode(path)

	-- If it already looks like a unix path (and not a windows drive path), accept it.
	local is_windows_drive_path = path:match("^/[A-Za-z]:") ~= nil
	if not is_windows_drive_path then
		-- file://wsl.<host>/<distro>/home/me  => /home/me
		if host and host ~= "" then
			local h = host:lower()
			if h == "wsl$" or h:match("^wsl%.") then
				local distro_pat = distro:gsub("([^%w])", "%%%1")
				local rest = path:match("^/" .. distro_pat .. "/(.+)$")
				if rest then
					return "/" .. rest
				end
				if path == "/" .. distro then
					return "/"
				end
			end
		end

		-- file:///wsl.<host>/<distro>/home/me  => /home/me
		local distro_pat = distro:gsub("([^%w])", "%%%1")
		local rest = path:match("^/wsl%.[^/]+/" .. distro_pat .. "/(.+)$")
		if rest then
			return "/" .. rest
		end
		if path:match("^/wsl%.[^/]+/" .. distro_pat .. "$") then
			return "/"
		end

		-- plain unix path like /home/me
		return path
	end

	return nil
end

local function windows_path_to_wsl_path(win_path, distro)
	if not win_path then
		return nil
	end

	-- \\wsl.localhost\Ubuntu-22.04\home\me -> /home/me
	local unc_localhost_prefix = ("\\\\wsl.localhost\\%s\\"):format(distro)
	if win_path:sub(1, #unc_localhost_prefix):lower() == unc_localhost_prefix:lower() then
		local rest = win_path:sub(#unc_localhost_prefix + 1)
		return ("/" .. rest:gsub("\\", "/"))
	end

	-- \\wsl$\Ubuntu-22.04\home\me -> /home/me
	local unc_dollar_prefix = ("\\\\wsl$\\%s\\"):format(distro)
	if win_path:sub(1, #unc_dollar_prefix):lower() == unc_dollar_prefix:lower() then
		local rest = win_path:sub(#unc_dollar_prefix + 1)
		return ("/" .. rest:gsub("\\", "/"))
	end

	-- C:\foo\bar -> /mnt/c/foo/bar
	local drive, rest = win_path:match("^([A-Za-z]):[\\/]?(.*)$")
	if drive then
		rest = rest:gsub("\\", "/")
		if rest == "" then
			return "/mnt/" .. drive:lower()
		end
		return "/mnt/" .. drive:lower() .. "/" .. rest
	end

	-- 兜底：尽量转成 linux 风格
	return win_path:gsub("\\", "/")
end

local function get_current_dir_for_domain(pane, domain_name)
	if not pane then
		return nil
	end

	local cwd_uri = pane:get_current_working_dir()
	if not cwd_uri then
		return nil
	end

	if domain_name == ("WSL:" .. WSL_DISTRO) then
		-- For WSL->WSL spawning, prefer a real unix cwd.
		local unix_cwd = cwd_uri_to_unix_path(cwd_uri, WSL_DISTRO)
		if unix_cwd then
			return unix_cwd
		end

		-- Fallback: Convert via Windows path -> WSL path.
		local win_path = cwd_uri_to_windows_path(cwd_uri)
		if not win_path then
			return nil
		end
		return windows_path_to_wsl_path(win_path, WSL_DISTRO)
	end

	-- local domain expects a native Windows path.
	if domain_name == "local" then
		return cwd_uri_to_windows_path(cwd_uri)
	end

	return nil
end

wezterm.on("toggle-tab-bar", function(window, pane)
	local overrides = window:get_config_overrides() or {}
	if overrides.enable_tab_bar == nil then
		overrides.enable_tab_bar = false
	else
		overrides.enable_tab_bar = not overrides.enable_tab_bar
	end
	window:set_config_overrides(overrides)
end)

local function spawn_tab_in_domain_with_cwd(window, pane, domain_name)
	local cwd = get_current_dir_for_domain(pane, domain_name)
	window:perform_action(
		wezterm.action.SpawnCommandInNewTab({
			domain = { DomainName = domain_name },
			cwd = cwd,
		}),
		pane
	)
end

wezterm.on("command_palette_spawn_wsl_ubuntu", function(window, pane)
	spawn_tab_in_domain_with_cwd(window, pane, "WSL:" .. WSL_DISTRO)
end)

wezterm.on("command_palette_spawn_local", function(window, pane)
	spawn_tab_in_domain_with_cwd(window, pane, "local")
end)

local VS_DEV_SHELL_PATH =
	"C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\Launch-VsDevShell.ps1"

local function spawn_vs_tab(window, pane, arch)
	local cwd = get_current_dir_for_domain(pane, "local")
	-- Map "x64" to "amd64" for the PowerShell script; "x86" works as is.
	local ps_arch = (arch == "x64") and "amd64" or arch

	-- Construct the command to execute Launch-VsDevShell.ps1
	-- We use -NoExit so the shell stays open.
	local command = string.format("& '%s' -Arch %s  -SkipAutomaticLocation", VS_DEV_SHELL_PATH, ps_arch)

	window:perform_action(
		wezterm.action.SpawnCommandInNewTab({
			domain = { DomainName = "local" },
			cwd = cwd,
			args = { "pwsh", "-NoLogo", "-NoExit", "-Command", command },
		}),
		pane
	)
end

wezterm.on("command_palette_spawn_vs_x64", function(window, pane)
	spawn_vs_tab(window, pane, "x64")
end)

wezterm.on("command_palette_spawn_vs_x86", function(window, pane)
	spawn_vs_tab(window, pane, "x86")
end)

wezterm.on("augment-command-palette", function(window, pane)
	return {
		{
			brief = "New tab: WSL Ubuntu  (current cwd)",
			action = wezterm.action.EmitEvent("command_palette_spawn_wsl_ubuntu"),
			icon = "cod_terminal_ubuntu",
		},
		{
			brief = "New tab: local (current cwd)",
			action = wezterm.action.EmitEvent("command_palette_spawn_local"),
			icon = "cod_terminal_powershell",
		},
		{
			brief = "New tab: Visual Studio 2022 (x64)",
			action = wezterm.action.EmitEvent("command_palette_spawn_vs_x64"),
			icon = "dev_visualstudio",
		},
		{
			brief = "New tab: Visual Studio 2022 (x86)",
			action = wezterm.action.EmitEvent("command_palette_spawn_vs_x86"),
			icon = "dev_visualstudio",
		},
	}
end)


---高级功能---
config.enable_scroll_bar = false
config.scrollback_lines = 20000
config.automatically_reload_config = true
config.exit_behavior = "CloseOnCleanExit"
config.exit_behavior_messaging = "Verbose"
config.status_update_interval = 50000

---透明效果---
-- 通用透明度设置
config.window_background_opacity = 0.3
-- 文字背景透明度（让文字更清晰）
config.text_background_opacity = 0.5

---窗口图片设置---
config.background = {
	-- 背景图片层
	{
		source = {
			File = "", -- 图片路径
		},
		-- 图片透明度 (0.0 - 1.0，值越小越透明)
		opacity = 0.9,
		hsb = {
			brightness = 0.2, -- 亮度，降低可让文字更清晰
			saturation = 1.0, -- 饱和度
			hue = 1.0, -- 色调
		},
	},
}

-- 文字透明度/颜色调整
config.foreground_text_hsb = {
	hue = 1.0,
	saturation = 1.0,
	brightness = 1.0, -- 增加文字亮度，提高可读性
}

return config
