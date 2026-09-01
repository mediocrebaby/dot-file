/**
 * Skill Dollar Extension
 *
 * 用 `$name` 提供技能名称自动补全，但不调用或展开技能：
 * - 自动补全：输入 `$` 在任意 token 边界（不限行首）弹出技能列表
 * - 原样提交：包括 `$name` 在内的输入框内容不经转换直接发送
 * - 隐藏并禁用原生入口：`/` 补全里不再出现 `skill:xxx`，手输 `/skill:xxx` 会被拦截并提示
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";

interface SkillEntry {
	name: string;
	description?: string;
}

/** 光标前正在输入的 `$前缀`，要求 `$` 处于 token 边界 */
const TRIGGER_PATTERN = /(?:^|\s)\$([a-z0-9-]*)$/;

export default function (pi: ExtensionAPI) {
	const getSkills = (): SkillEntry[] =>
		pi
			.getCommands()
			.filter((cmd) => cmd.source === "skill")
			.map((cmd) => ({
				name: cmd.name.slice("skill:".length),
				description: cmd.description,
			}));

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
	});
}
