import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
	createPinnedLookup,
	normalizeOpenAIWebSearchResponse,
	resolveOpenAIResponsesEndpoint,
	searchWithOpenAI,
} from "../openai-web-search.ts";

test("normalizes Responses answer, complete sources, and URL citations", () => {
	const response = {
		output: [
			{
				type: "web_search_call",
				action: {
					type: "search",
					sources: [
						{ url: "https://example.com/article#section" },
						{ url: "https://second.example/report", title: "Second report", snippet: "Second snippet" },
					],
				},
			},
			{
				type: "message",
				content: [{
					type: "output_text",
					text: "A current answer with a citation.",
					annotations: [{
						type: "url_citation",
						start_index: 2,
						end_index: 16,
						url: "https://example.com/article",
						title: "Example article",
					}],
				}],
			},
		],
	};

	assert.deepEqual(normalizeOpenAIWebSearchResponse(response, { numResults: 5 }), {
		answer: "A current answer with a citation.",
		results: [
			{
				title: "Example article",
				url: "https://example.com/article",
				snippet: "current answer",
			},
			{
				title: "Second report",
				url: "https://second.example/report",
				snippet: "Second snippet",
			},
		],
	});
});

test("accepts citation-only proxy responses when web_search_call is missing", () => {
	const response = normalizeOpenAIWebSearchResponse({
		output: [{
			type: "message",
			content: [{
				type: "output_text",
				text: "Proxy answer",
				annotations: [{
					type: "url_citation",
					start_index: 0,
					end_index: 5,
					url: "https://proxy.example/source",
					title: "Proxy source",
				}],
			}],
		}],
	});
	assert.deepEqual(response.results, [{
		title: "Proxy source",
		url: "https://proxy.example/source",
		snippet: "Proxy",
	}]);
});

test("allows an explicit HTTP loopback CLIProxyAPI endpoint", async () => {
	const endpoint = await resolveOpenAIResponsesEndpoint("http://127.0.0.1:8317/v1");
	assert.equal(endpoint.toString(), "http://127.0.0.1:8317/v1/responses");
});

test("rejects non-literal loopback HTTP endpoints and unsafe URL parts", async () => {
	for (const url of [
		"http://localhost:8317/v1",
		"http://2130706433:8317/v1",
		"http://127.1:8317/v1",
		"http://192.168.1.5:8317/v1",
		"https://127.0.0.1:8317/v1",
		"https://[::1]:8317/v1",
		"https://user:secret@example.com/v1",
		"https://example.com/v1?target=other",
		"https://example.com/v1#fragment",
	]) {
		await assert.rejects(
			resolveOpenAIResponsesEndpoint(url, { lookup: async () => [{ address: "93.184.216.34", family: 4 }] }),
			(error: unknown) => error instanceof Error && error.name === "OpenAIWebSearchError",
		);
	}
});

test("validates public HTTPS endpoint DNS without inheriting SSRF allow-range bypasses", async () => {
	for (const address of ["10.0.0.8", "ff02::1", "64:ff9b:1::1", "2001:2::1", "2001:db8::1", "3fff::1", "4000::1", "5f00::1", "fec0::1"]) {
		await assert.rejects(
			resolveOpenAIResponsesEndpoint("https://gateway.example/v1", {
				lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
			}),
			(error: unknown) => (error as { category?: unknown }).category === "security",
		);
	}
	await assert.rejects(
		resolveOpenAIResponsesEndpoint("https://gateway.example/v1", {
			lookup: async () => { throw Object.assign(new Error("temporary DNS failure"), { code: "EAI_AGAIN" }); },
		}),
		(error: unknown) => {
			const value = error as { category?: unknown; fallbackEligible?: unknown };
			return value.category === "network" && value.fallbackEligible === true;
		},
	);
	const endpoint = await resolveOpenAIResponsesEndpoint("https://gateway.example/v1", {
		lookup: async () => [{ address: "93.184.216.34", family: 4 }],
	});
	assert.equal(endpoint.toString(), "https://gateway.example/v1/responses");
});

test("pinned HTTPS lookup supports both single-address and all-address Node modes", async () => {
	const lookup = createPinnedLookup({ address: "93.184.216.34", family: 4 });
	const single = await new Promise<{ address: string; family?: number }>((resolve, reject) => {
		lookup("changed.example", { all: false }, (error, address, family) => {
			if (error) reject(error);
			else resolve({ address: address as string, family });
		});
	});
	assert.deepEqual(single, { address: "93.184.216.34", family: 4 });
	const all = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
		lookup("changed.example", { all: true }, (error, addresses) => {
			if (error) reject(error);
			else resolve(addresses as Array<{ address: string; family: number }>);
		});
	});
	assert.deepEqual(all, [{ address: "93.184.216.34", family: 4 }]);
});

