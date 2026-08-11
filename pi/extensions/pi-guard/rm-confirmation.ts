import type {
	ExtensionUIContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type KeybindingsManager,
	type TUI,
} from "@earendil-works/pi-tui";

import { sanitizeTerminalText } from "./rm-command.ts";

const PANEL_WIDTH = 84;
const PANEL_MARGIN = 1;
const FRAME_WIDTH = 2;
const CONTENT_HORIZONTAL_PADDING = 2;
const CODE_FRAME_WIDTH = 2;
const CODE_HORIZONTAL_PADDING = 2;
const MIN_TEXT_WIDTH = 1;

interface ConfirmationOption {
	label: string;
	description: string;
	result: boolean;
}

const CONFIRMATION_OPTIONS: readonly ConfirmationOption[] = [
	{ label: "Yes", description: "允许执行", result: true },
	{ label: "No", description: "拦截执行", result: false },
];

export interface RmConfirmationOptions {
	commands: string[];
	extractionIncomplete: boolean;
}

export async function confirmRmExecution(
	ui: ExtensionUIContext,
	options: RmConfirmationOptions,
): Promise<boolean> {
	return ui.custom<boolean>(
		(tui, theme, keybindings, done) =>
			new RmConfirmationComponent(
				tui,
				theme,
				keybindings,
				options,
				done,
			),
		{
			overlay: true,
			overlayOptions: {
				width: PANEL_WIDTH,
				anchor: "center",
				margin: PANEL_MARGIN,
			},
		},
	);
}

