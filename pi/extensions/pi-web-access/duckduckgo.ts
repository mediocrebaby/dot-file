import { parseHTML } from "linkedom";
import { activityMonitor } from "./activity.ts";
import type { SearchOptions, SearchResponse, SearchResult } from "./search.ts";
import {
	MAX_SEARCH_RESULTS,
	normalizeSearchDomainFilters,
	normalizeSearchResultCount,
	type NormalizedSearchDomainFilters,
} from "./search-options.ts";

const DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/";
const SEARCH_TIMEOUT_MS = 30_000;
// A small pool of current desktop browser User-Agents. Every install of this extension previously sent
// the exact same hardcoded string, turning that one fingerprint into an easy target for DuckDuckGo's
// abuse detection; picking one at random per request spreads requests across several fingerprints.
const USER_AGENTS = [
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];
// Self-imposed pacing between outgoing requests. DuckDuckGo publishes no documented limit, so these
// are a conservative estimate meant to keep a burst of queries — a multi-query search, or back-to-back
// tool calls — from reading as automated traffic and tripping the endpoint's own rate limiting.
const MIN_REQUEST_INTERVAL_MS = 3_000;
const REQUEST_INTERVAL_JITTER_MS = 1_500;
// Short-lived result cache so an identical query (same text, filters, and recency window) made again
// soon after — e.g. the model re-running a search — is served instantly instead of spending another slot.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RATE_LIMIT_GUIDANCE =
	"DuckDuckGo search is being rate-limited. This uses the unofficial html.duckduckgo.com scraping endpoint (there is no free official web search API), which has no SLA — wait a bit and retry.";

function buildDuckDuckGoQuery(query: string, filters: NormalizedSearchDomainFilters): string {
	const parts = [query];
	if (filters.allowed.length === 1) {
		parts.push(`site:${filters.allowed[0]}`);
	} else if (filters.allowed.length > 1) {
		parts.push(filters.allowed.map(domain => `site:${domain}`).join(" OR "));
	}
	for (const domain of filters.blocked) parts.push(`-site:${domain}`);
	return parts.join(" ");
}

function mapRecencyFilter(recencyFilter: SearchOptions["recencyFilter"]): string | null {
	const map: Record<string, string> = { day: "d", week: "w", month: "m", year: "y" };
	return recencyFilter ? (map[recencyFilter] ?? null) : null;
}

function resolveResultUrl(href: string): string | null {
	const trimmed = href.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed, "https://duckduckgo.com");
		const uddg = url.searchParams.get("uddg");
		if (uddg) return decodeURIComponent(uddg);
	} catch {
		// Not parseable as a URL; fall through to the plain absolute-href check.
	}
	return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function buildAnswer(results: SearchResult[]): string {
	return results
		.map((result) => result.snippet
			? `${result.snippet}\nSource: ${result.title} (${result.url})`
			: `Source: ${result.title} (${result.url})`)
		.join("\n\n");
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

interface CachedSearchEntry {
	results: SearchResult[];
	expiresAt: number;
}

const searchCache = new Map<string, CachedSearchEntry>();

function cacheKeyFor(searchQuery: string, df: string | null): string {
	return `${searchQuery}\u0000${df ?? ""}`;
}

function getCachedResults(key: string): SearchResult[] | null {
	const entry = searchCache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		searchCache.delete(key);
		return null;
	}
	return entry.results;
}

