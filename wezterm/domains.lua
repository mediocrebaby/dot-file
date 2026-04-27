local wezterm = require('wezterm')
local M = {}
local platform = require('utils.platform')

local WSL_DISTRO = "Ubuntu-22.04"

local VS_DEV_SHELL_PATH =
	"C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\Launch-VsDevShell.ps1"

local function url_decode(str)
	if not str then return str end
	return (str:gsub("%%(%x%x)", function(hex)
		return string.char(tonumber(hex, 16))
	end))
end

local function cwd_uri_to_windows_path(cwd_uri)
	if not cwd_uri then return nil end
	local uri = tostring(cwd_uri)
	if not uri:match("^file:") then return nil end

	local host, path = uri:match("^file://([^/]*)(/.*)$")
	if not path then path = uri:match("^file:(/.*)$") end
	if not path then return nil end

	path = url_decode(path)

	if not host or host == "" then
		local derived_host, rest = path:match("^/(wsl%.[^/]+)/(.+)$")
		if derived_host and rest then
			return ("\\\\%s\\%s"):format(derived_host, rest:gsub("/", "\\"))
		end
	end

	if host and host ~= "" then
		local h = host:lower()
		if h == "wsl$" or h:match("^wsl%.") then
			local clean = path:gsub("^/", ""):gsub("/", "\\")
			return ("\\\\%s\\%s"):format(host, clean)
		end
	end

	path = path:gsub("^/([A-Za-z]:)", "%1")
	path = path:gsub("/", "\\")
	return path
end

local function cwd_uri_to_unix_path(cwd_uri, distro)
	if not cwd_uri then return nil end
	local uri = tostring(cwd_uri)
	if not uri:match("^file:") then return nil end

	local host, path = uri:match("^file://([^/]*)(/.*)$")
	if not path then path = uri:match("^file:(/.*)$") end
	if not path then return nil end

	path = url_decode(path)

	local is_windows_drive_path = path:match("^/[A-Za-z]:") ~= nil
	if not is_windows_drive_path then
		if host and host ~= "" then
			local h = host:lower()
			if h == "wsl$" or h:match("^wsl%.") then
				local distro_pat = distro:gsub("([^%w])", "%%%1")
				local rest = path:match("^/" .. distro_pat .. "/(.+)$")
				if rest then return "/" .. rest end
				if path == "/" .. distro then return "/" end
			end
		end

		local distro_pat = distro:gsub("([^%w])", "%%%1")
		local rest = path:match("^/wsl%.[^/]+/" .. distro_pat .. "/(.+)$")
		if rest then return "/" .. rest end
		if path:match("^/wsl%.[^/]+/" .. distro_pat .. "$") then return "/" end

		return path
	end
	return nil
end

local function windows_path_to_wsl_path(win_path, distro)
	if not win_path then return nil end

	local unc_localhost_prefix = ("\\\\wsl.localhost\\%s\\"):format(distro)
	if win_path:sub(1, #unc_localhost_prefix):lower() == unc_localhost_prefix:lower() then
		local rest = win_path:sub(#unc_localhost_prefix + 1)
		return ("/" .. rest:gsub("\\", "/"))
	end

	local unc_dollar_prefix = ("\\\\wsl$\\%s\\"):format(distro)
	if win_path:sub(1, #unc_dollar_prefix):lower() == unc_dollar_prefix:lower() then
		local rest = win_path:sub(#unc_dollar_prefix + 1)
		return ("/" .. rest:gsub("\\", "/"))
	end

	local drive, rest = win_path:match("^([A-Za-z]):[\\/]?(.*)$")
	if drive then
		rest = rest:gsub("\\", "/")
		if rest == "" then return "/mnt/" .. drive:lower() end
		return "/mnt/" .. drive:lower() .. "/" .. rest
	end

	return win_path:gsub("\\", "/")
end

local function get_current_dir_for_domain(pane, domain_name)
	if not pane then return nil end
	local cwd_uri = pane:get_current_working_dir()
	if not cwd_uri then return nil end

	if domain_name == ("WSL:" .. WSL_DISTRO) then
		local unix_cwd = cwd_uri_to_unix_path(cwd_uri, WSL_DISTRO)
		if unix_cwd then return unix_cwd end
		local win_path = cwd_uri_to_windows_path(cwd_uri)
		if not win_path then return nil end
		return windows_path_to_wsl_path(win_path, WSL_DISTRO)
	end

	if domain_name == "local" then
		return cwd_uri_to_windows_path(cwd_uri)
	end

	return nil
end

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

function M.split_with_cwd(window, pane, direction)
	local domain_name = pane:get_domain_name()
	local args = { domain = "CurrentPaneDomain" }

	if domain_name == ("WSL:" .. WSL_DISTRO) then
		local cwd = get_current_dir_for_domain(pane, domain_name)
		if cwd then args.cwd = cwd end
	end

	local action = (direction == "Vertical")
		and wezterm.action.SplitVertical(args)
		or wezterm.action.SplitHorizontal(args)
	window:perform_action(action, pane)
end

local function spawn_vs_tab(window, pane, arch)
	local cwd = get_current_dir_for_domain(pane, "local")
	local ps_arch = (arch == "x64") and "amd64" or arch
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

function M.setup()
  if platform.is_windows() then
    wezterm.on("command_palette_spawn_wsl_ubuntu", function(window, pane)
      spawn_tab_in_domain_with_cwd(window, pane, "WSL:" .. WSL_DISTRO)
    end)

    wezterm.on("command_palette_spawn_local", function(window, pane)
      spawn_tab_in_domain_with_cwd(window, pane, "local")
    end)

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
  end
end

return M
