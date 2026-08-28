import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { clearResults, getResult, restoreFromSession } from "../storage.ts";

test("restores actual provider attribution while accepting legacy entries without provider", () => {
	const timestamp = Date.now();
	const branch = [
		{
			type: "custom",
			customType: "web-search-results",
			data: {
				id: "attributed",
				type: "search",
				timestamp,
				queries: [{ query: "q", answer: "a", results: [], error: null, provider: "openai" }],
			},
		},
		{
			type: "custom",
			customType: "web-search-results",
			data: {
				id: "legacy",
				type: "search",
				timestamp,
				queries: [{ query: "old", answer: "a", results: [], error: null }],
			},
		},
	];
	const context = {
		sessionManager: { getBranch: () => branch },
	} as unknown as ExtensionContext;

	restoreFromSession(context);
	assert.equal(getResult("attributed")?.queries?.[0]?.provider, "openai");
	assert.equal(getResult("legacy")?.queries?.[0]?.provider, undefined);
	clearResults();
});
