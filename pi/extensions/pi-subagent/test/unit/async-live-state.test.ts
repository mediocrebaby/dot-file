import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	applyAsyncCompletion,
	buildAsyncCompletionResult,
	clearAsyncLiveResults,
	getAsyncRenderableSnapshot,
	trackAsyncLiveResult,
} from "../../src/runs/background/async-live-state.ts";
import { renderSubagentResult } from "../../src/tui/render.ts";
import type { Details, SingleResult } from "../../src/shared/types.ts";

const theme = {
	fg(_name: string, text: string): string { return text; },
	bold(text: string): string { return text; },
};

function componentText(component: unknown): string {
	if (typeof component !== "object" || component === null) return "";
	if ("text" in component && typeof component.text === "string") return component.text;
	if ("children" in component && Array.isArray(component.children)) {
		return component.children.map(componentText).filter(Boolean).join("\n");
	}
	return "";
}

function runningSingleResult(runId: string): { content: Array<{ type: "text"; text: string }>; details: Details } {
	const result: SingleResult = {
		index: 0,
		agent: "explorer",
		task: "inspect status flow",
		exitCode: 0,
		messages: [],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		progress: {
			index: 0,
			agent: "explorer",
			status: "running",
			task: "inspect status flow",
			recentTools: [],
			recentOutput: [],
			toolCount: 2,
			tokens: 120,
			durationMs: 400,
		},
	};
	return {
		content: [{ type: "text", text: "Async run started." }],
		details: { mode: "single", runId, asyncId: runId, results: [result], progress: [result.progress!] },
	};
}

describe("async live result projection", () => {
	it("replaces a running workflow card with the final value and call trace", () => {
		clearAsyncLiveResults();
		const initial = {
			content: [{ type: "text" as const, text: "Workflow running." }],
			details: {
				mode: "workflow" as const,
				runId: "workflow-1",
				asyncId: "workflow-1",
				results: [],
				chatProgress: { mode: "live-card" as const, repoRelation: "same" as const, repoLabel: "pi-subagents" },
				workflow: { trace: [], emits: [], console: [] },
			},
		};
		trackAsyncLiveResult(initial);

		assert.equal(applyAsyncCompletion({
			runId: "workflow-1",
			mode: "workflow",
			state: "complete",
			success: true,
			summary: "workflow done",
			workflow: {
				value: "final answer",
				trace: [{ operation: "run", key: "scan", state: "completed", runId: "child-1", durationMs: 25 }],
				emits: ["artifact ready"],
				console: [{ level: "info", text: "validated" }],
			},
			results: [{ agent: "explorer", output: "child result", success: true }],
		}), true);

		const snapshot = getAsyncRenderableSnapshot(initial);
		assert.equal(snapshot.result.details.workflow?.terminalState, "complete");
		assert.equal(snapshot.result.details.workflow?.value, "final answer");
		assert.equal(snapshot.result.details.results[0]?.progress?.status, "completed");
		const text = componentText(renderSubagentResult(snapshot.result, { expanded: true }, theme as never));
		assert.match(text, /Workflow completed/);
		assert.match(text, /final answer/);
		assert.match(text, /Call trace/);
		assert.match(text, /run scan: completed/);
		assert.doesNotMatch(text, /waiting for workflow child launches/);
	});

	it("projects failed and stopped terminal states without leaving running progress", () => {
		clearAsyncLiveResults();
		const failedInitial = runningSingleResult("failed-1");
		trackAsyncLiveResult(failedInitial);
		applyAsyncCompletion({
			runId: "failed-1",
			mode: "single",
			state: "failed",
			success: false,
			error: "child crashed",
			results: [{ agent: "explorer", output: "partial output", error: "child crashed", success: false, exitCode: 1 }],
		});
		const failed = getAsyncRenderableSnapshot(failedInitial).result;
		assert.equal(failed.isError, true);
		assert.equal(failed.details.results[0]?.progress?.status, "failed");
		assert.equal(failed.details.results[0]?.finalOutput, "partial output");

		clearAsyncLiveResults();
		const stoppedInitial = runningSingleResult("stopped-1");
		trackAsyncLiveResult(stoppedInitial);
		applyAsyncCompletion({
			runId: "stopped-1",
			mode: "single",
			state: "stopped",
			stopped: true,
			summary: "Stopped by user.",
			results: [{ agent: "explorer", output: "Stopped by user.", stopped: true, status: "stopped" }],
		});
		const stopped = getAsyncRenderableSnapshot(stoppedInitial).result;
		assert.equal(stopped.isError, undefined);
		assert.equal(stopped.details.stopped, true);
		assert.equal(stopped.details.results[0]?.stopped, true);
		assert.equal(stopped.details.results[0]?.progress?.status, "detached");
	});

	it("retains an early completion until the matching async result is tracked", () => {
		clearAsyncLiveResults();
		assert.equal(applyAsyncCompletion({
			runId: "early-completion",
			state: "complete",
			success: true,
			results: [{ agent: "explorer", output: "finished before render", success: true }],
		}), false);
		const initial = runningSingleResult("early-completion");
		trackAsyncLiveResult(initial);
		const completed = getAsyncRenderableSnapshot(initial).result;
		assert.equal(completed.details.results[0]?.progress?.status, "completed");
		assert.equal(completed.details.results[0]?.finalOutput, "finished before render");
		assert.ok(buildAsyncCompletionResult({ runId: "standalone", state: "complete", success: true }));
	});
});
