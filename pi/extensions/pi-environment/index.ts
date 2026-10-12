import { basename, extname } from "node:path";

import {
	getPowerShellConfig,
	getShellConfig,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const BEFORE_AGENT_START_EVENT = "before_agent_start";
const ENVIRONMENT_HEADING = "Runtime Environment:";
const OPERATING_SYSTEM_FIELD = "- Operating System:";
const SHELL_FIELD = "- Shell:";
const PROMPT_LINE_SEPARATOR = "\n";
const PROMPT_SECTION_SEPARATOR = "\n\n";
const UNKNOWN_VALUE = "Unknown";

const OPERATING_SYSTEM_LABELS: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
	win32: "Windows",
	darwin: "macOS",
	linux: "Linux",
};

const SHELL_LABELS: Readonly<Record<string, string>> = {
	bash: "Bash",
	zsh: "Zsh",
	fish: "Fish",
	sh: "Shell",
	pwsh: "PowerShell",
	powershell: "PowerShell",
	cmd: "Command Prompt",
};

function detectOperatingSystem(): string {
	return OPERATING_SYSTEM_LABELS[process.platform] ?? UNKNOWN_VALUE;
}

function detectShell(): string {
	try {
		const shellConfig = process.platform === "win32"
			? getPowerShellConfig()
			: getShellConfig();
		const shellPath = shellConfig.shell;
		const shellFileName = basename(shellPath);
		const shellName = basename(shellFileName, extname(shellFileName));

		if (!shellName) return UNKNOWN_VALUE;

		return SHELL_LABELS[shellName.toLowerCase()] ?? shellName;
	} catch {
		return UNKNOWN_VALUE;
	}
}

export default function piEnvironment(pi: ExtensionAPI): void {
	const environmentPrompt = [
		ENVIRONMENT_HEADING,
		`${OPERATING_SYSTEM_FIELD} ${detectOperatingSystem()}`,
		`${SHELL_FIELD} ${detectShell()}`,
	].join(PROMPT_LINE_SEPARATOR);

	// Publish after all extensions are loaded, including on session switches.
	// The viewer needs this prefix even when no agent run is active.
	pi.on("session_start", () => {
		pi.events.emit("environment:prompt", environmentPrompt);
	});

	pi.on(BEFORE_AGENT_START_EVENT, event => ({
		systemPrompt: `${environmentPrompt}${PROMPT_SECTION_SEPARATOR}${event.systemPrompt}`,
	}));
}
