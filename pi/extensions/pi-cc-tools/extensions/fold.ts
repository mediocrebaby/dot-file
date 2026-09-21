/**
 * Ctrl+O 三档工具显示层级的纯函数实现。
 *
 * 0 = 逐条摘要：每个工具一行，显示命令行
 * 1 = 完整输出：Pi 原来的展开形态
 * 2 = 整组压缩：同一批次内的工具组合并成一行，命令行不再显示
 *
 * 这里只放与 pi 运行时组件无关的计算，方便直接用 node --test 验证。
 */

export type ToolFoldLevel = 0 | 1 | 2;
export type ToolFoldLevelName = "steps" | "full" | "compressed";

/** Pi 的展开布尔值每次翻转对应一次 Ctrl+O 按键，用它推进三档循环。 */
export function nextToolFoldLevel(level: ToolFoldLevel): ToolFoldLevel {
	return ((level + 1) % 3) as ToolFoldLevel;
}

/** 只有中间一档使用 Pi 的完整输出形态。 */
export function isToolFoldExpanded(level: ToolFoldLevel): boolean {
	return level === 1;
}

/** /cc-tools status 和设置文件里使用的档位名称。 */
export function toolFoldLevelName(level: ToolFoldLevel): ToolFoldLevelName {
	if (level === 2) return "compressed";
	if (level === 1) return "full";
	return "steps";
}

/** 把持久化设置映射成内部档位；缺失或非法值回到 steps。 */
export function toolFoldLevelFromName(value: unknown): ToolFoldLevel {
	if (value === "compressed") return 2;
	if (value === "full") return 1;
	return 0;
}

export interface FoldRunBounds {
	start: number;
	end: number;
}

/**
 * 从 index 出发向两侧扩展同一批次的范围。
 * 透明成员（空行、空消息框）不打断批次，也不计入边界。
 */
export function foldRunBounds(
	length: number,
	index: number,
	isParticipant: (index: number) => boolean,
	isTransparent: (index: number) => boolean,
): FoldRunBounds {
	if (index < 0 || index >= length || !isParticipant(index)) return { start: index, end: index };
	let start = index;
	let end = index;
	for (let i = index - 1; i >= 0; i--) {
		if (isTransparent(i)) continue;
		if (!isParticipant(i)) break;
		start = i;
	}
	for (let i = index + 1; i < length; i++) {
		if (isTransparent(i)) continue;
		if (!isParticipant(i)) break;
		end = i;
	}
	return { start, end };
}

export interface FoldTimingState {
	startedAt?: number;
	endedAt?: number;
}

