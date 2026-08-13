import * as fs from "node:fs";
import * as path from "node:path";
import { getLanguageFromPath, highlightCode, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi, type MarkdownTheme } from "@earendil-works/pi-tui";

const DEFAULT_MAX_RECORDS = 240;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 64 * 1024;
const TOOL_ARGS_PREVIEW_CHARS = 240;
const TOOL_PREVIEW_LINES = 7;

type Theme = ExtensionContext["ui"]["theme"];

export type FleetTranscriptEvent =
	| { kind: "assistant"; text: string; model?: string; timestamp?: number }
	| { kind: "user"; text: string; input?: boolean; timestamp?: number }
	| { kind: "tool"; toolCallId?: string; name: string; args?: string; argsPayload?: string; output?: string; outputTruncated?: boolean; status: "running" | "complete" | "error"; error?: string; startedAt?: number; endedAt?: number; timestamp?: number }
	| { kind: "notice"; text: string; tone: "muted" | "warning" | "error"; timestamp?: number };

export interface FleetTranscript {
	path: string;
	events: FleetTranscriptEvent[];
	truncated: boolean;
	warning?: string;
}

interface FleetTranscriptReadOptions {
	trustedRoots: string[];
	/** Exclude inherited native-session history written before this child launch. */
	startedAt?: number;
	maxRecords?: number;
	maxBytes?: number;
}

interface MutableToolEvent {
	kind: "tool";
	toolCallId?: string;
	name: string;
	args?: string;
	argsPayload?: string;
	output?: string;
	outputTruncated?: boolean;
	status: "running" | "complete" | "error";
	error?: string;
	startedAt?: number;
	endedAt?: number;
	timestamp?: number;
	resultSeen?: boolean;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function timestampValue(record: Record<string, unknown>): number | undefined {
	const numeric = numberValue(record.ts) ?? numberValue(record.timestamp);
	if (numeric !== undefined) return numeric;
	if (typeof record.timestamp !== "string") return undefined;
	const parsed = Date.parse(record.timestamp);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function contentText(value: unknown): string | undefined {
	if (typeof value === "string") return stringValue(value);
	if (!Array.isArray(value)) return stringValue(objectValue(value)?.text);
	const text = value.map((part) => {
		if (typeof part === "string") return part;
		const entry = objectValue(part);
		return entry?.type === "text" ? stringValue(entry.text) ?? "" : "";
	}).filter(Boolean).join("\n");
	return stringValue(text);
}

function toolArgsPayload(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	try {
		return clipMessage(JSON.stringify(value, null, 2));
	} catch {
		return undefined;
	}
}

function toolArgsPreview(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	try {
		const compact = JSON.stringify(value);
		if (!compact || compact === "{}") return undefined;
		return compact.length > TOOL_ARGS_PREVIEW_CHARS
			? `${compact.slice(0, TOOL_ARGS_PREVIEW_CHARS)}…`
			: compact;
	} catch {
		return undefined;
	}
}

function pathWithin(base: string, candidate: string): boolean {
	const resolvedBase = path.resolve(base);
	const resolvedCandidate = path.resolve(candidate);
	return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
	return Boolean(objectValue(error)?.code === "ENOENT");
}

function validateTranscriptPath(filePath: string, trustedRoots: string[]): { resolvedPath?: string; warning?: string } {
	if (trustedRoots.length === 0) return { warning: `Transcript preview has no trusted root: ${filePath}` };
	const resolvedPath = path.resolve(filePath);
	if (!trustedRoots.some((root) => pathWithin(root, resolvedPath))) {
		return { warning: `Transcript is outside trusted roots: ${filePath}` };
	}
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(resolvedPath);
	} catch (error) {
		if (isNotFoundError(error)) return {};
		return { warning: `Transcript could not be inspected: ${errorMessage(error)}` };
	}
	if (stat.isSymbolicLink()) return { warning: `Transcript preview refused a symlink: ${filePath}` };
	if (!stat.isFile()) return { warning: `Transcript path is not a file: ${filePath}` };
	try {
		const realPath = fs.realpathSync(resolvedPath);
		const realRoots = trustedRoots
			.filter((root) => fs.existsSync(root))
			.map((root) => fs.realpathSync(root));
		if (!realRoots.some((root) => pathWithin(root, realPath))) {
			return { warning: `Transcript resolves outside trusted roots: ${filePath}` };
		}
		return { resolvedPath: realPath };
	} catch (error) {
		return { warning: `Transcript path could not be resolved: ${errorMessage(error)}` };
	}
}

function isCompleteRecord(line: string | undefined): boolean {
	if (!line?.trim()) return false;
	try {
		return objectValue(JSON.parse(line)) !== undefined;
	} catch {
		return false;
	}
}

function readTailLines(filePath: string, maxBytes: number): { lines: string[]; truncated: boolean; warning?: string } {
	let fd: number | undefined;
	try {
		const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
		fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
		const stat = fs.fstatSync(fd);
		if (!stat.isFile()) return { lines: [], truncated: false, warning: `Transcript path is not a file: ${filePath}` };
		if (stat.size === 0) return { lines: [], truncated: false };
		const bytesToRead = Math.min(stat.size, maxBytes);
		const start = stat.size - bytesToRead;
		const buffer = Buffer.alloc(bytesToRead);
		const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, start);
		const content = buffer.subarray(0, bytesRead).toString("utf-8");
		const endsWithNewline = content.endsWith("\n");
		let lines = content.split(/\r?\n/);
		if (start > 0 && lines.length > 0) lines = lines.slice(1);
		if (lines.at(-1) === "") lines = lines.slice(0, -1);
		else if (!endsWithNewline && !isCompleteRecord(lines.at(-1))) lines = lines.slice(0, -1);
		return { lines, truncated: start > 0 };
	} catch (error) {
		return { lines: [], truncated: false, warning: `Transcript could not be read: ${errorMessage(error)}` };
	} finally {
		if (fd !== undefined) fs.closeSync(fd);
	}
}

