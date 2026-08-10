/**
 * wezterm-notify: pi 完成本轮回复后，通过 OSC 777 让 wezterm 弹出桌面通知，
 * 通知内容为最后一条助手消息的文本。
 *
 * 另外，当 ask_user_question 工具被调用，或 pi-guard 弹出删除确认框时，
 * 也会立即发送提醒通知，避免用户漏看等待输入的提示。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import {
	PI_GUARD_CONFIRMATION_REQUIRED_EVENT,
	type PiGuardConfirmationRequiredPayload,
} from "../pi-guard/index.ts";

const MAX_TITLE = 80;
const MAX_BODY = 200;
const PERMISSION_REQUIRED_BODY = "需要你授予权限";

/** 去除会破坏 OSC 序列的控制字符，折叠空白，并截断。 */
function sanitize(text: string, max: number): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 需要显式剥离 C0 控制符
	const clean = text.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/** 通过 OSC 777 让 wezterm 弹出桌面通知。 */
function notify(cwd: string, body: string): void {
	const title = `pi · ${basename(cwd) || "session"}`;
	const t = sanitize(title, MAX_TITLE);
	const b = sanitize(body, MAX_BODY);
	process.stdout.write(`\x1b]777;notify;${t};${b}\x1b\\`);
}

function assistantText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: "text"; text: string } => (c as any)?.type === "text")
		.map((c) => c.text)
		.join("")
		.trim();
}

function isTuiGuardConfirmationRequest(
	data: unknown,
): data is PiGuardConfirmationRequiredPayload {
	if (typeof data !== "object" || data === null) return false;

	const request = data as Partial<PiGuardConfirmationRequiredPayload>;
	return typeof request.cwd === "string" && request.mode === "tui";
}

export default function (pi: ExtensionAPI) {
	let lastText: string | undefined;

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		const text = assistantText(event.message.content);
		if (text) lastText = text;
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode !== "tui" || !lastText) return;

		notify(ctx.cwd, lastText);
		lastText = undefined;
	});

	pi.on("tool_call", (event, ctx) => {
		if (ctx.mode !== "tui" || event.toolName !== "ask_user_question") return;

		const questions = (event.input as { questions?: { question?: string }[] })?.questions;
		const first = Array.isArray(questions) ? questions[0]?.question : undefined;
		const body = first ? `需要你回答：${first}` : "需要你回答问题";
		notify(ctx.cwd, body);
	});

	pi.events.on(PI_GUARD_CONFIRMATION_REQUIRED_EVENT, (data) => {
		if (!isTuiGuardConfirmationRequest(data)) return;

		notify(data.cwd, PERMISSION_REQUIRED_BODY);
	});
}