/** Compact, stable action labels used by the compressed work summary. */
export function foldActionLabel(toolName: string): string {
	const name = toolName.trim().toLowerCase();
	if (name === "thinking" || name === "thought") return "Think";
	if (name === "bash" || name === "shell") return "Bash";
	if (name === "read") return "Read";
	if (name === "edit") return "Edit";
	if (name === "write") return "Write";
	if (name === "apply_patch") return "Patch";
	if (name === "ask_user_question" || name.includes("askuserquestion")) return "Ask";
	if (name === "web_search" || name === "source_check" || name === "fetch_content" || name === "get_search_content") return "Search";
	if (name === "grep" || name === "find" || name === "ffgrep" || name === "fffind") return "Search";
	if (name === "ls" || name === "list" || name === "dir") return "List";
	if (name === "agent" || name.includes("subagent")) return "Agent";
	if (name === "task" || name.includes("todo")) return "Task";
	if (name === "skill" || name.includes("skill")) return "Skill";
	if (name.startsWith("mcp__")) return "MCP";
	return toolName
		.split(/[_\s-]+/u)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** Plain-text form; the renderer colors the label and dims the multiplication sign. */
export function formatFoldActionCount(label: string, count: number): string {
	return `${label} × ${Math.max(1, Math.floor(count))}`;
}

/**
 * 运行中的工作标记：与状态行 loader 同族的 asterisk 帧，顺序也沿用 loader。
 * 每一帧都只占一个显示格，保持与其它工具行的状态灯列宽度一致。
 */
export const FOLD_WORKING_GLYPHS = ["✻", "✽", "✢", "✳", "✶"] as const;

/** 工作行首标记的状态：运行中与结束后分开判定。 */
export type FoldRunMarkerState = "running" | "success" | "error";

/**
 * 运行中的记录一律用运行标记。同一条记录里先前有命令失败，不影响仍在运行的标记，
 * 失败只在记录结束之后决定状态点的颜色。
 */
export function foldRunMarkerState(active: boolean, settledStatus: "pending" | "success" | "error"): FoldRunMarkerState {
	if (active) return "running";
	return settledStatus === "error" ? "error" : "success";
}

/**
 * 按下标取帧；下标由共享动画计时器推进，所有运行中的批次同步变化。
 */
export function foldWorkingGlyph(frame: number): string {
	const length = FOLD_WORKING_GLYPHS.length;
	const index = Number.isFinite(frame) ? Math.floor(frame) : 0;
	return FOLD_WORKING_GLYPHS[((index % length) + length) % length];
}

/**
 * 按顺序保留能放下的动作前缀。第一个放不下的类别连同它后面的全部计入 hidden，
 * 这样窄屏优先舍弃尾部类别，不会只留下最后一个。
 */
export function fitFoldActionPrefix(
	counts: readonly number[],
	budget: number,
	maxSegments: number,
	widthOf: (segments: number, hiddenCount: number) => number,
): { segments: number; hidden: number } {
	let segments = 0;
	for (let i = 0; i < counts.length; i++) {
		const remaining = counts.slice(i + 1).reduce((sum, count) => sum + count, 0);
		if (segments >= maxSegments || widthOf(segments + 1, remaining) > budget) {
			return { segments, hidden: counts.slice(i).reduce((sum, count) => sum + count, 0) };
		}
		segments++;
	}
	return { segments, hidden: 0 };
}

function foldCountPhrase(count: number, singular: string, plural: string): string {
	const safe = Math.max(1, Math.floor(count));
	return `${safe} ${safe === 1 ? singular : plural}`;
}

/** 完成后的叙述句，例如 `Thought for 2s, listed 1 directory, ran 1 shell command`。 */
export function foldActionPastPhrase(label: string, count: number, thinkingDuration: string): string {
	switch (label) {
		case "Think": return `Thought for ${thinkingDuration}`;
		case "Bash": return `ran ${foldCountPhrase(count, "shell command", "shell commands")}`;
		case "List": return `listed ${foldCountPhrase(count, "directory", "directories")}`;
		case "Read": return `read ${foldCountPhrase(count, "file", "files")}`;
		case "Search": return `searched ${foldCountPhrase(count, "pattern", "patterns")}`;
		case "Edit": return `edited ${foldCountPhrase(count, "file", "files")}`;
		case "Write": return `wrote ${foldCountPhrase(count, "file", "files")}`;
		case "Patch": return `applied ${foldCountPhrase(count, "patch", "patches")}`;
		case "Ask": return `asked ${foldCountPhrase(count, "question", "questions")}`;
		case "Agent": return `ran ${foldCountPhrase(count, "agent", "agents")}`;
		case "Task": return `ran ${foldCountPhrase(count, "task", "tasks")}`;
		case "Skill": return `used ${foldCountPhrase(count, "skill", "skills")}`;
		case "MCP": return `called ${foldCountPhrase(count, "MCP tool", "MCP tools")}`;
		default: return `used ${foldCountPhrase(count, label.toLowerCase(), label.toLowerCase())}`;
	}
}

/** 进行中的叙述句，例如 `Thinking, running 1 shell command`。 */
export function foldActionProgressivePhrase(label: string, count: number): string {
	switch (label) {
		case "Think": return "Thinking";
		case "Bash": return `running ${foldCountPhrase(count, "shell command", "shell commands")}`;
		case "List": return `listing ${foldCountPhrase(count, "directory", "directories")}`;
		case "Read": return `reading ${foldCountPhrase(count, "file", "files")}`;
		case "Search": return `searching ${foldCountPhrase(count, "pattern", "patterns")}`;
		case "Edit": return `editing ${foldCountPhrase(count, "file", "files")}`;
		case "Write": return `writing ${foldCountPhrase(count, "file", "files")}`;
		case "Patch": return `applying ${foldCountPhrase(count, "patch", "patches")}`;
		case "Ask": return "asking a question";
		case "Agent": return `running ${foldCountPhrase(count, "agent", "agents")}`;
		case "Task": return `running ${foldCountPhrase(count, "task", "tasks")}`;
		case "Skill": return "using a skill";
		case "MCP": return `calling ${foldCountPhrase(count, "MCP tool", "MCP tools")}`;
		default: return `using ${label.toLowerCase()}`;
	}
}

/**
 * 批次内所有记录时长的工具的总耗时：最早的开始时间到最晚的结束时间。
 * 完全没有开始时间时返回 undefined；仍在运行的批次以 now 作为结束时间。
 */
export function foldElapsedMs(states: readonly FoldTimingState[], now: number): number | undefined {
	let started: number | undefined;
	let ended: number | undefined;
	let running = false;
	for (const state of states) {
		const startedAt = state?.startedAt;
		const endedAt = state?.endedAt;
		if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
			started = started === undefined ? startedAt : Math.min(started, startedAt);
			if (typeof endedAt !== "number") running = true;
		}
		if (typeof endedAt === "number" && Number.isFinite(endedAt)) {
			ended = ended === undefined ? endedAt : Math.max(ended, endedAt);
		}
	}
	if (started === undefined) return undefined;
	const finishedAt = !running && ended !== undefined && ended >= started ? ended : now;
	return Math.max(0, finishedAt - started);
}

const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g;
const BRANCH_LEAD_RE = /^[└├│]+\s*/u;

/** 反复剥掉行尾的快捷键提示，提示之间用 “ • ” 连接。 */
function stripTrailingHints(line: string, hintFragments: readonly string[]): string {
	let current = line;
	for (;;) {
		const marker = current.lastIndexOf("•");
		if (marker === -1) return current.trim();
		const tail = current.slice(marker + 1).trim();
		if (tail !== "" && !hintFragments.includes(tail)) return current.trim();
		current = current.slice(0, marker);
	}
}

/**
 * 从工具结果渲染出的文本里取出摘要：跳过空行，去掉分支符号、宽度标记和快捷键提示。
 */
export function extractFoldResultSummary(plainText: string, hintFragments: readonly string[]): string {
	for (const rawLine of plainText.split("\n")) {
		const line = stripTrailingHints(
			rawLine.replace(PRIVATE_USE_RE, "").replace(BRANCH_LEAD_RE, "").trim(),
			hintFragments,
		);
		if (line) return line;
	}
	return "";
}

/** 压缩行里的思考摘要：单段沿用原来的写法，多段合并成一行。 */
export function formatFoldThoughtsLabel(count: number, formattedDuration: string): string {
	return count > 1 ? `Thought ×${count} · ${formattedDuration}` : `Thought for ${formattedDuration}`;
}
