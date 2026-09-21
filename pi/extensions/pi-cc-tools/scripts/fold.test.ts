import test from "node:test";
import assert from "node:assert/strict";

import {
	extractFoldResultSummary,
	foldActionLabel,
	foldActionPastPhrase,
	foldActionProgressivePhrase,
	fitFoldActionPrefix,
	foldRunMarkerState,
	foldElapsedMs,
	foldRunBounds,
	foldWorkingGlyph,
	formatFoldActionCount,
	formatFoldThoughtsLabel,
	isToolFoldExpanded,
	nextToolFoldLevel,
	toolFoldLevelFromName,
	toolFoldLevelName,
	type ToolFoldLevel,
} from "../extensions/fold.ts";

test("nextToolFoldLevel 依次经过三档后回到起点", () => {
	let level: ToolFoldLevel = 0;
	const seen: ToolFoldLevel[] = [];
	for (let i = 0; i < 3; i++) {
		level = nextToolFoldLevel(level);
		seen.push(level);
	}
	assert.deepEqual(seen, [1, 2, 0]);
	assert.equal(nextToolFoldLevel(level), 1);
});

test("只有完整输出档使用 Pi 的展开形态", () => {
	assert.equal(isToolFoldExpanded(0), false);
	assert.equal(isToolFoldExpanded(1), true);
	assert.equal(isToolFoldExpanded(2), false);
});

test("档位名称", () => {
	assert.equal(toolFoldLevelName(0), "steps");
	assert.equal(toolFoldLevelName(1), "full");
	assert.equal(toolFoldLevelName(2), "compressed");
});

test("持久化档位名称映射，缺失或非法值回到 steps", () => {
	assert.equal(toolFoldLevelFromName("steps"), 0);
	assert.equal(toolFoldLevelFromName("full"), 1);
	assert.equal(toolFoldLevelFromName("compressed"), 2);
	assert.equal(toolFoldLevelFromName(undefined), 0);
	assert.equal(toolFoldLevelFromName("invalid"), 0);
});

test("批次边界跳过透明成员，遇到非参与者停止", () => {
	// 索引: 0=非参与者 1=工具 2=空行 3=工具 4=空行 5=思考 6=非参与者
	const participants = new Set([1, 3, 5]);
	const transparent = new Set([2, 4]);
	const isParticipant = (i: number) => participants.has(i);
	const isTransparent = (i: number) => transparent.has(i);

	for (const index of [1, 3, 5]) {
		assert.deepEqual(foldRunBounds(7, index, isParticipant, isTransparent), { start: 1, end: 5 }, `索引 ${index}`);
	}
	assert.deepEqual(foldRunBounds(7, 0, isParticipant, isTransparent), { start: 0, end: 0 });
	assert.deepEqual(foldRunBounds(7, 6, isParticipant, isTransparent), { start: 6, end: 6 });
});

test("单个参与者构成一段只有自己的批次", () => {
	const isParticipant = (i: number) => i === 2;
	assert.deepEqual(foldRunBounds(5, 2, isParticipant, () => false), { start: 2, end: 2 });
});

test("批次耗时取最早开始到最晚结束", () => {
	assert.equal(foldElapsedMs([{ startedAt: 1_000, endedAt: 4_000 }, { startedAt: 2_000, endedAt: 9_000 }], 10_000), 8_000);
});

test("批次仍在运行时以当前时间作为结束时间", () => {
	assert.equal(foldElapsedMs([{ startedAt: 1_000 }, { startedAt: 3_000, endedAt: 4_000 }], 9_000), 8_000);
});

test("没有时长记录的批次不显示耗时", () => {
	assert.equal(foldElapsedMs([{}, {}], 9_000), undefined);
	assert.equal(foldElapsedMs([], 9_000), undefined);
});

test("结束时间早于开始时间时退回当前时间", () => {
	assert.equal(foldElapsedMs([{ startedAt: 5_000, endedAt: 1_000 }], 9_000), 4_000);
});

test("结果摘要去掉分支符号、宽度标记与快捷键提示", () => {
	const hints = ["ctrl+o to toggle", "ctrl+o to collapse", "ctrl+shift+o more detail"];
	assert.equal(extractFoldResultSummary("\uE000└ Done (37 lines) • ctrl+o to toggle", hints), "Done (37 lines)");
	assert.equal(extractFoldResultSummary("└ 12 lines returned • ctrl+o to toggle", hints), "12 lines returned");
	assert.equal(extractFoldResultSummary("└ Done (3 lines) • ctrl+o to collapse • ctrl+shift+o more detail", hints), "Done (3 lines)");
});

test("结果摘要跳过空行并保留纯提示之外的内容", () => {
	const hints = ["ctrl+o to toggle"];
	assert.equal(extractFoldResultSummary("\n\n└ Exit 1 (2 lines) • ctrl+o to toggle\nmore", hints), "Exit 1 (2 lines)");
	assert.equal(extractFoldResultSummary("", hints), "");
	assert.equal(extractFoldResultSummary("└ • ctrl+o to toggle", hints), "");
});