function clipMessage(text: string): string {
	if (text.length <= MAX_MESSAGE_CHARS) return text;
	return `${text.slice(0, MAX_MESSAGE_CHARS)}\n\n… message truncated`;
}

function findTool(
	events: FleetTranscriptEvent[],
	toolCallId: string | undefined,
	name: string | undefined,
): MutableToolEvent | undefined {
	if (toolCallId) {
		for (let index = events.length - 1; index >= 0; index--) {
			const event = events[index];
			if (event?.kind === "tool" && event.toolCallId === toolCallId) return event as MutableToolEvent;
		}
		return undefined;
	}
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.kind !== "tool") continue;
		const tool = event as MutableToolEvent;
		if ((!name || tool.name === name) && !tool.resultSeen) return tool;
	}
	return undefined;
}

function appendTextEvent(
	events: FleetTranscriptEvent[],
	kind: "assistant" | "user",
	text: string,
	metadata: { model?: string; input?: boolean; timestamp?: number },
): void {
	const clipped = clipMessage(text.trim());
	if (!clipped) return;
	// Repeated model/user messages are meaningful; without a stable event identity,
	// preserving both is safer than silently collapsing retries or repeated steering.
	events.push({ kind, text: clipped, ...metadata });
}

function appendSessionAssistantContent(
	events: FleetTranscriptEvent[],
	message: Record<string, unknown>,
	metadata: { model?: string; timestamp?: number },
): void {
	const content = message.content;
	if (!Array.isArray(content)) {
		const text = contentText(content);
		if (text) appendTextEvent(events, "assistant", text, metadata);
		return;
	}
	for (const rawPart of content) {
		const part = objectValue(rawPart);
		if (!part) continue;
		if (part.type === "text") {
			const text = stringValue(part.text);
			if (text) appendTextEvent(events, "assistant", text, metadata);
			continue;
		}
		if (part.type !== "toolCall" && part.type !== "tool_call") continue;
		const name = stringValue(part.name) ?? stringValue(part.toolName) ?? "tool";
		const args = part.arguments ?? part.args;
		const argsPayload = toolArgsPayload(args);
		const argsPreview = toolArgsPreview(args);
		events.push({
			kind: "tool",
			...(stringValue(part.id) ? { toolCallId: stringValue(part.id) } : {}),
			name,
			...(argsPreview ? { args: argsPreview } : {}),
			...(argsPayload ? { argsPayload } : {}),
			status: "running",
			...(metadata.timestamp !== undefined ? { timestamp: metadata.timestamp, startedAt: metadata.timestamp } : {}),
		});
	}
}

