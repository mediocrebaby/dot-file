import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { SubagentParamsLike } from "../runs/foreground/subagent-executor.ts";
import type { SlashSubagentResponse, SlashSubagentUpdate } from "./slash-bridge.ts";
import {
	buildAsyncCompletionResult,
	getAsyncRenderableSnapshot,
	resolveAsyncCompletionRunId,
	type AsyncCompletionPayload,
} from "../runs/background/async-live-state.ts";
import { type Details, type SingleResult, type Usage, SLASH_RESULT_TYPE } from "../shared/types.ts";

export interface SlashMessageDetails {
	requestId: string;
	result: AgentToolResult<Details>;
}

interface SlashSnapshot {
	result: AgentToolResult<Details>;
	version: number;
}

interface SequentialChainStepLike {
	agent: string;
	task?: string;
}

interface ParallelChainStepLike {
	parallel: Array<{ agent: string; task?: string }>;
}

type ChainStepLike = SequentialChainStepLike | ParallelChainStepLike;

const liveSnapshots = new Map<string, SlashSnapshot>();
const finalSnapshots = new Map<string, SlashSnapshot>();
const asyncRequestIds = new Map<string, Set<string>>();
let versionCounter = 1;

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	turns: 0,
};

function nextVersion(): number {
	return versionCounter++;
}

function cloneUsage(): Usage {
	return { ...EMPTY_USAGE };
}

function createPlaceholderResult(
	agent: string,
	task: string,
	status: "pending" | "running",
	index: number,
): SingleResult {
	return {
		agent,
		task,
		index,
		exitCode: 0,
		messages: EMPTY_MESSAGES,
		usage: cloneUsage(),
		progress: {
			index,
			agent,
			status,
			task,
			recentTools: [],
			recentOutput: [],
			toolCount: 0,
			tokens: 0,
			durationMs: 0,
		},
	};
}

function buildParallelInitialResult(params: SubagentParamsLike): AgentToolResult<Details> {
	const tasks = params.tasks ?? [];
	return {
		content: [{ type: "text", text: tasks.map((task) => `${task.agent}: ${task.task}`).join("\n\n") }],
		details: {
			mode: "parallel",
			...(params.context ? { context: params.context } : {}),
			results: tasks.map((task, index) => createPlaceholderResult(task.agent, task.task, "running", index)),
			progress: tasks.map((task, index) => ({
				index,
				agent: task.agent,
				status: "running" as const,
				task: task.task,
				recentTools: [],
				recentOutput: [],
				toolCount: 0,
				tokens: 0,
				durationMs: 0,
			})),
		},
	};
}

function isParallelChainStep(step: ChainStepLike): step is ParallelChainStepLike {
	return "parallel" in step && Array.isArray(step.parallel);
}

function chainStepLabel(step: ChainStepLike): string {
	if (isParallelChainStep(step)) {
		return `[${step.parallel.map((entry) => entry.agent).join("+")}]`;
	}
	return step.agent;
}

function flattenChainResults(chain: ChainStepLike[], fallbackTask: string | undefined): SingleResult[] {
	const results: SingleResult[] = [];
	let flatIndex = 0;
	for (const step of chain) {
		if (isParallelChainStep(step)) {
			for (const task of step.parallel) {
				results.push(createPlaceholderResult(task.agent, task.task ?? fallbackTask ?? "", results.length === 0 ? "running" : "pending", flatIndex));
				flatIndex++;
			}
			continue;
		}
		results.push(createPlaceholderResult(step.agent, step.task ?? fallbackTask ?? "", results.length === 0 ? "running" : "pending", flatIndex));
		flatIndex++;
	}
	return results;
}

