/**
 * pi-guard
 *
 * 在内置 Bash 工具的 tool_call 阶段分析 rm 操作；静态分析不完整时调用
 * 当前会话或用户配置的模型，最终由确认面板决定是否放行。
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { RmGuardAnalyzer } from "./rm-analysis.ts";
import {
	confirmRmExecution,
	prepareRmConfirmation,
} from "./rm-confirmation.ts";

export const PI_GUARD_CONFIRMATION_REQUIRED_EVENT =
	"pi-guard:confirmation-required";

export interface PiGuardConfirmationRequiredPayload {
	cwd: string;
	mode: ExtensionContext["mode"];
}

const BLOCK_REASON_NO_UI = "检测到 rm 操作，当前无 UI 无法确认，已拦截";
const BLOCK_REASON_USER_REJECTED = "用户拒绝执行包含 rm 的命令";
const BLOCK_REASON_ANALYSIS_ABORTED = "rm 分析已取消，命令已拦截";
const BLOCK_REASON_UNEXPECTED_FAILURE = "pi-guard 分析异常，命令已拦截";
const BLOCK_REASON_UI_FAILURE = "rm 确认界面异常，命令已拦截";

export default function (pi: ExtensionAPI) {
	const analyzer = new RmGuardAnalyzer();

	pi.on("session_start", async (_event, ctx) => {
		await analyzer.initialize(ctx);
	});

	pi.on("session_shutdown", () => {
		analyzer.shutdown();
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		let outcome;
		try {
			outcome = await analyzer.analyze(event.input.command, ctx);
		} catch (error) {
			console.error(`pi-guard 分析异常: ${formatError(error)}`);
			return { block: true, reason: BLOCK_REASON_UNEXPECTED_FAILURE };
		}
		if (outcome.kind === "allow") return;
		if (outcome.kind === "analysis_failed" && outcome.aborted) {
			return { block: true, reason: BLOCK_REASON_ANALYSIS_ABORTED };
		}
		if (!ctx.hasUI) {
			return { block: true, reason: BLOCK_REASON_NO_UI };
		}

		const groups =
			outcome.kind === "rm_found" ? outcome.groups : outcome.staticGroups;
		const preparation = prepareRmConfirmation(
			groups,
			outcome.kind === "analysis_failed",
		);
		if (preparation.kind === "too_large") {
			return { block: true, reason: preparation.reason };
		}

		const confirmationRequest: PiGuardConfirmationRequiredPayload = {
			cwd: ctx.cwd,
			mode: ctx.mode,
		};
		pi.events.emit(PI_GUARD_CONFIRMATION_REQUIRED_EVENT, confirmationRequest);

		let confirmed: boolean;
		try {
			confirmed = await confirmRmExecution(ctx.ui, preparation.options);
		} catch (error) {
			console.error(`pi-guard 确认界面失败: ${formatError(error)}`);
			return { block: true, reason: BLOCK_REASON_UI_FAILURE };
		}
		if (!confirmed) {
			return { block: true, reason: BLOCK_REASON_USER_REJECTED };
		}
	});
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