class RmConfirmationComponent implements Component {
	private selectedIndex = 0;
	private completed = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly options: RmConfirmationOptions,
		private readonly done: (result: boolean) => void,
	) {}

	render(width: number): string[] {
		const panelWidth = Math.max(MIN_TEXT_WIDTH, width);
		const contentWidth = Math.max(
			MIN_TEXT_WIDTH,
			panelWidth - FRAME_WIDTH - CONTENT_HORIZONTAL_PADDING,
		);
		const lines: string[] = [this.renderBorder("top", panelWidth)];

		lines.push(
			...this.renderWrappedRows(
				this.theme.fg(
					"warning",
					this.theme.bold("⚠ 删除命令确认"),
				),
				contentWidth,
			),
			...this.renderWrappedRows(
				this.theme.fg(
					"muted",
					"检测到可能造成数据丢失的 rm 命令，请确认是否执行。",
				),
				contentWidth,
			),
			this.renderEmptyRow(contentWidth),
			this.renderRow(
				this.theme.fg(
					"text",
					`即将执行 ${this.options.commands.length} 条 rm 命令`,
				),
				contentWidth,
			),
		);

		if (this.options.extractionIncomplete) {
			lines.push(
				...this.renderWrappedRows(
					this.theme.fg(
						"warning",
						"未能安全提取完整参数，仅显示检测到的 rm 命令名。",
					),
					contentWidth,
				),
			);
		}

		lines.push(
			...this.renderCommandBox(contentWidth),
			this.renderEmptyRow(contentWidth),
			...CONFIRMATION_OPTIONS.map((option, index) =>
				this.renderOption(option, index, contentWidth),
			),
			this.renderEmptyRow(contentWidth),
			...this.renderWrappedRows(
				this.theme.fg(
					"dim",
					"↑/↓ 选择 · Enter 确认 · Esc 拦截",
				),
				contentWidth,
			),
			this.renderBorder("bottom", panelWidth),
		);

		return lines;
	}

	invalidate(): void {}

	handleInput(keyData: string): void {
		if (this.completed) return;

		if (this.keybindings.matches(keyData, "tui.select.up")) {
			this.updateSelection(-1);
			return;
		}
		if (this.keybindings.matches(keyData, "tui.select.down")) {
			this.updateSelection(1);
			return;
		}
		if (
			this.keybindings.matches(keyData, "tui.select.confirm") ||
			keyData === "\n"
		) {
			this.complete(CONFIRMATION_OPTIONS[this.selectedIndex]!.result);
			return;
		}
		if (this.keybindings.matches(keyData, "tui.select.cancel")) {
			this.complete(false);
		}
	}

	private updateSelection(direction: -1 | 1): void {
		const lastIndex = CONFIRMATION_OPTIONS.length - 1;
		const nextIndex = Math.max(
			0,
			Math.min(lastIndex, this.selectedIndex + direction),
		);
		if (nextIndex === this.selectedIndex) return;

		this.selectedIndex = nextIndex;
		this.tui.requestRender();
	}

	private complete(result: boolean): void {
		this.completed = true;
		this.done(result);
	}

	private renderCommandBox(contentWidth: number): string[] {
		const boxInnerWidth = Math.max(
			MIN_TEXT_WIDTH,
			contentWidth - CODE_FRAME_WIDTH,
		);
		const commandTextWidth = Math.max(
			MIN_TEXT_WIDTH,
			boxInnerWidth - CODE_HORIZONTAL_PADDING,
		);
		const borderColor = (text: string) =>
			this.theme.fg("borderMuted", text);
		const lines = [
			this.renderRow(
				borderColor(`┌${"─".repeat(boxInnerWidth)}┐`),
				contentWidth,
			),
		];

		for (const [index, command] of this.options.commands.entries()) {
			const prefix =
				this.options.commands.length > 1 ? `${index + 1}. ` : "";
			const safeCommand = sanitizeTerminalText(command);
			const wrappedLines = safeCommand
				.split("\n")
				.flatMap((sourceLine, lineIndex) => {
					const linePrefix = lineIndex === 0 ? prefix : "";
					const styledLine = `${this.theme.fg("muted", linePrefix)}${this.theme.fg("mdCode", sourceLine)}`;
					const wrapped = wrapTextWithAnsi(styledLine, commandTextWidth);
					return wrapped.length > 0 ? wrapped : [""];
				});

			if (index > 0) {
				lines.push(
					this.renderRow(
						`${borderColor("│")} ${" ".repeat(commandTextWidth)} ${borderColor("│")}`,
						contentWidth,
					),
				);
			}

			for (const wrappedLine of wrappedLines) {
				lines.push(
					this.renderRow(
						`${borderColor("│")} ${padVisible(wrappedLine, commandTextWidth)} ${borderColor("│")}`,
						contentWidth,
					),
				);
			}
		}

		lines.push(
			this.renderRow(
				borderColor(`└${"─".repeat(boxInnerWidth)}┘`),
				contentWidth,
			),
		);
		return lines;
	}

	private renderOption(
		option: ConfirmationOption,
		index: number,
		contentWidth: number,
	): string {
		const selected = index === this.selectedIndex;
		const marker = selected ? "›" : " ";
		const plainText = ` ${marker} ${option.label}  ${option.description}`;
		const paddedText = padVisible(plainText, contentWidth);
		const styledText = selected
			? this.theme.bg(
					"selectedBg",
					this.theme.fg("accent", this.theme.bold(paddedText)),
				)
			: `${this.theme.fg("text", `   ${option.label}`)}${this.theme.fg("dim", `  ${option.description}`)}`;
		return this.renderRow(styledText, contentWidth);
	}

	private renderWrappedRows(text: string, contentWidth: number): string[] {
		return wrapPreservingNewlines(text, contentWidth).map((line) =>
			this.renderRow(line, contentWidth),
		);
	}

	private renderEmptyRow(contentWidth: number): string {
		return this.renderRow("", contentWidth);
	}

	private renderRow(content: string, contentWidth: number): string {
		const fittedContent = padVisible(
			truncateToWidth(content, contentWidth),
			contentWidth,
		);
		return `${this.theme.fg("warning", "│")} ${fittedContent} ${this.theme.fg("warning", "│")}`;
	}

	private renderBorder(position: "top" | "bottom", width: number): string {
		const innerWidth = Math.max(MIN_TEXT_WIDTH, width - FRAME_WIDTH);
		const [leftCorner, rightCorner] =
			position === "top" ? ["╭", "╮"] : ["╰", "╯"];
		return this.theme.fg(
			"warning",
			`${leftCorner}${"─".repeat(innerWidth)}${rightCorner}`,
		);
	}
}

function wrapPreservingNewlines(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const sourceLine of text.split("\n")) {
		const wrapped = wrapTextWithAnsi(sourceLine, width);
		lines.push(...(wrapped.length > 0 ? wrapped : [""]));
	}
	return lines.length > 0 ? lines : [""];
}

function padVisible(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}
