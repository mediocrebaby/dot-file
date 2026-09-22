import type { SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { QoderModelEntry } from "./models.ts";

export interface QoderStreamOptions extends SimpleStreamOptions {
  /** Local <think> tag extraction only; never disables upstream reasoning generation. */
  parseThinkingTags?: boolean;
}

const EFFORT_MAP = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

export function resolveQoderReasoningEffort(config: QoderModelEntry, reasoning: unknown): string | undefined {
  // Pi's UI off currently also arrives as undefined. Do not interpret omission
  // as an upstream disable instruction or override the server's default.
  if (reasoning === undefined) return undefined;
  if (reasoning === "off" || reasoning === false) {
    throw new Error("Qoder disabling reasoning generation is not verified; use parseThinkingTags: false only for local tag parsing.");
  }
  if (typeof reasoning !== "string" || !Object.hasOwn(EFFORT_MAP, reasoning)) {
    throw new Error(`Unknown Pi reasoning effort: ${String(reasoning)}`);
  }

  const effort = EFFORT_MAP[reasoning as keyof typeof EFFORT_MAP];
  const advertised = config.thinking_config?.enabled?.efforts;
  // The actual catalog is authoritative: is_reasoning/supportsEffort alone
  // cannot identify allowed levels, and Kimi can expose efforts with is_reasoning=false.
  const supported = advertised && typeof advertised === "object" && !Array.isArray(advertised)
    ? Object.values(EFFORT_MAP).filter((value, index, values) => values.indexOf(value) === index && Object.hasOwn(advertised, value))
    : [];
  if (!supported.includes(effort)) {
    throw new Error(`Qoder reasoning effort ${reasoning} (${effort}) is not supported by the cached model catalog; supported: ${supported.join(", ") || "none confirmed"}. Refresh the catalog or leave reasoning unspecified.`);
  }
  return effort;
}