function activeNativeSessionLines(lines: string[], startedAt: number | undefined): string[] {
	const parsed: Array<{ line: string; record?: Record<string, unknown> }> = lines.map((line) => {
		try {
			return { line, record: objectValue(JSON.parse(line)) };
		} catch {
			return { line };
		}
	});
	const nativeMessages = parsed.filter((entry) => entry.record?.recordType === undefined && entry.record?.type === "message");
	if (nativeMessages.length === 0) return lines;

	const treeEntries: Array<{ line: string; record: Record<string, unknown> }> = [];
	for (const entry of parsed) {
		const record = entry.record;
		if (record
			&& record.recordType === undefined
			&& typeof record.id === "string"
			&& Object.prototype.hasOwnProperty.call(record, "parentId")) {
			treeEntries.push({ line: entry.line, record });
		}
	}
	const activeIds = new Set<string>();
	if (treeEntries.length > 0) {
		const byId = new Map(treeEntries.map(({ record }) => [record.id as string, record]));
		let current: Record<string, unknown> | undefined = treeEntries.at(-1)?.record;
		while (current && typeof current.id === "string" && !activeIds.has(current.id)) {
			activeIds.add(current.id);
			current = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
		}
	}

	return parsed.flatMap(({ line, record }) => {
		if (!record || record.recordType !== undefined || record.type !== "message") return [line];
		if (activeIds.size > 0 && (typeof record.id !== "string" || !activeIds.has(record.id))) return [];
		if (startedAt !== undefined) {
			const timestamp = timestampValue(record);
			if (timestamp === undefined || timestamp < startedAt) return [];
		}
		return [line];
	});
}

