const DISPLAY_TAB = "    ";
const CONTROL_CHARACTER_PATTERN =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export const AnalysisStatus = {
	complete: "complete",
	incomplete: "incomplete",
	error: "error",
} as const;

export type AnalysisStatus =
	(typeof AnalysisStatus)[keyof typeof AnalysisStatus];

export const AnalysisSource = {
	static: "static",
	model: "model",
} as const;

export type AnalysisSource =
	(typeof AnalysisSource)[keyof typeof AnalysisSource];

export interface RmCommandDetail {
	command: string;
	arguments: string[];
}

export interface RmCommandGroup {
	command: string;
	rmCommands: RmCommandDetail[];
	source: AnalysisSource;
	start?: number;
	end?: number;
}

export interface AnalysisDiagnostic {
	message: string;
	line?: number;
	column?: number;
}

export interface StaticAnalysisResult {
	protocolVersion: number;
	status: AnalysisStatus;
	hasRmEvidence: boolean;
	groups: RmCommandGroup[];
	diagnostics: AnalysisDiagnostic[];
}

/** 将终端控制字符转为可见文本，避免命令内容改变确认面板布局。 */
export function sanitizeTerminalText(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/\t/g, DISPLAY_TAB)
		.replace(CONTROL_CHARACTER_PATTERN, (character) => {
			const codePoint = character.codePointAt(0);
			return codePoint === undefined
				? ""
				: `\\x${codePoint.toString(16).padStart(2, "0")}`;
		});
}

export function utf8ByteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function truncateUtf8(text: string, maxBytes: number): string {
	if (utf8ByteLength(text) <= maxBytes) return text;

	const buffer = Buffer.from(text, "utf8");
	let end = maxBytes;
	while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
	return buffer.subarray(0, end).toString("utf8");
}
