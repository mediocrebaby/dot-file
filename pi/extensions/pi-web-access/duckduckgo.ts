import { parseHTML } from "linkedom";
import { activityMonitor } from "./activity.ts";
import type { SearchOptions, SearchResponse, SearchResult } from "./search.ts";

const DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/";
const SEARCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const RATE_LIMIT_GUIDANCE =
	"DuckDuckGo search is being rate-limited. This uses the unofficial html.duckduckgo.com scraping endpoint (there is no free official web search API), which has no SLA — wait a bit and retry.";

interface NormalizedDomainFilters {
	allowed: string[];
	blocked: string[];
}

function normalizeCount(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 5;
	return Math.max(1, Math.min(Math.floor(value), 20));
}

function normalizeDomain(value: string): string | null {
	let input = value.trim().toLowerCase();
	if (!input) return null;
	if (input.startsWith("-")) input = input.slice(1).trim();
	if (!input) return null;
	try {
		const parsed = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
		input = parsed.hostname;
	} catch {
		input = input.split("/")[0]?.split(":")[0] ?? "";
	}
	input = input.replace(/^\.+|\.+$/g, "");
	return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input) ? input : null;
}

function normalizeDomainFilters(domainFilter: string[] | undefined): NormalizedDomainFilters {
	const filters: NormalizedDomainFilters = { allowed: [], blocked: [] };
	for (const raw of domainFilter ?? []) {
		const domain = normalizeDomain(raw);
		if (!domain) continue;
		const target = raw.trim().startsWith("-") ? filters.blocked : filters.allowed;
		if (!target.includes(domain)) target.push(domain);
	}
	return filters;
}

function buildDuckDuckGoQuery(query: string, filters: NormalizedDomainFilters): string {
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

export function isDuckDuckGoAvailable(): boolean {
	return true;
}

export async function searchWithDuckDuckGo(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
	const numResults = normalizeCount(options.numResults);
	const filters = normalizeDomainFilters(options.domainFilter);
	const searchQuery = buildDuckDuckGoQuery(query, filters);
	const params = new URLSearchParams({ q: searchQuery });
	const df = mapRecencyFilter(options.recencyFilter);
	if (df) params.set("df", df);

	const activityId = activityMonitor.logStart({ type: "api", query: searchQuery });

	try {
		const response = await fetch(`${DUCKDUCKGO_URL}?${params.toString()}`, {
			method: "GET",
			headers: {
				"User-Agent": USER_AGENT,
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
			if (results.length >= numResults) break;
		}

		if (results.length === 0 && response.status !== 200) {
			activityMonitor.logError(activityId, `No results parsed (HTTP ${response.status})`);
			throw new Error(RATE_LIMIT_GUIDANCE);
		}

		activityMonitor.logComplete(activityId, response.status);
		return { answer: buildAnswer(results), results };
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