function parseTranscriptLines(lines: string[], conversationStarted = false): { events: FleetTranscriptEvent[]; malformed: number; explicitTruncation: boolean } {
	const events: FleetTranscriptEvent[] = [];
	let malformed = 0;
	let explicitTruncation = false;
	let assistantSeen = conversationStarted;

	for (const line of lines) {
		if (!line.trim()) continue;
		let record: Record<string, unknown> | undefined;
		try {
			record = objectValue(JSON.parse(line));
		} catch {
			malformed++;
			continue;
		}
		if (!record) {
			malformed++;
			continue;
		}

		const recordType = stringValue(record.recordType);
		const timestamp = timestampValue(record);
		if (recordType === "truncated") {
			explicitTruncation = true;
			continue;
		}
		if (recordType === "tool_start") {
			const name = stringValue(record.toolName) ?? "tool";
			events.push({
				kind: "tool",
				...(stringValue(record.toolCallId) ? { toolCallId: stringValue(record.toolCallId) } : {}),
				name,
				...(stringValue(record.argsPreview) ? { args: stringValue(record.argsPreview) } : {}),
				...(stringValue(record.argsPayload) ? { argsPayload: stringValue(record.argsPayload) } : {}),
				status: "running",
				...(timestamp !== undefined ? { timestamp, startedAt: timestamp } : {}),
			});
			continue;
		}
		if (recordType === "tool_end") {
			const tool = findTool(events, stringValue(record.toolCallId), stringValue(record.toolName));
			if (tool && !tool.resultSeen) tool.status = record.isError === true ? "error" : "complete";
			if (tool && timestamp !== undefined && tool.endedAt === undefined) tool.endedAt = timestamp;
			continue;
		}
		if (recordType === "stderr") {
			const text = stringValue(record.text);
			if (text) events.push({ kind: "notice", text: clipMessage(text), tone: "error", ...(timestamp !== undefined ? { timestamp } : {}) });
			continue;
		}
		const nativeSessionMessage = recordType === undefined && record.type === "message";
		if (recordType !== "message" && !nativeSessionMessage) continue;

		const message = objectValue(record.message);
		const role = stringValue(record.role) ?? stringValue(message?.role);
		const text = stringValue(record.text) ?? stringValue(message?.text) ?? contentText(message?.content);
		if (role === "toolResult" || role === "tool_result") {
			const toolCallId = stringValue(record.toolCallId) ?? stringValue(message?.toolCallId);
			const name = stringValue(record.toolName) ?? stringValue(message?.toolName) ?? "tool";
			const failed = record.isError === true || message?.isError === true;
			let tool = findTool(events, toolCallId, name);
			if (!tool) {
				tool = {
					kind: "tool",
					...(toolCallId ? { toolCallId } : {}),
					name,
					status: failed ? "error" : "complete",
					...(timestamp !== undefined ? { timestamp } : {}),
				};
				events.push(tool);
			}
			if (!tool.resultSeen) {
				tool.resultSeen = true;
				tool.status = failed ? "error" : "complete";
				if (timestamp !== undefined && tool.endedAt === undefined) tool.endedAt = timestamp;
				if (text && (!failed || tool.output === undefined)) {
					tool.output = clipMessage(text);
					tool.outputTruncated = record.outputTruncated === true || text.includes("… payload truncated") || text.includes("[Showing lines");
				}
				if (failed && text) tool.error = clipMessage(text.split(/\r?\n/).find((candidate) => candidate.trim()) ?? text);
			}
			continue;
		}
		if (role === "assistant") {
			assistantSeen = true;
			const model = stringValue(record.model) ?? stringValue(message?.model);
			const metadata = {
				...(model ? { model } : {}),
				...(timestamp !== undefined ? { timestamp } : {}),
			};
			if (nativeSessionMessage && message) appendSessionAssistantContent(events, message, metadata);
			else if (text) appendTextEvent(events, "assistant", text, metadata);
			continue;
		}
		if (role === "user" && text) {
			const initialPrompt = record.sourceEventType === "initial_prompt" || (nativeSessionMessage && !assistantSeen);
			if (assistantSeen || initialPrompt) {
				appendTextEvent(events, "user", text, {
					...(initialPrompt ? { input: true } : {}),
					...(timestamp !== undefined ? { timestamp } : {}),
				});
			}
		}
	}

	for (const event of events) {
		if (event.kind === "tool") delete (event as MutableToolEvent).resultSeen;
	}
	return { events, malformed, explicitTruncation };
}

export function readFleetTranscript(filePath: string, options: FleetTranscriptReadOptions): FleetTranscript {
	const validated = validateTranscriptPath(filePath, options.trustedRoots);
	if (!validated.resolvedPath) {
		return { path: filePath, events: [], truncated: false, ...(validated.warning ? { warning: validated.warning } : {}) };
	}
	const maxRecords = Math.max(1, options.maxRecords ?? DEFAULT_MAX_RECORDS);
	const tail = readTailLines(validated.resolvedPath, Math.max(1024, options.maxBytes ?? DEFAULT_MAX_BYTES));
	const recordsOmitted = tail.truncated || tail.lines.length > maxRecords;
	const selectedLines = activeNativeSessionLines(tail.lines.slice(-maxRecords), options.startedAt);
	const parsed = parseTranscriptLines(selectedLines, recordsOmitted);
	const warnings = [
		tail.warning,
		parsed.malformed > 0 ? `Skipped ${parsed.malformed} malformed transcript record${parsed.malformed === 1 ? "" : "s"}.` : undefined,
	].filter((value): value is string => Boolean(value));
	return {
		path: filePath,
		events: parsed.events,
		truncated: tail.truncated || tail.lines.length > maxRecords || parsed.explicitTruncation,
		...(warnings.length ? { warning: warnings.join(" ") } : {}),
	};
}

