import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIWebSearchError } from "../openai-web-search.ts";
import {
	failedSearchProvider,
	normalizeSearchProviderSelection,
	routeSearch,
	selectSearchProvider,
	SearchExecutionError,
} from "../search.ts";

test("rejects unknown provider names instead of silently converting them to auto", () => {
	assert.throws(
		() => normalizeSearchProviderSelection("legacy-unknown"),
		(error: unknown) => (error as { category?: unknown }).category === "invalid-parameter",
	);
});

test("an explicit auto provider overrides a configured DuckDuckGo provider", () => {
	assert.equal(selectSearchProvider("auto", "duckduckgo"), "auto");
	assert.equal(selectSearchProvider(undefined, "duckduckgo"), "duckduckgo");
});

test("auto uses OpenAI when the preferred provider succeeds", async () => {
	let duckDuckGoCalls = 0;
	const response = await routeSearch("query", { provider: "auto" }, {
		openai: async () => ({
			answer: "OpenAI answer",
			results: [{ title: "Source", url: "https://example.com", snippet: "Snippet" }],
		}),
		duckduckgo: async () => {
			duckDuckGoCalls++;
			return { answer: "Duck answer", results: [] };
		},
	});

	assert.equal(response.provider, "openai");
	assert.equal(response.answer, "OpenAI answer");
	assert.equal(duckDuckGoCalls, 0);
});

test("explicit DuckDuckGo never touches OpenAI", async () => {
	let openAICalls = 0;
	const response = await routeSearch("query", { provider: "duckduckgo" }, {
		openai: async () => {
			openAICalls++;
			return { answer: "OpenAI", results: [] };
		},
		duckduckgo: async () => ({ answer: "Duck answer", results: [] }),
	});
	assert.equal(response.provider, "duckduckgo");
	assert.equal(openAICalls, 0);
});

test("invalid domain filters are rejected before any provider attempt", async () => {
	let attempts = 0;
	await assert.rejects(
		routeSearch("query", { provider: "auto", domainFilter: ["not-a-domain"] }, {
			openai: async () => {
				attempts++;
				return { answer: "OpenAI", results: [] };
			},
			duckduckgo: async () => {
				attempts++;
				return { answer: "Duck", results: [] };
			},
		}),
		(error: unknown) => (error as { category?: unknown }).category === "invalid-parameter",
	);
	assert.equal(attempts, 0);
});

test("auto falls back per query when OpenAI has an eligible failure", async () => {
	const response = await routeSearch("query", { provider: "auto" }, {
		openai: async () => {
			throw new OpenAIWebSearchError("missing-credentials", "not configured", { fallbackEligible: true });
		},
		duckduckgo: async () => ({
			answer: "Duck answer",
			results: [{ title: "Duck source", url: "https://duck.example", snippet: "Snippet" }],
		}),
	});

	assert.equal(response.provider, "duckduckgo");
	assert.equal(response.answer, "Duck answer");
});

test("records both providers when OpenAI and fallback fail", async () => {
	await assert.rejects(
		routeSearch("query", { provider: "auto" }, {
			openai: async () => {
				throw new OpenAIWebSearchError("network", "network", { fallbackEligible: true });
			},
			duckduckgo: async () => {
				throw new Error("rate limited");
			},
		}),
		(error: unknown) => {
			assert.ok(error instanceof SearchExecutionError);
			assert.equal(failedSearchProvider(error), "mixed");
			assert.deepEqual(error.attempts.map(attempt => attempt.provider), ["openai", "duckduckgo"]);
			return true;
		},
	);
});

test("security and caller-cancellation failures never fall back", async () => {
	for (const category of ["security", "caller-abort"] as const) {
		let duckDuckGoCalls = 0;
		await assert.rejects(
			routeSearch("query", { provider: "openai" }, {
				openai: async () => {
					throw new OpenAIWebSearchError(category, category);
				},
				duckduckgo: async () => {
					duckDuckGoCalls++;
					return { answer: "Duck answer", results: [] };
				},
			}),
		);
		assert.equal(duckDuckGoCalls, 0);
	}
});
