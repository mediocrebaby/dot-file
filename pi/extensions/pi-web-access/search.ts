import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ExtractedContent } from "./extract.ts";
import { searchWithDuckDuckGo } from "./duckduckgo.ts";

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

export const RESOLVED_SEARCH_PROVIDERS = ["duckduckgo"] as const;
export const SEARCH_PROVIDERS = ["auto", ...RESOLVED_SEARCH_PROVIDERS] as const;

export type ResolvedSearchProvider = typeof RESOLVED_SEARCH_PROVIDERS[number];
export type SearchProvider = typeof SEARCH_PROVIDERS[number];
export type SearchProviderSelection = SearchProvider;

export interface AttributedSearchResponse extends SearchResponse {
	provider: ResolvedSearchProvider;
}

export function normalizeSearchProviderSelection(value: unknown, _label = "provider"): SearchProviderSelection {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	return SEARCH_PROVIDERS.includes(normalized as SearchProvider) ? (normalized as SearchProvider) : "auto";
}

export interface FullSearchOptions extends SearchOptions {
	provider?: SearchProviderSelection;
	includeContent?: boolean;
	extensionContext?: ExtensionContext;
}

// DuckDuckGo (zero-config, always available) is the sole search provider.
// "auto" and "duckduckgo" are equivalent — both dispatch here.
export async function search(query: string, options: FullSearchOptions = {}): Promise<AttributedSearchResponse> {
	const result = await searchWithDuckDuckGo(query, options);
	return { ...result, provider: "duckduckgo" };
}
