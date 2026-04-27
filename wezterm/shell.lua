local wezterm = require('wezterm')
local platform = require('utils.platform')
local M = {}

function M.apply(config)
	--- 自动选择shell ---
	if platform.is_windows() then
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
end

return M
