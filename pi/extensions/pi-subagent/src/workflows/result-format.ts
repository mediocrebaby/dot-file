import type { Details } from "../shared/types.ts";

type WorkflowResult = NonNullable<Details["workflow"]>;

export function formatWorkflowValue(value: unknown): string {
	if (value === undefined) return "(undefined)";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function formatWorkflowTrace(workflow: WorkflowResult, includeDuration: boolean): string[] {
	return workflow.trace.map((entry) => `- ${entry.operation} ${entry.key}: ${entry.state}${entry.runId ? ` (${entry.runId})` : ""}${includeDuration && entry.durationMs !== undefined ? ` in ${entry.durationMs}ms` : ""}${entry.error ? ` — ${entry.error}` : ""}`);
}

function appendWorkflowDiagnostics(sections: string[], workflow: WorkflowResult, includeDuration: boolean): void {
	if (workflow.emits.length > 0) sections.push(`Emitted:\n${workflow.emits.map(formatWorkflowValue).join("\n")}`);
	if (workflow.console.length > 0) sections.push(`Console:\n${workflow.console.map((entry) => `[${entry.level}] ${entry.text}`).join("\n")}`);
	const traceLines = formatWorkflowTrace(workflow, includeDuration);
	if (traceLines.length > 0) sections.push(`Call trace:\n${traceLines.join("\n")}`);
}

export function formatWorkflowCompletionContent(workflow: WorkflowResult): string {
	const sections = ["Workflow completed.", `Return:\n${formatWorkflowValue(workflow.value)}`];
	appendWorkflowDiagnostics(sections, workflow, true);
	return sections.join("\n\n");
}

export function formatWorkflowTerminalContent(label: string, message: string, workflow: WorkflowResult): string {
	const sections = [`${label}: ${message}`];
	appendWorkflowDiagnostics(sections, workflow, false);
	return sections.join("\n\n");
}
