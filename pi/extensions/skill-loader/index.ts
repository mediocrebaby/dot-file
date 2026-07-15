/**
 * skill-loader: 注册 use_skill 工具，让 agent 主动加载 pi 技能目录中的技能。
 *
 * - 启动/reload 时扫描 pi 原生技能目录（~/.pi/agent/skills、~/.agents/skills、
 *   项目 .pi/skills、.agents/skills 等）
 * - 工具描述中动态列出所有可用技能（名称 + 描述），模型按需调用
 * - 调用 use_skill(name) 返回完整 SKILL.md 内容，附带技能目录路径提示
 * - 额外提供 /skills 命令列出已发现的技能
 */
import { loadSkills, type ExtensionAPI, type Skill } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	let skills: Skill[] = [];

	function refresh(cwd: string) {
		// Also pick up Claude Code skills
		const result = loadSkills({
			cwd,
			agentDir: join(homedir(), ".pi", "agent"),
			skillPaths: [],
			includeDefaults: true,
		});
		skills = result.skills.filter((s) => !s.disableModelInvocation);
	}

	function skillList(): string {
		if (skills.length === 0) return "(no skills found)";
		return skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
	}

	// Eager load so the tool description is populated at registration time
	refresh(process.cwd());

	pi.on("session_start", async (_event, ctx) => {
		refresh(ctx.cwd);
	});

	pi.registerTool({
		name: "use_skill",
		label: "Use Skill",
		description: [
			"Load a skill's full instructions into context. Call this BEFORE attempting any task that matches a skill's description.",
			"",
			"Available skills:",
			skillList(),
		].join("\n"),
		parameters: Type.Object({
			name: Type.String({ description: "Skill name to load (exact match from the available skills list)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (skills.length === 0) refresh(ctx.cwd);
			const skill = skills.find((s) => s.name === params.name);
			if (!skill) {
				return {
					content: [
						{
							type: "text",
							text: `Skill "${params.name}" not found. Available skills:\n${skillList()}`,
						},
					],
					details: {},
					isError: true,
				};
			}
			const body = readFileSync(skill.filePath, "utf-8");
			return {
				content: [
					{
						type: "text",
						text: [
							`Skill "${skill.name}" loaded. Base directory: ${skill.baseDir}`,
							"Relative paths in the skill refer to that directory.",
							"",
							body,
						].join("\n"),
					},
				],
				details: { name: skill.name, path: skill.filePath },
			};
		},
	});

	pi.registerCommand("skills", {
		description: "List skills discovered by skill-loader",
		handler: async (_args, ctx) => {
			refresh(ctx.cwd);
			ctx.ui.notify(`Skills (${skills.length}):\n${skillList()}`, "info");
		},
	});
}
