import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
	AgentProgress,
	Details,
	SingleResult,
	SubagentOutputState,
	SubagentResultStatus,
	SubagentRunMode,
	Usage,
} from "../../shared/types.ts";
import {
	formatWorkflowCompletionContent,
	formatWorkflowTerminalContent,
	formatWorkflowValue,
} from "../../workflows/result-format.ts";

type AsyncTerminalState = "complete" | "failed" | "paused" | "stopped" | "rejected";

interface AsyncCompletionChild {
	[key: string]: unknown;
	agent?: string;
	task?: string;
	context?: SingleResult["context"];
	output?: string;
	outputState?: SubagentOutputState;
	summary?: string;
	error?: string;
	success?: boolean;
	status?: SubagentResultStatus | string;
	state?: string;
	exitCode?: number | null;
	processSignal?: string | null;
	interrupted?: boolean;
	timedOut?: boolean;
	stopped?: boolean;
	turnBudget?: SingleResult["turnBudget"];
	turnBudgetExceeded?: boolean;
	wrapUpRequested?: boolean;
	toolBudget?: SingleResult["toolBudget"];
	toolBudgetBlocked?: boolean;
	usage?: Usage;
	model?: string;
	thinking?: string;
	attemptedModels?: string[];
	modelAttempts?: SingleResult["modelAttempts"];
	sessionFile?: string;
	artifactPaths?: SingleResult["artifactPaths"];
	outputSaveError?: string;
	metadataSaveError?: string;
	transcriptPath?: string;
	transcriptError?: string;
	structuredOutput?: unknown;
	structuredOutputPath?: string;
	structuredOutputSchemaPath?: string;
	acceptance?: SingleResult["acceptance"];
	agentContract?: SingleResult["agentContract"];
	launchContractDigest?: string;
	launchResolvedExtensions?: SingleResult["launchResolvedExtensions"];
	runtimeAcknowledgedExtensions?: SingleResult["runtimeAcknowledgedExtensions"];
	execution?: SingleResult["execution"];
	review?: SingleResult["review"];
	effects?: SingleResult["effects"];
	children?: SingleResult["children"];
	watchdog?: SingleResult["watchdog"];
	capabilityCeiling?: SingleResult["capabilityCeiling"];
	capabilityAudit?: SingleResult["capabilityAudit"];
	progress?: AgentProgress;
	durationMs?: number;
	truncated?: unknown;
}

export interface AsyncCompletionPayload {
	[key: string]: unknown;
	id?: string | null;
	runId?: string;
	mode?: string;
	state?: string;
	success?: boolean;
	summary?: string;
	error?: string;
	exitCode?: number;
	processSignal?: string | null;
	interrupted?: boolean;
	timedOut?: boolean;
	stopped?: boolean;
	turnBudgetExceeded?: boolean;
	results?: AsyncCompletionChild[];
	workflow?: Details["workflow"];
	workflowGraph?: Details["workflowGraph"];
	asyncDir?: string;
	timeoutMs?: number;
	deadlineAt?: number;
	turnBudget?: Details["turnBudget"];
	toolBudget?: Details["toolBudget"];
	usageBudget?: Details["usageBudget"];
	checkpoint?: Details["checkpoint"];
	outputs?: Details["outputs"];
	parallelHandoff?: Details["parallelHandoff"];
	totalCost?: Details["totalCost"];
	capabilityCeiling?: Details["capabilityCeiling"];
	capabilityAudit?: Details["capabilityAudit"];
	launchContractDigest?: string;
	launchResolvedExtensions?: Details["launchResolvedExtensions"];
	runtimeAcknowledgedExtensions?: Details["runtimeAcknowledgedExtensions"];
	durationMs?: number;
}

export interface AsyncLiveSnapshot {
	result: AgentToolResult<Details>;
	version: number;
}

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	turns: 0,
};
const ASYNC_TERMINAL_STATES = new Set<AsyncTerminalState>(["complete", "failed", "paused", "stopped", "rejected"]);
const ASYNC_RUN_MODES = new Set<SubagentRunMode>(["single", "parallel", "chain", "workflow"]);
const liveSnapshots = new Map<string, AsyncLiveSnapshot>();
let versionCounter = 1;

function nextVersion(): number {
	return versionCounter++;
}

export function resolveAsyncCompletionRunId(payload: AsyncCompletionPayload): string | undefined {
	const runId = typeof payload.runId === "string" && payload.runId.trim()
		? payload.runId
		: typeof payload.id === "string" && payload.id.trim()
			? payload.id
			: undefined;
	return runId;
}

