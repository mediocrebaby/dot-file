import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ExtractedContent } from "./extract.ts";
import { searchWithDuckDuckGo } from "./duckduckgo.ts";
import { OpenAIWebSearchError, searchWithOpenAI } from "./openai-web-search.ts";
import { normalizeSearchDomainFilters, SearchOptionValidationError } from "./search-options.ts";

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchResponse {
	answer: string;
	results: SearchResult[];
	inlineContent?: ExtractedContent[];
}

export interface SearchOptions {
	numResults?: number;
	recencyFilter?: "day" | "week" | "month" | "year";
	domainFilter?: string[];
	signal?: AbortSignal;
}

export const RESOLVED_SEARCH_PROVIDERS = ["openai", "duckduckgo"] as const;
export const SEARCH_PROVIDERS = ["auto", ...RESOLVED_SEARCH_PROVIDERS] as const;

export type ResolvedSearchProvider = typeof RESOLVED_SEARCH_PROVIDERS[number];
export type SearchProvider = typeof SEARCH_PROVIDERS[number];
export type SearchProviderSelection = SearchProvider;

export interface AttributedSearchResponse extends SearchResponse {
	provider: ResolvedSearchProvider;
}

export interface SearchAttemptFailure {
	provider: ResolvedSearchProvider;
	category: string;
	message: string;
}

export class SearchExecutionError extends Error {
	readonly attempts: SearchAttemptFailure[];

	constructor(attempts: SearchAttemptFailure[]) {
		const summary = attempts.map(attempt => `${attempt.provider}: ${attempt.message}`).join("; ");
		super(summary || "Web search failed");
		this.name = "SearchExecutionError";
		this.attempts = attempts;
	}
}

export function normalizeSearchProviderSelection(value: unknown, label = "provider"): SearchProviderSelection {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (!normalized) return "auto";
	if (SEARCH_PROVIDERS.includes(normalized as SearchProvider)) return normalized as SearchProvider;
	throw new SearchOptionValidationError(`${label} must be auto, openai, or duckduckgo`);
}

export function selectSearchProvider(
	requested: unknown,
	configured: unknown,
	configuredLabel = "configured provider",
): SearchProviderSelection {
	if (requested !== undefined) return normalizeSearchProviderSelection(requested);
	if (configured !== undefined) return normalizeSearchProviderSelection(configured, configuredLabel);
	return "auto";
}

export interface FullSearchOptions extends SearchOptions {
	provider?: SearchProviderSelection;
	includeContent?: boolean;
	extensionContext?: ExtensionContext;
}

export interface SearchAdapters {
	openai: (query: string, options: FullSearchOptions) => Promise<SearchResponse>;
	duckduckgo: (query: string, options: FullSearchOptions) => Promise<SearchResponse>;
}

const DEFAULT_SEARCH_ADAPTERS: SearchAdapters = {
	openai: (query, options) => searchWithOpenAI(query, options),
	duckduckgo: (query, options) => searchWithDuckDuckGo(query, options),
};

function abortRequested(signal: AbortSignal | undefined, error: unknown): boolean {
	if (signal?.aborted) return true;
	return error instanceof OpenAIWebSearchError && error.category === "caller-abort";
}

function failureFor(provider: ResolvedSearchProvider, error: unknown): SearchAttemptFailure {
	if (error instanceof OpenAIWebSearchError) {
		return { provider, category: error.category, message: error.message };
	}
	const message = error instanceof Error ? error.message : String(error);
	return { provider, category: "provider", message };
}

export function failedSearchProvider(error: unknown): string | undefined {
	if (!(error instanceof SearchExecutionError)) return undefined;
	const providers = [...new Set(error.attempts.map(attempt => attempt.provider))];
	return providers.length === 1 ? providers[0] : providers.length > 1 ? "mixed" : undefined;
}

export async function routeSearch(
	query: string,
	options: FullSearchOptions = {},
	adapters: SearchAdapters = DEFAULT_SEARCH_ADAPTERS,
): Promise<AttributedSearchResponse> {
	normalizeSearchDomainFilters(options.domainFilter);
	const selected = options.provider ?? "auto";
	if (selected === "duckduckgo") {
		try {
			const result = await adapters.duckduckgo(query, options);
			return { ...result, provider: "duckduckgo" };
		} catch (error) {
			if (abortRequested(options.signal, error)) throw error;
			throw new SearchExecutionError([failureFor("duckduckgo", error)]);
		}
	}

	const attempts: SearchAttemptFailure[] = [];
	try {
		const result = await adapters.openai(query, options);
		return { ...result, provider: "openai" };
	} catch (error) {
		if (abortRequested(options.signal, error)) throw error;
		attempts.push(failureFor("openai", error));
		if (!(error instanceof OpenAIWebSearchError) || !error.fallbackEligible) {
			throw new SearchExecutionError(attempts);
		}
	}

	try {
		const result = await adapters.duckduckgo(query, options);
		return { ...result, provider: "duckduckgo" };
	} catch (error) {
		if (abortRequested(options.signal, error)) throw error;
		attempts.push(failureFor("duckduckgo", error));
		throw new SearchExecutionError(attempts);
	}
}

export async function search(query: string, options: FullSearchOptions = {}): Promise<AttributedSearchResponse> {
	return routeSearch(query, options);
}