test("reports missing credentials before DNS or network access", async () => {
	let lookupCalls = 0;
	let fetchCalls = 0;
	await assert.rejects(
		searchWithOpenAI("query", {}, {
			config: {},
			environment: {},
			lookup: async () => {
				lookupCalls++;
				return [{ address: "93.184.216.34", family: 4 }];
			},
			fetch: async () => {
				fetchCalls++;
				return new Response("{}");
			},
		}),
		(error: unknown) => (error as { category?: unknown }).category === "missing-credentials",
	);
	assert.equal(lookupCalls, 0);
	assert.equal(fetchCalls, 0);
});

test("sends the minimal non-streaming Responses web_search contract", async () => {
	let capturedUrl = "";
	let capturedInit: RequestInit | undefined;
	const response = await searchWithOpenAI("current stable Go release", {}, {
		config: { webSearch: { openai: { apiKey: "$SEARCH_KEY" } } },
		environment: { SEARCH_KEY: "secret-value" },
		lookup: async () => [{ address: "104.18.7.192", family: 4 }],
		fetch: async (input, init) => {
			capturedUrl = String(input);
			capturedInit = init;
			return new Response(JSON.stringify({
				output: [
					{ type: "web_search_call", action: { type: "search", sources: [{ url: "https://go.dev/doc/devel/release", title: "Go release history" }] } },
					{ type: "message", content: [{ type: "output_text", text: "Go has a current stable release.", annotations: [] }] },
				],
			}), { status: 200, headers: { "content-type": "application/json" } });
		},
	});

	assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
	assert.deepEqual(capturedInit?.headers, {
		"accept": "application/json",
		"authorization": "Bearer secret-value",
		"content-type": "application/json",
	});
	assert.equal(capturedInit?.method, "POST");
	assert.equal(capturedInit?.redirect, "manual");
	assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
		model: "gpt-5.6",
		tools: [{ type: "web_search", search_context_size: "medium" }],
		tool_choice: "required",
		include: ["web_search_call.action.sources"],
		input: "current stable Go release",
		stream: false,
		max_output_tokens: 1200,
	});
	assert.equal(response.results[0]?.url, "https://go.dev/doc/devel/release");
});

