import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchArtifact } from "../source-check.ts";

test("attributes mixed-provider research at source and artifact level", () => {
	const artifact = buildResearchArtifact({
		query: "claim",
		results: [
			{ rank: 1, title: "OpenAI source", url: "https://docs.example.com/openai", snippet: "A", provider: "openai" },
			{ rank: 2, title: "Duck source", url: "https://docs.example.com/duck", snippet: "B", provider: "duckduckgo" },
		],
	});

	assert.equal(artifact.provider, "mixed");
	assert.deepEqual(artifact.sources.map(source => source.provider), ["openai", "duckduckgo"]);
});

test("derives artifact provider from retained deduplicated sources", () => {
	const artifact = buildResearchArtifact({
		query: "claim",
		results: [
			{ rank: 1, title: "First", url: "https://docs.example.com/shared", snippet: "A", provider: "openai" },
			{ rank: 2, title: "Duplicate", url: "https://docs.example.com/shared", snippet: "B", provider: "duckduckgo" },
		],
	});
	assert.equal(artifact.provider, "openai");
	assert.equal(artifact.sources.length, 1);
});
