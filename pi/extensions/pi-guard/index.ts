/**
 * Block rm Extension
 *
 * 拦截 Bash 工具中包含独立命令词 `rm` 的调用,弹窗让用户确认是否放行。
 * 匹配 `\brm\b`,覆盖 `rm -rf`、`sudo rm`、`/bin/rm`、`&& rm` 等场景,
 * 不会误伤 `npm`、`mkdir`、`chrm` 等含子串的命令。
 * 无 UI 环境(如 print 模式)下默认阻止执行。
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { extractRmCommands } from "./rm-command.ts";
import { confirmRmExecution } from "./rm-confirmation.ts";

export const PI_GUARD_CONFIRMATION_REQUIRED_EVENT =
	"pi-guard:confirmation-required";

export interface PiGuardConfirmationRequiredPayload {
	cwd: string;
	mode: ExtensionContext["mode"];
}

const RM_PATTERN = /\brm\b/;
const RM_COMMAND_FALLBACK = "rm";

export default function (pi: ExtensionAPI) {

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		const command = event.input.command;
		if (!RM_PATTERN.test(command)) return;

		if (!ctx.hasUI) {
			return { block: true, reason: "含 rm 命令,当前无 UI 无法确认,默认拦截" };
		}

		const confirmationRequest: PiGuardConfirmationRequiredPayload = {
			cwd: ctx.cwd,
			mode: ctx.mode,
		};
		pi.events.emit(PI_GUARD_CONFIRMATION_REQUIRED_EVENT, confirmationRequest);

		const extractedCommands = extractRmCommands(command);
		const ok = await confirmRmExecution(ctx.ui, {
			commands:
				extractedCommands.length > 0
					? extractedCommands
					: [RM_COMMAND_FALLBACK],
			extractionIncomplete: extractedCommands.length === 0,
		});

		if (!ok) {
			return { block: true, reason: "用户拒绝执行 rm 命令" };
		}
	});
}
