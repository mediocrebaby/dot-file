import { calculateContextTokens, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "./structured-output.ts";

export const CONTEXT_GUARD_WARNING_PERCENT = 80;
export const CONTEXT_GUARD_BLOCK_PERCENT = 90;

const FINAL_RESPONSE_REQUIREMENTS = [
	"Completed work",
	"Key findings or code changes",
	"Validation performed and results",
	"Unfinished items and recommended next steps",
	"Risks, errors, or uncertainties",
] as const;

const ContextGuardPhase = {
	Monitoring: "monitoring",
	Warning: "warning",
	Blocking: "blocking",
} as const;

type ContextGuardPhase = typeof ContextGuardPhase[keyof typeof ContextGuardPhase];

interface ContextGuardState {
	phase: ContextGuardPhase;
	warningInjected: boolean;
	blockingInjected: boolean;
	blockedAtPercent?: number;
}

interface AssistantMessageLike {
	role?: unknown;
	content?: unknown;
	stopReason?: unknown;
	usage?: unknown;
}

function initialContextGuardState(): ContextGuardState {
	return {
		phase: ContextGuardPhase.Monitoring,
		warningInjected: false,
		blockingInjected: false,
	};
}

function formatPercent(percent: number): string {
	return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function formatFinalResponseRequirements(): string {
	return FINAL_RESPONSE_REQUIREMENTS.map((requirement, index) => `${index + 1}. ${requirement}`).join("\n");
}

function warningMessage(percent: number): string {
	return [
		`Context guard warning: current context usage reached ${formatPercent(percent)}% (warning threshold ${CONTEXT_GUARD_WARNING_PERCENT}%).`,
		"Begin wrapping up now. Do not start new broad searches, browsing, delegation, or exploratory work. Complete only the smallest necessary in-flight step, then return the final response.",
		"The final response should cover:",
		formatFinalResponseRequirements(),
	].join("\n");
}

function blockingMessage(percent: number): string {
	return [
		`Context guard enforced: current context usage reached ${formatPercent(percent)}% (hard threshold ${CONTEXT_GUARD_BLOCK_PERCENT}%).`,
		`Stop work immediately. Do not call any more tools; only \`${STRUCTURED_OUTPUT_TOOL_NAME}\` is allowed when a structured output contract is active.`,
		"Return the final response now and explicitly identify anything incomplete or unverified. The final response should cover:",
		formatFinalResponseRequirements(),
	].join("\n");
}

function blockedToolMessage(toolName: string, percent: number): string {
	return [
		`Context guard blocked the '${toolName}' tool because context usage reached ${formatPercent(percent)}% (hard threshold ${CONTEXT_GUARD_BLOCK_PERCENT}%).`,
		`Do not call more tools. Return the final response now; only '${STRUCTURED_OUTPUT_TOOL_NAME}' remains available when a structured output contract is active.`,
	].join(" ");
}

function isInspectableAssistantMessage(message: unknown): boolean {
	const candidate = message as AssistantMessageLike;
	return candidate?.role === "assistant" && candidate.stopReason !== "aborted" && candidate.stopReason !== "error";
}

function hasToolCall(message: unknown, predicate: (toolName: unknown) => boolean): boolean {
	const candidate = message as AssistantMessageLike;
	if (!isInspectableAssistantMessage(candidate) || !Array.isArray(candidate.content)) return false;
	return candidate.content.some((block) => {
		if (!block || typeof block !== "object") return false;
		const toolCall = block as { type?: unknown; name?: unknown };
		return toolCall.type === "toolCall" && predicate(toolCall.name);
	});
}

function hasNonFinalizationToolCall(message: unknown): boolean {
	return hasToolCall(message, (toolName) => toolName !== STRUCTURED_OUTPUT_TOOL_NAME);
}

function hasFinalizationToolCall(message: unknown): boolean {
	return hasToolCall(message, (toolName) => toolName === STRUCTURED_OUTPUT_TOOL_NAME);
}

function currentContextPercent(ctx: ExtensionContext): number | undefined {
	const percent = ctx.getContextUsage()?.percent;
	return typeof percent === "number" && Number.isFinite(percent) ? percent : undefined;
}

function assistantMessageContextPercent(message: unknown, ctx: ExtensionContext): number | undefined {
	const candidate = message as AssistantMessageLike;
	const contextWindow = ctx.model?.contextWindow;
	if (
		!isInspectableAssistantMessage(candidate)
		|| !candidate.usage
		|| typeof contextWindow !== "number"
		|| !Number.isFinite(contextWindow)
		|| contextWindow <= 0
	) return undefined;
	const tokens = calculateContextTokens(candidate.usage as Parameters<typeof calculateContextTokens>[0]);
	return tokens > 0 ? (tokens / contextWindow) * 100 : undefined;
}

export function registerContextGuard(pi: ExtensionAPI): void {
	let state = initialContextGuardState();

	const injectSteer = (message: string): boolean => {
		pi.sendUserMessage(message, { deliverAs: "steer" });
		return true;
	};

	const evaluate = (message: unknown, ctx: ExtensionContext, percent: number | undefined): void => {
		if (percent === undefined) return;
		const hasNonFinalizationWork = hasNonFinalizationToolCall(message);
		const hasPendingMessages = ctx.hasPendingMessages();
		const workWillContinue = hasNonFinalizationWork || hasPendingMessages;

		if (percent >= CONTEXT_GUARD_BLOCK_PERCENT) {
			state.phase = ContextGuardPhase.Blocking;
			state.blockedAtPercent = Math.max(state.blockedAtPercent ?? 0, percent);
			const finalizationWillEndRun = hasFinalizationToolCall(message) && !hasNonFinalizationWork && !hasPendingMessages;
			if (!finalizationWillEndRun && !state.blockingInjected) {
				state.blockingInjected = injectSteer(blockingMessage(percent));
			}
			return;
		}

		if (percent < CONTEXT_GUARD_WARNING_PERCENT || state.phase === ContextGuardPhase.Blocking) return;
		state.phase = ContextGuardPhase.Warning;
		if (workWillContinue && !state.warningInjected) {
			state.warningInjected = injectSteer(warningMessage(percent));
		}
	};

	pi.on("message_end", (event, ctx) => {
		if (!isInspectableAssistantMessage(event.message)) return;
		evaluate(event.message, ctx, assistantMessageContextPercent(event.message, ctx));
	});
	pi.on("turn_end", (event, ctx) => {
		if (!isInspectableAssistantMessage(event.message)) return;
		evaluate(event.message, ctx, currentContextPercent(ctx));
	});
	pi.on("tool_call", (event) => {
		if (state.phase !== ContextGuardPhase.Blocking) return undefined;
		const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
		if (toolName === STRUCTURED_OUTPUT_TOOL_NAME) return undefined;
		return {
			block: true,
			reason: blockedToolMessage(toolName, state.blockedAtPercent ?? CONTEXT_GUARD_BLOCK_PERCENT),
		};
	});
	pi.on("session_compact", () => {
		state = initialContextGuardState();
	});
}
