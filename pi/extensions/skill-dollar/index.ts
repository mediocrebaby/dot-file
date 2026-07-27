/**
 * Skill Dollar Extension
 *
 * 把 pi 原生的 `/skill:name` 技能调用替换为 `$name`：
 * - 自动补全：输入 `$` 在任意 token 边界（不限行首）弹出技能列表
 * - 提交展开：消息中所有 `$name` 就地展开为技能内容，支持句中引用与一次引用多个技能
 * - 隐藏并禁用原生入口：`/` 补全里不再出现 `skill:xxx`，手输 `/skill:xxx` 会被拦截并提示
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";

interface SkillEntry {
	name: string;
	description?: string;
	filePath: string;
	baseDir: string;
}

/** `$` 后的技能名：小写字母/数字开头，可含连字符 */
const SKILL_NAME_CHARS = "[a-z0-9][a-z0-9-]*";
/** 光标前正在输入的 `$前缀`，要求 `$` 处于 token 边界 */
const TRIGGER_PATTERN = /(?:^|\s)\$([a-z0-9-]*)$/;
/** 提交文本里的技能引用 */
const REFERENCE_PATTERN = new RegExp(`(^|\\s)\\$(${SKILL_NAME_CHARS})`, "g");

export default function (pi: ExtensionAPI) {
	const getSkills = (): SkillEntry[] =>
		pi
			.getCommands()
			.filter((cmd) => cmd.source === "skill")
			.map((cmd) => ({
				name: cmd.name.slice("skill:".length),
				description: cmd.description,
				filePath: cmd.sourceInfo.path,
				baseDir: cmd.sourceInfo.baseDir ?? cmd.sourceInfo.path,
			}));

	const renderSkillBlock = (skill: SkillEntry): string => {
		const body = stripFrontmatter(readFileSync(skill.filePath, "utf-8")).trim();
		return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
	};

	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["$"],

			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
				const match = beforeCursor.match(TRIGGER_PATTERN);

				if (!match) {
					// 非 `$` 场景交还内置 provider，但抹掉原生的 skill:xxx 命令项
					const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
					if (!suggestions || !suggestions.prefix.startsWith("/")) return suggestions;
					const items = suggestions.items.filter((item) => !item.value.startsWith("skill:"));
					return items.length > 0 ? { ...suggestions, items } : null;
				}

				const prefix = match[1] ?? "";
				const items = fuzzyFilter(getSkills(), prefix, (skill) => skill.name).map((skill) => ({
					value: `$${skill.name}`,
					label: skill.name,
					...(skill.description && { description: skill.description }),
				}));
				if (items.length === 0) return null;

				return { prefix: `$${prefix}`, items };
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				if (!prefix.startsWith("$")) {
					return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
				}
				const currentLine = lines[cursorLine] ?? "";
				const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
				const afterCursor = currentLine.slice(cursorCol);
				const newLines = [...lines];
				newLines[cursorLine] = `${beforePrefix}${item.value} ${afterCursor}`;
				return {
					lines: newLines,
					cursorLine,
					cursorCol: beforePrefix.length + item.value.length + 1,
				};
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});

	pi.on("input", (event, ctx: ExtensionContext) => {
		if (event.source === "extension") return;

		if (event.text.startsWith("/skill:")) {
			const name = event.text.slice("/skill:".length).split(" ")[0];
			ctx.ui.notify(`/skill: 已停用，请改用 $${name}`, "warning");
			return { action: "handled" as const };
		}

		const skills = new Map(getSkills().map((skill) => [skill.name, skill]));
		const matches = [...event.text.matchAll(REFERENCE_PATTERN)].filter((match) => skills.has(match[2]));
		if (matches.length === 0) return;

		let text = "";
		let consumed = 0;
		let leadingOnly = matches.length === 1 && matches[0].index === 0 && matches[0][1] === "";

		for (const match of matches) {
			const name = match[2];
			const start = match.index;
			try {
				text += event.text.slice(consumed, start) + match[1] + renderSkillBlock(skills.get(name)!);
				consumed = start + match[0].length;
			} catch (err) {
				ctx.ui.notify(`读取技能 ${name} 失败: ${err instanceof Error ? err.message : String(err)}`, "error");
				leadingOnly = false;
			}
		}

		if (consumed === 0) return;

		const rest = event.text.slice(consumed);
		// 单一行首引用时用 `\n\n` 分隔参数，让 pi 把消息识别为可折叠的技能调用
		if (leadingOnly) {
			const args = rest.trim();
			if (args) text += `\n\n${args}`;
		} else {
			text += rest;
		}

		return { action: "transform" as const, text };
	});
}
