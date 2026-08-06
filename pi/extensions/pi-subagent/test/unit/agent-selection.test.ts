import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeAgentsForScope } from "../../src/agents/agent-selection.ts";
import type { AgentConfig, AgentSource } from "../../src/agents/agents.ts";

function makeAgent(name: string, source: AgentSource, systemPrompt: string): AgentConfig {
	return {
		name,
		description: `${name} agent`,
		systemPromptMode: "replace",
		inheritProjectContext: false,
		inheritSkills: false,
		systemPrompt,
		source,
		filePath: `/${source}/${name}.md`,
	};
}

describe("mergeAgentsForScope", () => {
	it("returns project agents when scope is project", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("project", userAgents, projectAgents);
		assert.equal(result.length, 1);
		assert.equal(result[0]?.source, "project");
	});

	it("returns user agents when scope is user", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("user", userAgents, projectAgents);
		assert.equal(result.length, 1);
		assert.equal(result[0]?.source, "user");
	});

	it("prefers project agents on name collisions when scope is both", () => {
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];
		const result = mergeAgentsForScope("both", userAgents, projectAgents);
		assert.equal(result.length, 1);
		assert.equal(result[0]?.source, "project");
		assert.equal(result[0]?.systemPrompt, "project prompt");
	});

	it("keeps agents from both scopes when names are distinct", () => {
		const userAgents = [makeAgent("user-only", "user", "user prompt")];
		const projectAgents = [makeAgent("project-only", "project", "project prompt")];
		const result = mergeAgentsForScope("both", userAgents, projectAgents);
		assert.equal(result.length, 2);
		assert.ok(result.find((agent) => agent.name === "user-only" && agent.source === "user"));
		assert.ok(result.find((agent) => agent.name === "project-only" && agent.source === "project"));
	});

	it("uses package agents as the lowest-precedence Markdown source", () => {
		const packageAgents = [makeAgent("shared", "package", "package prompt")];
		const userAgents = [makeAgent("shared", "user", "user prompt")];
		const projectAgents = [makeAgent("shared", "project", "project prompt")];

		assert.equal(mergeAgentsForScope("both", [], [], packageAgents)[0]?.source, "package");
		assert.equal(mergeAgentsForScope("user", userAgents, [], packageAgents)[0]?.source, "user");
		assert.equal(mergeAgentsForScope("project", [], projectAgents, packageAgents)[0]?.source, "project");
	});
});
