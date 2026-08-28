export const MAX_SEARCH_RESULTS = 20;

export interface NormalizedSearchDomainFilters {
	allowed: string[];
	blocked: string[];
}

export class SearchOptionValidationError extends Error {
	readonly category = "invalid-parameter";

	constructor(message: string) {
		super(message);
		this.name = "SearchOptionValidationError";
	}
}

export function normalizeSearchResultCount(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 5;
	return Math.max(1, Math.min(Math.floor(value), MAX_SEARCH_RESULTS));
}

export function normalizeSearchDomain(value: string): string | null {
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

export function normalizeSearchDomainFilters(values: readonly unknown[] | undefined): NormalizedSearchDomainFilters {
	const filters: NormalizedSearchDomainFilters = { allowed: [], blocked: [] };
	const invalid: unknown[] = [];
	for (const raw of values ?? []) {
		if (typeof raw !== "string") {
			invalid.push(raw);
			continue;
		}
		const domain = normalizeSearchDomain(raw);
		if (!domain) {
			invalid.push(raw);
			continue;
		}
		const target = raw.trim().startsWith("-") ? filters.blocked : filters.allowed;
		if (!target.includes(domain)) target.push(domain);
	}
	if (invalid.length > 0) {
		throw new SearchOptionValidationError("domainFilter must contain valid hostnames or URLs, optionally prefixed with '-' to exclude");
	}
	return filters;
}