function statusGlyph(event: Extract<FleetTranscriptEvent, { kind: "tool" }>, theme: Theme): string {
	if (event.status === "running") return theme.fg("warning", "●");
	if (event.status === "error") return theme.fg("error", "✗");
	return theme.fg("success", "✓");
}

function jsonScalar(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function parseToolArgs(event: Extract<FleetTranscriptEvent, { kind: "tool" }>): Record<string, unknown> | undefined {
	if (!event.argsPayload) return undefined;
	try {
		return objectValue(JSON.parse(event.argsPayload));
	} catch {
		return undefined;
	}
}

function toolDuration(event: Extract<FleetTranscriptEvent, { kind: "tool" }>): string | undefined {
	if (event.startedAt === undefined || event.endedAt === undefined) return undefined;
	return `${((event.endedAt - event.startedAt) / 1000).toFixed(1)}s`;
}

function renderExpandedTool(
	event: Extract<FleetTranscriptEvent, { kind: "tool" }>,
	width: number,
	theme: Theme,
): string[] {
	const lines: string[] = [];
	const args = parseToolArgs(event);
	const glyph = statusGlyph(event, theme);
	const output = event.output ?? event.error;
	const outputColor = event.status === "error" ? "error" : "toolOutput";
	if (event.name === "bash") {
		const command = jsonScalar(args?.command) ?? event.args ?? "(unknown command)";
		lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(`$ ${command}`))}`, width, theme));
		if (output) {
			for (const outputLine of output.replace(/\s+$/, "").split(/\r?\n/)) {
				for (const wrapped of renderWrapped(theme.fg(outputColor, outputLine), Math.max(1, width - 4))) {
					lines.push(railLine(`  ${wrapped}`, width, theme));
				}
			}
		}
		const duration = toolDuration(event);
		if (duration) lines.push(railLine(theme.fg("dim", `  Took ${duration}`), width, theme));
		return lines;
	}
	if (event.name === "read") {
		const filePath = jsonScalar(args?.path ?? args?.file_path);
		const language = filePath ? getLanguageFromPath(filePath) : undefined;
		const rendered = !output
			? []
			: event.status === "error"
				? output.split("\n").map((line) => theme.fg("error", line))
				: language
					? highlightCode(output, language)
					: output.split("\n");
		lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(`read ${filePath ?? event.args ?? ""}`))}`, width, theme));
		for (const line of rendered) {
			for (const wrapped of renderWrapped(line, Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
		}
		return lines;
	}
	lines.push(railLine(`${glyph} ${theme.fg("toolTitle", theme.bold(event.name))}`, width, theme));
	if (event.argsPayload) {
		lines.push(railLine(theme.fg("dim", "  args"), width, theme));
		for (const argLine of event.argsPayload.split(/\r?\n/)) {
			for (const wrapped of renderWrapped(theme.fg("muted", argLine), Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
		}
	}
	if (output) {
		lines.push(railLine(theme.fg(event.status === "error" ? "error" : "dim", event.status === "error" ? "  error" : "  output"), width, theme));
		for (const outputLine of output.split(/\r?\n/)) {
			for (const wrapped of renderWrapped(theme.fg(outputColor, outputLine), Math.max(1, width - 4))) lines.push(railLine(`  ${wrapped}`, width, theme));
		}
	}
	return lines;
}

function bounded(text: string, width: number): string {
	return truncateToWidth(text, Math.max(0, width));
}

function railLine(content: string, width: number, theme: Theme): string {
	return bounded(`${theme.fg("borderMuted", "│")} ${content}`, width);
}

function renderWrapped(text: string, width: number): string[] {
	return wrapTextWithAnsi(text, Math.max(1, width));
}

export function renderFleetTranscript(
	transcript: FleetTranscript,
	width: number,
	theme: Theme,
	markdownTheme: MarkdownTheme,
	options: { expandedTools?: boolean } = {},
): string[] {
	if (width <= 0) return [];
	const lines: string[] = [];
	if (transcript.truncated) lines.push(bounded(theme.fg("dim", "↑ Earlier activity omitted"), width));
	if (transcript.warning) {
		for (const line of renderWrapped(transcript.warning, Math.max(1, width - 2))) {
			lines.push(bounded(`${theme.fg("warning", "!")} ${theme.fg("warning", line)}`, width));
		}
	}

	for (const event of transcript.events) {
		if (event.kind === "tool") {
			if (options.expandedTools && (event.output || event.argsPayload || event.error)) {
				lines.push(...renderExpandedTool(event, width, theme));
				lines.push(railLine(theme.fg("dim", "  o/x to collapse"), width, theme));
				continue;
			}
			const title = theme.fg("toolTitle", theme.bold(event.name));
			const args = event.args ? ` ${theme.fg("dim", event.args)}` : "";
			const suffix = event.status === "running" ? theme.fg("warning", " running") : "";
			lines.push(bounded(`${theme.fg("borderMuted", "├─")} ${statusGlyph(event, theme)} ${title}${args}${suffix}`, width));
			if (event.output && event.status !== "error" && event.name === "bash") {
				const outputLines = event.output.replace(/\s+$/, "").split(/\r?\n/);
				const visible = outputLines.slice(-TOOL_PREVIEW_LINES);
				const hidden = Math.max(0, outputLines.length - visible.length);
				for (const outputLine of visible) {
					for (const wrapped of renderWrapped(theme.fg("toolOutput", outputLine), Math.max(1, width - 4))) {
						lines.push(railLine(`  ${wrapped}`, width, theme));
					}
				}
				if (hidden > 0) lines.push(railLine(theme.fg("dim", `  … ${hidden} earlier lines · o/x to expand`), width, theme));
				const duration = toolDuration(event);
				lines.push(railLine(theme.fg("dim", `  Took${duration ? ` ${duration}` : ""}`), width, theme));
			} else if (event.output && event.status !== "error") {
				const summary = truncateToWidth(event.output.replace(/\s+/g, " ").trim(), Math.max(1, width - 18), "…");
				if (summary) lines.push(railLine(theme.fg("dim", `  ${summary} · o/x to expand`), width, theme));
			}
			if (event.error) {
				for (const errorLine of renderWrapped(event.error, Math.max(1, width - 4))) {
					lines.push(railLine(theme.fg("error", `  ${errorLine}`), width, theme));
				}
			}
			continue;
		}
		if (event.kind === "notice") {
			const color = event.tone === "error" ? "error" : event.tone === "warning" ? "warning" : "dim";
			for (const noticeLine of renderWrapped(event.text, Math.max(1, width - 2))) {
				lines.push(railLine(theme.fg(color, noticeLine), width, theme));
			}
			continue;
		}

		const assistant = event.kind === "assistant";
		const label = assistant ? "Assistant" : event.input ? "Input" : "Supervisor";
		const marker = assistant ? theme.fg("accent", "◆") : theme.fg("warning", "◇");
		const model = assistant && event.model ? theme.fg("dim", ` · ${event.model}`) : "";
		lines.push(bounded(`${marker} ${theme.bold(label)}${model}`, width));
		if (assistant) {
			const rendered = new Markdown(event.text, 0, 0, markdownTheme).render(Math.max(1, width - 2));
			for (const markdownLine of rendered) lines.push(railLine(markdownLine, width, theme));
		} else {
			for (const userLine of renderWrapped(event.text, Math.max(1, width - 2))) {
				lines.push(railLine(userLine, width, theme));
			}
		}
		lines.push(theme.fg("borderMuted", "│"));
	}

	while (lines.length > 0 && visibleWidth(lines.at(-1) ?? "") === 1) lines.pop();
	return lines;
}
