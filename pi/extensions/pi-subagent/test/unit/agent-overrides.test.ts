import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
	discoverAgents,
	discoverAgentsAll,
	mergeAgentOverride,
	removeAgentOverride,
	removeAgentOverrideFields,
} from "../../src/agents/agents.ts";

const tempDirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup(): { project: string; agentDir: string; projectAgentPath: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agent-overrides-"));
	tempDirs.push(root);
	const project = path.join(root, "project");
	const agentDir = path.join(root, "agent-home");
	const projectAgentPath = path.join(project, ".pi", "agents", "reviewer.md");
	fs.mkdirSync(path.dirname(projectAgentPath), { recursive: true });
	fs.mkdirSync(agentDir, { recursive: true });
	fs.writeFileSync(projectAgentPath, `---\nname: reviewer\ndescription: Project reviewer\ntools: read\n---\n\nReview project files.\n`, "utf-8");
	process.env.PI_CODING_AGENT_DIR = agentDir;
	return { project, agentDir, projectAgentPath };
}

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

describe("Markdown agent settings", () => {
	it("applies shared defaults to Markdown agents without matching frontmatter fields", () => {
		const { project, agentDir } = setup();
		writeJson(path.join(agentDir, "settings.json"), {
			subagents: {
				defaultModel: "openai/default-model",
				defaultThinking: "medium",
				defaultExtensions: ["./child-extension.ts"],
			},
		});

		const reviewer = discoverAgents(project, "both").agents.find((agent) => agent.name === "reviewer");
		assert.equal(reviewer?.source, "project");
		assert.equal(reviewer?.model, "openai/default-model");
		assert.equal(reviewer?.thinking, "medium");
		assert.deepEqual(reviewer?.extensions, ["./child-extension.ts"]);
	});

	it("lets project settings override user settings for missing frontmatter fields", () => {
		const { project, agentDir } = setup();
		writeJson(path.join(agentDir, "settings.json"), {
			subagents: { agentOverrides: { reviewer: { model: "openai/user-model", thinking: "low" } } },
		});
		writeJson(path.join(project, ".pi", "settings.json"), {
			subagents: { agentOverrides: { reviewer: { model: "openai/project-model", thinking: "high" } } },
		});

		const reviewer = discoverAgentsAll(project).project.find((agent) => agent.name === "reviewer");
		assert.equal(reviewer?.model, "openai/project-model");
		assert.equal(reviewer?.thinking, "high");
		assert.equal(reviewer?.override?.scope, "project");
	});

	it("does not override fields explicitly owned by Markdown frontmatter", () => {
		const { project, agentDir, projectAgentPath } = setup();
		fs.writeFileSync(projectAgentPath, `---\nname: reviewer\ndescription: Project reviewer\nmodel: openai/frontmatter\nthinking: low\n---\n\nReview project files.\n`, "utf-8");
		writeJson(path.join(agentDir, "settings.json"), {
			subagents: { agentOverrides: { reviewer: { model: "openai/settings", thinking: "high" } } },
		});

		const reviewer = discoverAgents(project, "both").agents.find((agent) => agent.name === "reviewer");
		assert.equal(reviewer?.model, "openai/frontmatter");
		assert.equal(reviewer?.thinking, "low");
	});

	it("persists, merges, clears fields, and removes generic agent overrides", () => {
		const { project, agentDir } = setup();
		const settingsPath = mergeAgentOverride(project, "reviewer", "user", { model: "openai/demo", thinking: "high" });
		assert.equal(settingsPath, path.join(agentDir, "settings.json"));
		mergeAgentOverride(project, "reviewer", "user", { description: "Configured reviewer" });
		removeAgentOverrideFields(project, "reviewer", "user", ["thinking"]);
		let parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		assert.deepEqual(parsed.subagents.agentOverrides.reviewer, { model: "openai/demo", description: "Configured reviewer" });

		assert.equal(removeAgentOverride(project, "reviewer", "user").removed, true);
		parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		assert.equal(parsed.subagents, undefined);
	});

	it("rejects malformed generic override entries with file context", () => {
		const { project, agentDir } = setup();
		const settingsPath = path.join(agentDir, "settings.json");
		writeJson(settingsPath, { subagents: { agentOverrides: { reviewer: { tools: "read" } } } });
		assert.throws(
			() => discoverAgentsAll(project),
			(error: unknown) => error instanceof Error && error.message.includes("Agent override 'reviewer'") && error.message.includes(settingsPath),
		);
	});
});