function buildChainInitialResult(params: SubagentParamsLike): AgentToolResult<Details> {
	const chain = (params.chain ?? []) as ChainStepLike[];
	const results = flattenChainResults(chain, params.task);
	return {
		content: [{
			type: "text",
			text: results.map((result, index) => `Step ${index + 1}: ${result.agent}\n${result.task}`).join("\n\n"),
		}],
		details: {
			mode: "chain",
			...(params.context ? { context: params.context } : {}),
			results,
			progress: results.map((result, index) => ({
				index,
				agent: result.agent,
				status: index === 0 ? "running" as const : "pending" as const,
				task: result.task,
				recentTools: [],
				recentOutput: [],
				toolCount: 0,
				tokens: 0,
				durationMs: 0,
			})),
			chainAgents: chain.map((step) => chainStepLabel(step)),
			totalSteps: chain.length,
			currentStepIndex: 0,
		},
	};
}

function buildWorkflowInitialResult(): AgentToolResult<Details> {
	return {
		content: [{ type: "text", text: "Workflow running." }],
		details: {
			mode: "workflow",
			results: [],
			workflow: { trace: [], emits: [], console: [] },
		},
	};
}

function buildSingleInitialResult(params: SubagentParamsLike): AgentToolResult<Details> {
	const agent = params.agent ?? "subagent";
	const task = params.task ?? "";
	return {
		content: [{ type: "text", text: task }],
		details: {
			mode: "single",
			...(params.context ? { context: params.context } : {}),
			results: [createPlaceholderResult(agent, task, "running", 0)],
			progress: [{
				index: 0,
				agent,
				status: "running",
				task,
				recentTools: [],
				recentOutput: [],
				toolCount: 0,
				tokens: 0,
				durationMs: 0,
			}],
		},
	};
}

export function buildSlashInitialResult(requestId: string, params: SubagentParamsLike): SlashMessageDetails {
	const result = params.workflowScript !== undefined
		? buildWorkflowInitialResult()
		: (params.tasks?.length ?? 0) > 0
			? buildParallelInitialResult(params)
			: (params.chain?.length ?? 0) > 0
				? buildChainInitialResult(params)
				: buildSingleInitialResult(params);
	liveSnapshots.set(requestId, { result, version: nextVersion() });
	finalSnapshots.delete(requestId);
	return { requestId, result };
}

function cloneResultsWithProgress(
	results: SingleResult[],
	progress: NonNullable<Details["progress"]> | undefined,
): SingleResult[] {
	return results.map((result, index) => {
		const nextProgress = progress?.find((entry) => entry.index === index
			|| (entry.index === undefined && entry.agent === result.agent))
			?? result.progress;
		return nextProgress ? { ...result, progress: nextProgress } : result;
	});
}

export function applySlashUpdate(requestId: string, update: SlashSubagentUpdate): void {
	const snapshot = liveSnapshots.get(requestId);
	if (!snapshot) return;
	const progress = update.progress;
	if (!progress || !snapshot.result.details) return;
	const currentStepIndex = progress.findIndex((entry) => entry.status === "running");
	const nextDetails: Details = {
		...snapshot.result.details,
		progress,
		results: cloneResultsWithProgress(snapshot.result.details.results, progress),
		...(snapshot.result.details.mode === "chain" && currentStepIndex >= 0 ? { currentStepIndex } : {}),
	};
	liveSnapshots.set(requestId, {
		result: {
			...snapshot.result,
			details: nextDetails,
		},
		version: nextVersion(),
	});
}

function mergeAsyncStartResult(
	current: AgentToolResult<Details> | undefined,
	started: AgentToolResult<Details>,
): AgentToolResult<Details> {
	if (!current || started.details.results.length > 0) return started;
	return {
		...started,
		details: {
			...current.details,
			...started.details,
			results: current.details.results,
			...(current.details.progress ? { progress: current.details.progress } : {}),
			...(current.details.workflow && !started.details.workflow ? { workflow: current.details.workflow } : {}),
		},
	};
}

function isAsyncTerminalResult(result: AgentToolResult<Details>): boolean {
	if (result.details.mode === "workflow") return result.details.workflow?.terminalState !== undefined;
	return result.details.results.length > 0
		&& result.details.results.every((entry) => entry.progress?.status !== "running" && entry.progress?.status !== "pending");
}

function linkAsyncRequest(asyncId: string, requestId: string): void {
	const requestIds = asyncRequestIds.get(asyncId) ?? new Set<string>();
	requestIds.add(requestId);
	asyncRequestIds.set(asyncId, requestIds);
}

