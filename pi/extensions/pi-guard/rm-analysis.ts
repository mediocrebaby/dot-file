import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadPiGuardConfig, type PiGuardConfig } from "./config.ts";
import { HelperClient } from "./helper-client.ts";
import { ModelAnalyzer } from "./model-analysis.ts";
import {
	AnalysisStatus,
	type RmCommandGroup,
	type StaticAnalysisResult,
} from "./rm-command.ts";

export type GuardAnalysisOutcome =
	| { kind: "allow" }
	| { kind: "rm_found"; groups: RmCommandGroup[] }
	| {
			kind: "analysis_failed";
			staticGroups: RmCommandGroup[];
			reason: string;
			aborted: boolean;
	  };

export class RmGuardAnalyzer {
	private readonly helper = new HelperClient();
	private readonly model = new ModelAnalyzer();
	private config: PiGuardConfig = {};
	private initialized = false;

	async initialize(ctx: ExtensionContext): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		const loadedConfig = loadPiGuardConfig();
		this.config = loadedConfig.config;
		if (loadedConfig.error) console.error(loadedConfig.error);
		await this.helper.initialize(ctx.signal);
	}

	async analyze(
		command: string,
		ctx: ExtensionContext,
	): Promise<GuardAnalysisOutcome> {
		let staticResult: StaticAnalysisResult;
		try {
			staticResult = await this.helper.analyze(command, ctx.signal);
		} catch (error) {
			staticResult = {
				protocolVersion: 0,
				status: AnalysisStatus.error,
				hasRmEvidence: false,
				groups: [],
				diagnostics: [{ message: formatError(error) }],
			};
		}

		if (
			staticResult.status === AnalysisStatus.complete &&
			!staticResult.hasRmEvidence &&
			staticResult.groups.length === 0
		) {
			return { kind: "allow" };
		}
		if (
			staticResult.status === AnalysisStatus.complete &&
			staticResult.groups.length > 0
		) {
			return { kind: "rm_found", groups: staticResult.groups };
		}

		const modelResult = await this.model.analyze(
			command,
			ctx,
			this.config.model,
		);
		switch (modelResult.kind) {
			case "no_rm":
				return { kind: "allow" };
			case "rm_found":
				return { kind: "rm_found", groups: modelResult.groups };
			case "unknown":
				return {
					kind: "analysis_failed",
					staticGroups: staticResult.groups,
					reason: modelResult.reason,
					aborted: false,
				};
			case "failure":
				return {
					kind: "analysis_failed",
					staticGroups: staticResult.groups,
					reason: modelResult.reason,
					aborted: modelResult.aborted,
				};
		}
	}

	shutdown(): void {
		this.helper.shutdown();
		this.model.shutdown();
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