test("思考摘要单段沿用原写法，多段合并计数", () => {
	assert.equal(formatFoldThoughtsLabel(1, "2s"), "Thought for 2s");
	assert.equal(formatFoldThoughtsLabel(6, "12s"), "Thought ×6 · 12s");
});

test("压缩动作使用稳定短名称", () => {
	assert.equal(foldActionLabel("thinking"), "Think");
	assert.equal(foldActionLabel("ask_user_question"), "Ask");
	assert.equal(foldActionLabel("apply_patch"), "Patch");
	assert.equal(foldActionLabel("ffgrep"), "Search");
	assert.equal(foldActionLabel("ls"), "List");
	assert.equal(foldActionLabel("mcp__github__search"), "MCP");
	assert.equal(foldActionLabel("custom_tool"), "Custom Tool");
});

test("动作计数在乘号两侧保留小间距", () => {
	assert.equal(formatFoldActionCount("Bash", 2), "Bash × 2");
	assert.equal(formatFoldActionCount("Edit", 0), "Edit × 1");
});

test("完成叙述句：思考写总耗时，其余动作写次数", () => {
	assert.equal(foldActionPastPhrase("Think", 2, "2s"), "Thought for 2s");
	assert.equal(foldActionPastPhrase("Bash", 1, "2s"), "ran 1 shell command");
	assert.equal(foldActionPastPhrase("Bash", 3, "2s"), "ran 3 shell commands");
	assert.equal(foldActionPastPhrase("List", 1, "2s"), "listed 1 directory");
	assert.equal(foldActionPastPhrase("List", 2, "2s"), "listed 2 directories");
	assert.equal(foldActionPastPhrase("Read", 1, "2s"), "read 1 file");
	assert.equal(foldActionPastPhrase("Read", 4, "2s"), "read 4 files");
	assert.equal(foldActionPastPhrase("Patch", 2, "2s"), "applied 2 patches");
});

test("进行叙述句不携带耗时", () => {
	assert.equal(foldActionProgressivePhrase("Think", 1), "Thinking");
	assert.equal(foldActionProgressivePhrase("Bash", 1), "running 1 shell command");
	assert.equal(foldActionProgressivePhrase("Bash", 2), "running 2 shell commands");
	assert.equal(foldActionProgressivePhrase("List", 2), "listing 2 directories");
});

test("动作前缀按顺序保留，放不下的类别计入折叠数", () => {
	// 每段 10 宽，末尾隐藏标记 6 宽。
	const widthOf = (segments: number, hiddenCount: number) => segments * 10 + (hiddenCount > 0 ? 6 : 0);
	const counts = [4, 6, 1];

	assert.deepEqual(fitFoldActionPrefix(counts, 100, 4, widthOf), { segments: 3, hidden: 0 });
	assert.deepEqual(fitFoldActionPrefix(counts, 30, 4, widthOf), { segments: 3, hidden: 0 });
	// 第三段放不下：保留前两段，剩下 1 计入折叠。
	assert.deepEqual(fitFoldActionPrefix(counts, 29, 4, widthOf), { segments: 2, hidden: 1 });
	// 第二段放不下：只保留第一段，后面 7 全部计入折叠。
	assert.deepEqual(fitFoldActionPrefix(counts, 19, 4, widthOf), { segments: 1, hidden: 7 });
	// 第一段都放不下：不展示任何前缀，全部计入折叠。
	assert.deepEqual(fitFoldActionPrefix(counts, 5, 4, widthOf), { segments: 0, hidden: 11 });
});

test("动作前缀受最大类别数限制", () => {
	const widthOf = () => 1;
	assert.deepEqual(fitFoldActionPrefix([1, 1, 1, 1, 1], 100, 4, widthOf), { segments: 4, hidden: 1 });
	assert.deepEqual(fitFoldActionPrefix([1, 2, 3], 100, 4, widthOf), { segments: 3, hidden: 0 });
});

test("运行标记不受同一条记录里的失败影响", () => {
	assert.equal(foldRunMarkerState(true, "error"), "running");
	assert.equal(foldRunMarkerState(true, "success"), "running");
	assert.equal(foldRunMarkerState(false, "error"), "error");
	assert.equal(foldRunMarkerState(false, "success"), "success");
	// 结束的记录不会停在 pending。
	assert.equal(foldRunMarkerState(false, "pending"), "success");
});

test("运行中的工作标记按 loader 帧顺序循环", () => {
	assert.deepEqual(
		[0, 1, 2, 3, 4].map(foldWorkingGlyph),
		["✻", "✽", "✢", "✳", "✶"],
	);
	assert.equal(foldWorkingGlyph(5), "✻");
	assert.equal(foldWorkingGlyph(7), "✢");
	assert.equal(foldWorkingGlyph(-1), "✶");
	assert.equal(foldWorkingGlyph(Number.NaN), "✻");
});

test("每一帧运行标记都只占一个显示格", () => {
	for (const frame of [0, 1, 2, 3, 4]) {
		const glyph = foldWorkingGlyph(frame);
		assert.equal([...glyph].length, 1, `帧 ${frame} 的 ${glyph}`);
	}
});
