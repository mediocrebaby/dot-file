import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const HISTORY_LIMIT = 100;

type HistoryFile = {
	workspace: string;
	prompts: string[];
};

function workspaceKey(cwd: string): string {
	const normalized = process.platform === "win32" ? resolve(cwd).toLowerCase() : resolve(cwd);
	return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function historyPath(cwd: string): string {
	const configDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	return join(configDir, "workspace-history", `${workspaceKey(cwd)}.json`);
}

function loadHistory(cwd: string): HistoryFile {
	const file = historyPath(cwd);
	try {
		const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<HistoryFile>;
		const prompts = Array.isArray(parsed.prompts)
			? parsed.prompts.filter((prompt): prompt is string => typeof prompt === "string").slice(-HISTORY_LIMIT)
			: [];
		return { workspace: resolve(cwd), prompts };
	} catch {
		return { workspace: resolve(cwd), prompts: [] };
	}
}

function saveHistory(file: string, history: HistoryFile): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

export default function (pi: ExtensionAPI) {
	let sessionGeneration = 0;

	pi.on("session_start", (_event, ctx) => {
		const generation = ++sessionGeneration;
		if (ctx.mode !== "tui") return;

		// 部分界面扩展会在 session_start 后通过零延迟定时器替换编辑器。
		// 先进入同一轮 timers，再用 setImmediate 包装最终安装的编辑器。
		const timer = setTimeout(() => {
			const immediate = setImmediate(() => {
				if (generation !== sessionGeneration) return;

				const file = historyPath(ctx.cwd);
				const history = loadHistory(ctx.cwd);
				const previousFactory = ctx.ui.getEditorComponent();
				let warned = false;

				ctx.ui.setEditorComponent((tui, theme, keybindings) => {
					const editor = previousFactory?.(tui, theme, keybindings) ?? new CustomEditor(tui, theme, keybindings);
					const addToEditorHistory = editor.addToHistory.bind(editor);

					for (const prompt of history.prompts) {
						addToEditorHistory(prompt);
					}

					editor.addToHistory = (text: string) => {
						addToEditorHistory(text);

						const prompt = text.trim();
						if (!prompt || history.prompts.at(-1) === prompt) return;

						history.prompts.push(prompt);
						history.prompts = history.prompts.slice(-HISTORY_LIMIT);

						try {
							saveHistory(file, history);
						} catch (error) {
							if (!warned) {
								warned = true;
								console.warn(`[prompt-history] 无法保存历史记录：${String(error)}`);
							}
						}
					};

					return editor;
				});
			});
			immediate.unref?.();
		}, 0);
		timer.unref?.();
	});

	pi.on("session_shutdown", () => {
		sessionGeneration++;
	});
}
