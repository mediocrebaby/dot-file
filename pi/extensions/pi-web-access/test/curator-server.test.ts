import assert from "node:assert/strict";
import test from "node:test";
import {
	startCuratorServer,
	type CuratorSearchEntry,
	type IndexedCuratorSearchEntry,
} from "../curator-server.ts";

async function start(onAddSearch: (query: string) => Promise<CuratorSearchEntry[]>) {
	const stored: IndexedCuratorSearchEntry[] = [];
	const handle = await startCuratorServer({
		queries: [],
		sessionToken: "test-token",
		timeout: 20,
		defaultProvider: "openai",
		summaryModels: [],
		defaultSummaryModel: null,
	}, {
		onSubmit() {},
		onCancel() {},
		onAddSearch,
		onAddSearchResults(entries) { stored.push(...entries); },
		onSummarize: async () => ({
			summary: "summary",
			meta: { model: null, durationMs: 0, tokenEstimate: 1, fallbackUsed: true },
		}),
		onRewriteQuery: async query => query,
	});
	return { handle, stored };
}

test("curator add-search preserves the actual provider returned by routing", async t => {
	const { handle, stored } = await start(async () => [{
		answer: "fallback answer",
		results: [],
		provider: "duckduckgo",
	}]);
	t.after(() => handle.close());
	const response = await fetch(new URL("/search", handle.url), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token: "test-token", query: "query" }),
	});
	const payload = await response.json() as { provider?: string };
	assert.equal(payload.provider, "duckduckgo");
	assert.equal(stored[0]?.provider, "duckduckgo");
});

test("curator unexpected failures use unknown instead of guessing the default provider", async t => {
	const { handle, stored } = await start(async () => {
		throw new Error("unexpected");
	});
	t.after(() => handle.close());
	const response = await fetch(new URL("/search", handle.url), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token: "test-token", query: "query" }),
	});
	const payload = await response.json() as { provider?: string; error?: string };
	assert.equal(payload.provider, "unknown");
	assert.equal(payload.error, "unexpected");
	assert.equal(stored[0]?.provider, "unknown");
});