test("uses the pinned Node transport for a loopback CLIProxyAPI request", async () => {
	let capturedPath = "";
	let capturedAuthorization = "";
	const server = http.createServer((request, response) => {
		capturedPath = request.url ?? "";
		capturedAuthorization = request.headers.authorization ?? "";
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({
			output: [{
				type: "web_search_call",
				action: { sources: [{ url: "https://go.dev/", title: "Go" }] },
			}],
		}));
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	try {
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const result = await searchWithOpenAI("query", {}, {
			config: { webSearch: { openai: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-key" } } },
			environment: {},
		});
		assert.equal(capturedPath, "/v1/responses");
		assert.equal(capturedAuthorization, "Bearer local-key");
		assert.equal(result.results[0]?.url, "https://go.dev/");
	} finally {
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
});

test("stops reading oversized provider error bodies after the bounded prefix", async () => {
	let interval: NodeJS.Timeout | undefined;
	const server = http.createServer((_request, response) => {
		response.writeHead(401, { "content-type": "text/plain" });
		response.write("x".repeat(70 * 1024));
		interval = setInterval(() => response.write("x".repeat(1024)), 25);
		response.once("close", () => {
			if (interval) clearInterval(interval);
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const startedAt = Date.now();
	try {
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		await assert.rejects(
			searchWithOpenAI("query", {}, {
				config: { webSearch: { openai: {
					baseUrl: `http://127.0.0.1:${address.port}/v1`,
					apiKey: "local-key",
					timeoutSeconds: 2,
				} } },
				environment: {},
			}),
			(error: unknown) => (error as { category?: unknown }).category === "authentication",
		);
		assert.ok(Date.now() - startedAt < 1_000);
	} finally {
		if (interval) clearInterval(interval);
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
});

test("classifies provider errors without leaking credentials", async () => {
	await assert.rejects(
		searchWithOpenAI("query", {}, {
			config: { webSearch: { openai: { baseUrl: "http://127.0.0.1:8317/v1", apiKey: "super-secret" } } },
			environment: {},
			fetch: async () => new Response(JSON.stringify({ error: "unsupported super-secret web_search" }), { status: 400 }),
		}),
		(error: unknown) => {
			const value = error as { category?: unknown; fallbackEligible?: unknown; message?: string };
			assert.equal(value.category, "capability");
			assert.equal(value.fallbackEligible, true);
			assert.equal(value.message?.includes("super-secret"), false);
			assert.equal(value.message?.includes("[redacted]"), true);
			return true;
		},
	);
});

test("rejects Responses sources that violate requested domain filters", async () => {
	await assert.rejects(
		searchWithOpenAI("release notes", { domainFilter: ["docs.example.com", "-blocked.example.com"] }, {
			config: { webSearch: { openai: { baseUrl: "http://127.0.0.1:8317/v1", apiKey: "key" } } },
			environment: {},
			fetch: async () => new Response(JSON.stringify({
				output: [{
					type: "web_search_call",
					action: { sources: [{ url: "https://outside.example.net/result", title: "Outside" }] },
				}],
			}), { status: 200 }),
		}),
		(error: unknown) => {
			const value = error as { category?: unknown; fallbackEligible?: unknown };
			return value.category === "capability" && value.fallbackEligible === true;
		},
	);
});

test("applies cancellation and timeout budgets during endpoint DNS validation", async () => {
	const neverLookup = async (): Promise<Array<{ address: string; family: number }>> => new Promise(() => {});
	const controller = new AbortController();
	const cancelled = searchWithOpenAI("query", { signal: controller.signal }, {
		config: { webSearch: { openai: { baseUrl: "https://gateway.example/v1", apiKey: "key" } } },
		environment: {},
		lookup: neverLookup,
		fetch: async () => new Response("{}"),
	});
	controller.abort();
	await assert.rejects(cancelled, (error: unknown) => (error as { category?: unknown }).category === "caller-abort");

	await assert.rejects(
		searchWithOpenAI("query", {}, {
			config: { webSearch: { openai: { baseUrl: "https://gateway.example/v1", apiKey: "key", timeoutSeconds: 1 } } },
			environment: {},
			lookup: neverLookup,
			fetch: async () => new Response("{}"),
		}),
		(error: unknown) => (error as { category?: unknown }).category === "timeout",
	);
});

test("distinguishes caller cancellation from provider timeout", async () => {
	const abortingFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
		const signal = init?.signal;
		const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
		if (signal?.aborted) rejectAbort();
		else signal?.addEventListener("abort", rejectAbort, { once: true });
	});
	const controller = new AbortController();
	const cancelled = searchWithOpenAI("query", { signal: controller.signal }, {
		config: { webSearch: { openai: { baseUrl: "http://127.0.0.1:8317/v1", apiKey: "key" } } },
		environment: {},
		fetch: abortingFetch,
	});
	controller.abort();
	await assert.rejects(cancelled, (error: unknown) => (error as { category?: unknown }).category === "caller-abort");

	await assert.rejects(
		searchWithOpenAI("query", {}, {
			config: { webSearch: { openai: { baseUrl: "http://127.0.0.1:8317/v1", apiKey: "key", timeoutSeconds: 1 } } },
			environment: {},
			fetch: abortingFetch,
		}),
		(error: unknown) => {
			const value = error as { category?: unknown; fallbackEligible?: unknown };
			return value.category === "timeout" && value.fallbackEligible === true;
		},
	);
});

test("rejects headers that could override authentication or forwarding semantics", async () => {
	let fetchCalls = 0;
	await assert.rejects(
		searchWithOpenAI("query", {}, {
			config: {
				webSearch: {
					openai: {
						baseUrl: "http://127.0.0.1:8317/v1",
						apiKey: "key",
						headers: { Authorization: "other-key", "X-Forwarded-Host": "internal" },
					},
				},
			},
			environment: {},
			fetch: async () => {
				fetchCalls++;
				return new Response("{}");
			},
		}),
		(error: unknown) => (error as { category?: unknown }).category === "configuration",
	);
	assert.equal(fetchCalls, 0);
});

test("maps CLIProxyAPI config, controlled headers, domain filters, recency intent, and result caps", async () => {
	let capturedInit: RequestInit | undefined;
	const response = await searchWithOpenAI("release notes", {
		numResults: 1,
		recencyFilter: "week",
		domainFilter: ["https://docs.example.com/path", "-blocked.example.com"],
	}, {
		config: {
			webSearch: {
				openai: {
					channel: "cliproxyapi",
					baseUrl: "http://127.0.0.1:8317/v1",
					apiKey: "literal-config-key",
					model: "gpt-5.5",
					searchContextSize: "low",
					headers: { "X-OpenAI-Actor-Authorization": "$ACTOR_TOKEN" },
				},
			},
		},
		environment: {
			PI_WEB_SEARCH_OPENAI_API_KEY: "dedicated-env-key",
			OPENAI_API_KEY: "compat-env-key",
			ACTOR_TOKEN: "actor-secret",
		},
		fetch: async (_input, init) => {
			capturedInit = init;
			return new Response(JSON.stringify({
				output: [{
					type: "web_search_call",
					action: {
						sources: [
							{ url: "https://docs.example.com/one", title: "One" },
							{ url: "https://docs.example.com/two", title: "Two" },
						],
					},
				}],
			}), { status: 200 });
		},
	});

	assert.deepEqual(capturedInit?.headers, {
		"accept": "application/json",
		"authorization": "Bearer dedicated-env-key",
		"content-type": "application/json",
		"x-openai-actor-authorization": "actor-secret",
	});
	assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
		model: "gpt-5.5",
		tools: [{
			type: "web_search",
			search_context_size: "low",
			filters: {
				allowed_domains: ["docs.example.com"],
				blocked_domains: ["blocked.example.com"],
			},
		}],
		tool_choice: "required",
		include: ["web_search_call.action.sources"],
		input: "release notes\n\nRecency constraint: prioritize sources published or updated within the past week.",
		stream: false,
		max_output_tokens: 1200,
	});
	assert.deepEqual(response.results.map(result => result.title), ["One"]);
});