function resolveTerminalState(payload: AsyncCompletionPayload): AsyncTerminalState {
	if (typeof payload.state === "string" && ASYNC_TERMINAL_STATES.has(payload.state as AsyncTerminalState)) {
		return payload.state as AsyncTerminalState;
	}
	if (payload.stopped) return "stopped";
	if (payload.interrupted) return "paused";
	return payload.success === true ? "complete" : "failed";
}

function resolveMode(payload: AsyncCompletionPayload, previous: AgentToolResult<Details> | undefined): SubagentRunMode {
	if (typeof payload.mode === "string" && ASYNC_RUN_MODES.has(payload.mode as SubagentRunMode)) {
		return payload.mode as SubagentRunMode;
	}
	if (previous?.details && ASYNC_RUN_MODES.has(previous.details.mode as SubagentRunMode)) {
		return previous.details.mode as SubagentRunMode;
	}
	return (payload.results?.length ?? 0) > 1 ? "parallel" : "single";
}

function resolveChildStatus(child: AsyncCompletionChild, state: AsyncTerminalState): SubagentResultStatus {
	if (child.status === "completed" || child.status === "failed" || child.status === "paused" || child.status === "stopped" || child.status === "detached") {
		return child.status;
	}
	if (child.state === "complete" || child.state === "completed") return "completed";
	if (child.state === "paused") return "paused";
	if (child.state === "stopped" || child.stopped) return "stopped";
	if (child.success === true) return "completed";
	if (child.success === false) return "failed";
	if (state === "complete") return "completed";
	if (state === "paused") return "paused";
	if (state === "stopped") return "stopped";
	return "failed";
}

function progressStatus(status: SubagentResultStatus): AgentProgress["status"] {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	return "detached";
}

function cloneUsage(usage: Usage | undefined): Usage {
	return usage ? { ...usage } : { ...EMPTY_USAGE };
}

function structuredOutputText(value: unknown): string | undefined {
	return value === undefined ? undefined : `Structured output:\n${formatWorkflowValue(value)}`;
}

function resolveChildOutput(
	child: AsyncCompletionChild,
	payload: AsyncCompletionPayload,
	resultCount: number,
): string {
	if (typeof child.output === "string") return child.output;
	if (typeof child.summary === "string") return child.summary;
	if (typeof child.error === "string") return child.error;
	const structured = structuredOutputText(child.structuredOutput);
	if (structured !== undefined) return structured;
	if (resultCount === 1 && typeof payload.summary === "string") return payload.summary;
	return "(no output)";
}

function resolveOutputState(child: AsyncCompletionChild, output: string): SubagentOutputState {
	if (child.outputState === "present" || child.outputState === "absent" || child.outputState === "unknown") {
		return child.outputState;
	}
	return output.trim() && output !== "(no output)" ? "present" : "absent";
}

function previousResultForChild(
	previous: AgentToolResult<Details> | undefined,
	child: AsyncCompletionChild,
	index: number,
): SingleResult | undefined {
	return previous?.details.results.find((result) => result.index === index)
		?? previous?.details.results.find((result) => result.agent === child.agent)
		?? previous?.details.results[index];
}