export function finalizeSlashResult(response: SlashSubagentResponse): SlashMessageDetails {
	const asyncId = response.result.details.asyncId;
	if (asyncId && !response.isError) {
		const projected = getAsyncRenderableSnapshot(response.result).result;
		if (projected !== response.result && isAsyncTerminalResult(projected)) {
			finalSnapshots.set(response.requestId, { result: projected, version: nextVersion() });
			liveSnapshots.delete(response.requestId);
			return { requestId: response.requestId, result: projected };
		}
		const result = mergeAsyncStartResult(liveSnapshots.get(response.requestId)?.result, response.result);
		liveSnapshots.set(response.requestId, { result, version: nextVersion() });
		linkAsyncRequest(asyncId, response.requestId);
		return { requestId: response.requestId, result };
	}
	const snapshot = {
		result: response.result,
		version: nextVersion(),
	};
	finalSnapshots.set(response.requestId, snapshot);
	liveSnapshots.delete(response.requestId);
	return {
		requestId: response.requestId,
		result: response.result,
	};
}

export function applySlashAsyncCompletion(payload: AsyncCompletionPayload): boolean {
	const asyncId = resolveAsyncCompletionRunId(payload);
	if (!asyncId) return false;
	const requestIds = asyncRequestIds.get(asyncId);
	if (!requestIds?.size) return false;
	let changed = false;
	for (const requestId of requestIds) {
		const current = liveSnapshots.get(requestId)?.result;
		const result = buildAsyncCompletionResult(payload, current);
		if (!result) continue;
		finalSnapshots.set(requestId, { result, version: nextVersion() });
		liveSnapshots.delete(requestId);
		changed = true;
	}
	asyncRequestIds.delete(asyncId);
	return changed;
}

export function failSlashResult(requestId: string, params: SubagentParamsLike, message: string): SlashMessageDetails {
	const initial = buildSlashInitialResult(requestId, params).result;
	const failedResults = initial.details.results.map((result) => ({
		...result,
		exitCode: 1,
		error: message,
		progress: result.progress ? { ...result.progress, status: "failed" as const } : result.progress,
	}));
	const result: AgentToolResult<Details> = {
		content: [{ type: "text", text: message }],
		details: {
			...initial.details,
			results: failedResults,
			progress: failedResults.map((entry) => entry.progress!).filter(Boolean),
		},
	};
	const snapshot = { result, version: nextVersion() };
	finalSnapshots.set(requestId, snapshot);
	liveSnapshots.delete(requestId);
	return { requestId, result };
}

function isSlashMessageDetails(value: unknown): value is SlashMessageDetails {
	if (!value || typeof value !== "object") return false;
	const v = value as { requestId?: string; result?: { content?: unknown; details?: { results?: unknown } } };
	if (typeof v.requestId !== "string" || !v.requestId) return false;
	if (!v.result || !Array.isArray(v.result.content)) return false;
	return !!v.result.details && Array.isArray(v.result.details.results);
}

export function resolveSlashMessageDetails(value: unknown): SlashMessageDetails | undefined {
	return isSlashMessageDetails(value) ? value : undefined;
}

export function getSlashRenderableSnapshot(details: SlashMessageDetails): SlashSnapshot {
	return finalSnapshots.get(details.requestId)
		?? liveSnapshots.get(details.requestId)
		?? { result: details.result, version: 0 };
}

export function restoreSlashFinalSnapshots(entries: unknown[]): void {
	liveSnapshots.clear();
	finalSnapshots.clear();
	asyncRequestIds.clear();
	for (const entry of entries) {
		const e = entry as { type?: string; customType?: string; details?: unknown };
		if (e?.type !== "custom_message" || e.customType !== SLASH_RESULT_TYPE) continue;
		const details = resolveSlashMessageDetails(e.details);
		if (!details) continue;
		finalSnapshots.set(details.requestId, { result: details.result, version: nextVersion() });
	}
}

export function clearSlashSnapshots(): void {
	liveSnapshots.clear();
	finalSnapshots.clear();
	asyncRequestIds.clear();
}
