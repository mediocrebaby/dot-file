const RM_EXECUTABLE_NAME = "rm";
const MAX_NESTED_SHELL_DEPTH = 16;
const DISPLAY_TAB = "    ";
const CONTROL_CHARACTER_PATTERN =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

type Quote = "single" | "double" | null;

interface RmCommandMatch {
	start: number;
	command: string;
}

interface NestedShellBody {
	bodyStart: number;
	end: number;
}

/**
 * 提取复合 Shell 输入中包含 `rm` 可执行文件名的子命令。
 * 这里只生成确认框文案，不改变入口中原有的拦截范围。
 */
export function extractRmCommands(command: string): string[] {
	return scanShell(command, 0, 0)
		.sort((left, right) => left.start - right.start)
		.map((match) => match.command);
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

function scanShell(
	command: string,
	offset: number,
	depth: number,
): RmCommandMatch[] {
	const matches: RmCommandMatch[] = [];
	let segmentStart = 0;
	let quote: Quote = null;
	let escaped = false;

	const collectSegment = (end: number) => {
		const segment = command.slice(segmentStart, end);
		const rmStart = findRmWordStart(segment);
		if (rmStart === -1) return;

		const extracted = segment.slice(rmStart).trim();
		if (!extracted) return;
		matches.push({ start: offset + segmentStart + rmStart, command: extracted });
	};

	for (let index = 0; index < command.length; index++) {
		const character = command[index]!;

		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote !== "single" && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote === "single") {
			if (character === "'") quote = null;
			continue;
		}
		if (quote === "double" && character === '"') {
			quote = null;
			continue;
		}
		if (quote === null && character === "'") {
			quote = "single";
			continue;
		}
		if (quote === null && character === '"') {
			quote = "double";
			continue;
		}

		const nested = readNestedShellBody(command, index);
		if (nested) {
			if (depth < MAX_NESTED_SHELL_DEPTH) {
				matches.push(
					...scanShell(
						command.slice(nested.bodyStart, nested.end),
						offset + nested.bodyStart,
						depth + 1,
					),
				);
			}
			index = nested.end;
			continue;
		}

		if (quote === "double") continue;

		if (character === "#" && isShellCommentStart(command, index)) {
			collectSegment(index);
			const newlineIndex = command.indexOf("\n", index);
			if (newlineIndex === -1) {
				segmentStart = command.length;
				break;
			}
			segmentStart = newlineIndex + 1;
			index = newlineIndex;
			continue;
		}

		const operatorLength = getControlOperatorLength(command, index);
		if (operatorLength === 0) continue;

		collectSegment(index);
		segmentStart = index + operatorLength;
		index += operatorLength - 1;
	}

	if (segmentStart < command.length) collectSegment(command.length);
	return matches;
}

function findRmWordStart(segment: string): number {
	let wordStart: number | null = null;
	let wordValue = "";
	let quote: Quote = null;
	let escaped = false;

	const finishWord = (): number => {
		if (wordStart === null) return -1;
		const executableName = wordValue.split("/").at(-1);
		const matchStart = executableName === RM_EXECUTABLE_NAME ? wordStart : -1;
		wordStart = null;
		wordValue = "";
		return matchStart;
	};

	for (let index = 0; index <= segment.length; index++) {
		const character = segment[index];

		if (index === segment.length || (quote === null && /\s/.test(character!))) {
			const matchStart = finishWord();
			if (matchStart !== -1) return matchStart;
			continue;
		}
		if (wordStart === null) wordStart = index;
		if (escaped) {
			wordValue += character;
			escaped = false;
			continue;
		}
		if (quote !== "single" && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote === "single") {
			if (character === "'") quote = null;
			else wordValue += character;
			continue;
		}
		if (quote === "double" && character === '"') {
			quote = null;
			continue;
		}
		if (quote === null && character === "'") {
			quote = "single";
			continue;
		}
		if (quote === null && character === '"') {
			quote = "double";
			continue;
		}

		const nested = readNestedShellBody(segment, index);
		if (nested) {
			wordValue += segment.slice(index, nested.end + 1);
			index = nested.end;
			continue;
		}
		wordValue += character;
	}

	return -1;
}

function getControlOperatorLength(command: string, index: number): number {
	const character = command[index];
	const nextCharacter = command[index + 1];
	const previousCharacter = command[index - 1];

	if (character === "\n" || character === ";") return 1;
	if (character === "|") return nextCharacter === "|" || nextCharacter === "&" ? 2 : 1;
	if (character !== "&") return 0;
	if (nextCharacter === "&") return 2;
	if (nextCharacter === ">" || previousCharacter === ">") return 0;
	return 1;
}

function isShellCommentStart(command: string, index: number): boolean {
	return index === 0 || /\s/.test(command[index - 1]!);
}

function readNestedShellBody(
	command: string,
	index: number,
): NestedShellBody | null {
	if (command[index] === "`") {
		const end = findClosingBacktick(command, index + 1);
		return end === -1 ? null : { bodyStart: index + 1, end };
	}
	if (
		command[index] !== "$" ||
		command[index + 1] !== "(" ||
		command[index + 2] === "("
	) {
		return null;
	}

	const end = findCommandSubstitutionEnd(command, index + 2);
	return end === -1 ? null : { bodyStart: index + 2, end };
}

function findClosingBacktick(command: string, start: number): number {
	let escaped = false;
	for (let index = start; index < command.length; index++) {
		const character = command[index]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") escaped = true;
		else if (character === "`") return index;
	}
	return -1;
}

function findCommandSubstitutionEnd(command: string, start: number): number {
	let depth = 1;
	let quote: Quote = null;
	let escaped = false;
	const parentQuotes: Quote[] = [];

	for (let index = start; index < command.length; index++) {
		const character = command[index]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote !== "single" && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote === "single") {
			if (character === "'") quote = null;
			continue;
		}
		if (quote === "double" && character === '"') {
			quote = null;
			continue;
		}
		if (quote === null && character === "'") {
			quote = "single";
			continue;
		}
		if (quote === null && character === '"') {
			quote = "double";
			continue;
		}
		if (character === "`") {
			const end = findClosingBacktick(command, index + 1);
			if (end !== -1) index = end;
			continue;
		}
		if (quote === "double") {
			if (character === "$" && command[index + 1] === "(") {
				parentQuotes.push(quote);
				quote = null;
				depth++;
				index++;
			}
			continue;
		}
		if (character === "(") {
			parentQuotes.push(null);
			depth++;
			continue;
		}
		if (character !== ")") continue;

		depth--;
		if (depth === 0) return index;
		quote = parentQuotes.pop() ?? null;
	}
	return -1;
}