function buildTerminalResult(
	child: AsyncCompletionChild,
	index: number,
	payload: AsyncCompletionPayload,
	state: AsyncTerminalState,
	previous: AgentToolResult<Details> | undefined,
	resultCount: number,
): SingleResult {
	const prior = previousResultForChild(previous, child, index);
	const agent = child.agent ?? prior?.agent ?? (resultCount === 1 && typeof payload.agent === "string" ? payload.agent : `step-${index + 1}`);
	const task = child.task ?? prior?.task ?? "";
	const status = resolveChildStatus(child, state);
	const output = resolveChildOutput(child, payload, resultCount);
	const error = child.error ?? (status === "failed" && typeof payload.error === "string" ? payload.error : undefined);
	const durationMs = child.durationMs ?? prior?.progress?.durationMs ?? payload.durationMs ?? 0;
	const progress: AgentProgress = {
		index,
		agent,
		status: progressStatus(status),
		task,
		recentTools: prior?.progress?.recentTools ?? [],
		recentOutput: prior?.progress?.recentOutput ?? [],
		toolCount: prior?.progress?.toolCount ?? 0,
		tokens: prior?.progress?.tokens ?? 0,
		durationMs,
		...(error ? { error } : {}),
	};
	const interrupted = child.interrupted === true || status === "paused";
	const stopped = child.stopped === true || status === "stopped";
	const detached = status === "detached";
	const exitCode = typeof child.exitCode === "number"
		? child.exitCode
		: status === "completed" || status === "paused" || status === "detached"
			? 0
			: 1;
	const truncation = child.truncated && typeof child.truncated === "object" && !Array.isArray(child.truncated)
		? child.truncated as SingleResult["truncation"]
		: undefined;
	return {
		index,
		agent,
		task,
		...(child.context ?? prior?.context ? { context: child.context ?? prior?.context } : {}),
		exitCode,
		...(child.processSignal !== undefined ? { processSignal: child.processSignal } : {}),
		...(detached ? { detached: true } : {}),
		...(interrupted ? { interrupted: true } : {}),
		...(child.timedOut ? { timedOut: true } : {}),
		...(stopped ? { stopped: true } : {}),
		...(child.turnBudget ? { turnBudget: child.turnBudget } : {}),
		...(child.turnBudgetExceeded ? { turnBudgetExceeded: true } : {}),
		...(child.wrapUpRequested ? { wrapUpRequested: true } : {}),
		...(child.toolBudget ? { toolBudget: child.toolBudget } : {}),
		...(child.toolBudgetBlocked ? { toolBudgetBlocked: true } : {}),
		messages: prior?.messages ?? [],
		usage: cloneUsage(child.usage ?? prior?.usage),
		...(child.model ?? prior?.model ? { model: child.model ?? prior?.model } : {}),
		...(child.thinking ?? prior?.thinking ? { thinking: child.thinking ?? prior?.thinking } : {}),
		...(child.attemptedModels ? { attemptedModels: child.attemptedModels } : {}),
		...(child.modelAttempts ? { modelAttempts: child.modelAttempts } : {}),
		...(error ? { error } : {}),
		...(child.sessionFile ? { sessionFile: child.sessionFile } : {}),
		progress,
		...(child.artifactPaths ? { artifactPaths: child.artifactPaths } : {}),
		...(truncation ? { truncation } : {}),
		finalOutput: output,
		outputState: resolveOutputState(child, output),
		...(child.outputSaveError ? { outputSaveError: child.outputSaveError } : {}),
		...(child.metadataSaveError ? { metadataSaveError: child.metadataSaveError } : {}),
		...(child.structuredOutput !== undefined ? { structuredOutput: child.structuredOutput } : {}),
		...(child.structuredOutputPath ? { structuredOutputPath: child.structuredOutputPath } : {}),
		...(child.structuredOutputSchemaPath ? { structuredOutputSchemaPath: child.structuredOutputSchemaPath } : {}),
		...(child.acceptance ? { acceptance: child.acceptance } : {}),
		...(child.agentContract ? { agentContract: child.agentContract } : {}),
		...(child.launchContractDigest ? { launchContractDigest: child.launchContractDigest } : {}),
		...(child.launchResolvedExtensions ? { launchResolvedExtensions: child.launchResolvedExtensions } : {}),
		...(child.runtimeAcknowledgedExtensions ? { runtimeAcknowledgedExtensions: child.runtimeAcknowledgedExtensions } : {}),
		...(child.execution ? { execution: child.execution } : {}),
		...(child.review ? { review: child.review } : {}),
		...(child.effects ? { effects: child.effects } : {}),
		...(child.transcriptPath ? { transcriptPath: child.transcriptPath } : {}),
		...(child.transcriptError ? { transcriptError: child.transcriptError } : {}),
		...(child.children ? { children: child.children } : {}),
		...(child.watchdog ? { watchdog: child.watchdog } : {}),
		...(child.capabilityCeiling ? { capabilityCeiling: child.capabilityCeiling } : {}),
		...(child.capabilityAudit ? { capabilityAudit: child.capabilityAudit } : {}),
	};
}

function terminalLabel(state: AsyncTerminalState): string {
	if (state === "stopped") return "Workflow stopped";
	if (state === "paused") return "Workflow paused";
	if (state === "rejected") return "Workflow rejected";
	return "Workflow failed";
}

function buildContent(
	mode: SubagentRunMode,
	state: AsyncTerminalState,
	payload: AsyncCompletionPayload,
	results: SingleResult[],
	workflow: Details["workflow"],
): string {
	if (mode === "workflow" && workflow) {
		if (state === "complete") return formatWorkflowCompletionContent(workflow);
		const message = payload.error ?? payload.summary ?? `Async workflow ended with state '${state}'.`;
		return formatWorkflowTerminalContent(terminalLabel(state), message, workflow);
	}
	if (results.length === 1) return results[0]!.finalOutput ?? payload.summary ?? "(no output)";
	return payload.summary ?? `Async ${mode} ${state}.`;
}