function setCachedResults(key: string, results: SearchResult[]): void {
	if (searchCache.size >= CACHE_MAX_ENTRIES) {
		const oldestKey = searchCache.keys().next().value;
		if (oldestKey !== undefined) searchCache.delete(oldestKey);
	}
	searchCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

function pickUserAgent(): string {
	return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function abortedSlotError(): DOMException {
	return new DOMException("The search request was aborted while waiting for a request slot.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(abortedSlotError());
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(abortedSlotError());
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

// Serializes every outgoing DuckDuckGo request behind a minimum spacing interval (plus jitter) so that
// neither multiple queries in one tool call nor overlapping tool calls burst the unofficial
// html.duckduckgo.com endpoint, which is what triggers its HTTP 202 rate-limit response.
let schedulerTail: Promise<void> = Promise.resolve();
let lastDispatchAt = 0;

function scheduleRequestSlot(signal?: AbortSignal): Promise<void> {
	const slot = schedulerTail.then(async () => {
		if (signal?.aborted) throw abortedSlotError();
		const targetGapMs = MIN_REQUEST_INTERVAL_MS + Math.random() * REQUEST_INTERVAL_JITTER_MS;
		const waitMs = lastDispatchAt + targetGapMs - Date.now();
		if (waitMs > 0) await delay(waitMs, signal);
		lastDispatchAt = Date.now();
	});
	// Keep the shared chain resolved even when this reservation is aborted, so later callers queue
	// behind the last real dispatch instead of a permanently rejected tail promise.
	schedulerTail = slot.catch(() => {});
	return slot;
}

export function isDuckDuckGoAvailable(): boolean {
	return true;
}

export async function searchWithDuckDuckGo(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
	const numResults = normalizeSearchResultCount(options.numResults);
	const filters = normalizeSearchDomainFilters(options.domainFilter);
	const searchQuery = buildDuckDuckGoQuery(query, filters);
	const params = new URLSearchParams({ q: searchQuery });
	const df = mapRecencyFilter(options.recencyFilter);
	if (df) params.set("df", df);

	const cacheKey = cacheKeyFor(searchQuery, df);
	const cached = getCachedResults(cacheKey);
	if (cached) {
		const sliced = cached.slice(0, numResults);
		return { answer: buildAnswer(sliced), results: sliced };
	}

	const activityId = activityMonitor.logStart({ type: "api", query: searchQuery, provider: "duckduckgo" });

	try {
		await scheduleRequestSlot(options.signal);

		const response = await fetch(`${DUCKDUCKGO_URL}?${params.toString()}`, {
			method: "GET",
			headers: {
				"User-Agent": pickUserAgent(),
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
			signal: options.signal
				? AbortSignal.any([AbortSignal.timeout(SEARCH_TIMEOUT_MS), options.signal])
				: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
		});

		// DuckDuckGo returns HTTP 202 (a 2xx status that response.ok treats as success)
		// when it is rate-limiting the unofficial html.duckduckgo.com scraping endpoint.
		if (response.status === 202) {
			activityMonitor.logError(activityId, "HTTP 202 (rate limited)");
			throw new Error(RATE_LIMIT_GUIDANCE);
		}

		if (!response.ok) {
			activityMonitor.logError(activityId, `HTTP ${response.status}`);
			const errorText = await response.text();
			throw new Error(`DuckDuckGo search error ${response.status}: ${errorText.slice(0, 300)}`);
		}

		const html = await response.text();
		let document: Document;
		try {
			document = parseHTML(html).document as unknown as Document;
		} catch (err) {
			throw new Error(`DuckDuckGo returned unparseable HTML: ${errorMessage(err)}`);
		}

		const results: SearchResult[] = [];
		const anchors = document.querySelectorAll(".result__a");
		for (const anchor of Array.from(anchors)) {
			const href = anchor.getAttribute("href") || "";
			const url = resolveResultUrl(href);
			if (!url) continue;
			const title = anchor.textContent?.replace(/\s+/g, " ").trim() || url;
			const container = anchor.closest(".result") ?? anchor.parentElement?.parentElement ?? null;
			const snippetEl = container?.querySelector(".result__snippet") ?? null;
			const snippet = snippetEl?.textContent?.replace(/\s+/g, " ").trim() || "";
			results.push({ title, url, snippet });
			if (results.length >= MAX_SEARCH_RESULTS) break;
		}

		if (results.length === 0 && response.status !== 200) {
			activityMonitor.logError(activityId, `No results parsed (HTTP ${response.status})`);
			throw new Error(RATE_LIMIT_GUIDANCE);
		}

		activityMonitor.logComplete(activityId, response.status);
		setCachedResults(cacheKey, results);
		const sliced = results.slice(0, numResults);
		return { answer: buildAnswer(sliced), results: sliced };
	} catch (err) {
		const message = errorMessage(err);
		if (message.toLowerCase().includes("abort")) {
			activityMonitor.logComplete(activityId, 0);
		} else {
			activityMonitor.logError(activityId, message);
		}
		throw err;
	}
}
