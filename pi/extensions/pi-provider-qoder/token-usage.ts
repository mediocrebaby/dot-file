import type { Usage } from "@earendil-works/pi-ai";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

// Compatibility mapping and evidence limits: .agents/notes/implemented/feature/2026-09-22-qoder-token-usage.md
export function createQoderUsageUpdater(target: Usage): (raw: unknown) => void {
  // Store the inclusive prompt count, not target.input, to avoid subtracting caches twice.
  let promptTokens: number | undefined;
  let cacheRead = 0;
  let cacheWrite = 0;

  return (raw) => {
    const usage = record(raw);
    if (!usage) return;
    const details = record(usage.prompt_tokens_details);

    // Usage is a cumulative snapshot, not a delta. Missing/invalid fields leave
    // previous values intact; an explicit zero is a valid replacement.
    promptTokens = count(usage.prompt_tokens) ?? promptTokens;
    cacheRead = count(details?.cached_tokens) ?? count(usage.prompt_cache_hit_tokens) ?? cacheRead;
    cacheWrite = count(details?.cacheable_tokens) ?? cacheWrite;
    target.output = count(usage.completion_tokens) ?? target.output;
    target.totalTokens = count(usage.total_tokens) ?? target.totalTokens;

    // Reject an impossible breakdown instead of clamping or double-counting it.
    const validBreakdown = promptTokens === undefined || cacheRead + cacheWrite <= promptTokens;
    target.cacheRead = validBreakdown ? cacheRead : 0;
    target.cacheWrite = validBreakdown ? cacheWrite : 0;
    target.input = promptTokens === undefined ? 0 : promptTokens - target.cacheRead - target.cacheWrite;

    // Neither infer missing totals nor convert Qoder credits into monetary cost.
    // Unreported values keep Pi's required zero defaults, not an estimated count.
  };
}