export function buildAsyncCompletionResult(
	payload: AsyncCompletionPayload,
	previous?: AgentToolResult<Details>,
): AgentToolResult<Details> | undefined {
	const runId = resolveAsyncCompletionRunId(payload);
	if (!runId) return undefined;
	const state = resolveTerminalState(payload);
	const mode = resolveMode(payload, previous);
	const children = Array.isArray(payload.results) && payload.results.length > 0
		? payload.results
		: [{
			agent: typeof payload.agent === "string" ? payload.agent : undefined,
			output: payload.summary,
			error: payload.error,
			success: payload.success,
			state,
			exitCode: payload.exitCode,
			processSignal: payload.processSignal,
			interrupted: payload.interrupted,
			timedOut: payload.timedOut,
			stopped: payload.stopped,
			turnBudgetExceeded: payload.turnBudgetExceeded,
		} satisfies AsyncCompletionChild];
	const results = children.map((child, index) => buildTerminalResult(child, index, payload, state, previous, children.length));
	const workflowSource = payload.workflow ?? previous?.details.workflow;
	const workflow = workflowSource ? { ...workflowSource, terminalState: state } : undefined;
	const details: Details = {
		...previous?.details,
		mode,
		runId,
		asyncId: runId,
		...(typeof payload.asyncDir === "string" ? { asyncDir: payload.asyncDir } : {}),
		results,
		progress: results.map((result) => result.progress!),
		...(typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}),
		...(typeof payload.deadlineAt === "number" ? { deadlineAt: payload.deadlineAt } : {}),
		...(payload.timedOut ? { timedOut: true } : {}),
		...(payload.stopped || state === "stopped" ? { stopped: true } : {}),
		...(payload.turnBudget ? { turnBudget: payload.turnBudget } : {}),
		...(payload.toolBudget ? { toolBudget: payload.toolBudget } : {}),
		...(payload.usageBudget ? { usageBudget: payload.usageBudget } : {}),
		...(payload.workflowGraph ? { workflowGraph: payload.workflowGraph } : {}),
		...(payload.checkpoint ? { checkpoint: payload.checkpoint } : {}),
		...(payload.outputs ? { outputs: payload.outputs } : {}),
		...(payload.parallelHandoff ? { parallelHandoff: payload.parallelHandoff } : {}),
		...(payload.totalCost ? { totalCost: payload.totalCost } : {}),
		...(payload.capabilityCeiling ? { capabilityCeiling: payload.capabilityCeiling } : {}),
		...(payload.capabilityAudit ? { capabilityAudit: payload.capabilityAudit } : {}),
		...(payload.launchContractDigest ? { launchContractDigest: payload.launchContractDigest } : {}),
		...(payload.launchResolvedExtensions ? { launchResolvedExtensions: payload.launchResolvedExtensions } : {}),
		...(payload.runtimeAcknowledgedExtensions ? { runtimeAcknowledgedExtensions: payload.runtimeAcknowledgedExtensions } : {}),
		...(workflow ? { workflow } : {}),
	};
	return {
		content: [{ type: "text", text: buildContent(mode, state, payload, results, workflow) }],
		...(state === "failed" || state === "rejected" ? { isError: true } : {}),
		details,
	};
}

function resultRunId(result: AgentToolResult<Details>): string | undefined {
	return result.details.asyncId;
}

export function trackAsyncLiveResult(result: AgentToolResult<Details>): string | undefined {
	const runId = resultRunId(result);
	if (!runId || liveSnapshots.has(runId)) return runId;
	liveSnapshots.set(runId, { result, version: nextVersion() });
	return runId;
}

export function applyAsyncCompletion(payload: AsyncCompletionPayload): boolean {
	const runId = resolveAsyncCompletionRunId(payload);
	if (!runId) return false;
	const previous = liveSnapshots.get(runId)?.result;
	const result = buildAsyncCompletionResult(payload, previous);
	if (!result) return false;
	liveSnapshots.set(runId, { result, version: nextVersion() });
	return previous !== undefined;
}

export function getAsyncRenderableSnapshot(result: AgentToolResult<Details>): AsyncLiveSnapshot {
	const runId = resultRunId(result);
	return runId ? liveSnapshots.get(runId) ?? { result, version: 0 } : { result, version: 0 };
}

export function clearAsyncLiveResults(): void {
	liveSnapshots.clear();
}
