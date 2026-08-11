import assert from "node:assert/strict";
import test from "node:test";

import { extractRmCommands, sanitizeTerminalText } from "./rm-command.ts";

test("提取复合命令中的单条 rm 子命令", () => {
	assert.deepEqual(
		extractRmCommands("echo start && rm -rf ./cache && echo done"),
		["rm -rf ./cache"],
	);
});

test("按出现顺序提取多条 rm 子命令", () => {
	assert.deepEqual(
		extractRmCommands("rm ./first; echo middle || sudo /bin/rm -f './second file'"),
		["rm ./first", "/bin/rm -f './second file'"],
	);
});

test("保留 rm 参数中的引号和控制操作符文本", () => {
	assert.deepEqual(
		extractRmCommands('printf ready && rm -f "a && b" || echo done'),
		['rm -f "a && b"'],
	);
});

test("保留重定向但正确切分后台与后续命令", () => {
	assert.deepEqual(
		extractRmCommands("rm ./a &>/tmp/rm.log && rm ./b 2>&1 & echo done"),
		["rm ./a &>/tmp/rm.log", "rm ./b 2>&1"],
	);
});

test("忽略注释中的 rm 并继续解析下一行", () => {
	assert.deepEqual(
		extractRmCommands("rm ./a # rm ./ignored\necho next && rm ./b"),
		["rm ./a", "rm ./b"],
	);
});

test("提取命令替换与反引号中的 rm 子命令", () => {
	assert.deepEqual(
		extractRmCommands(
			'echo "$(printf \'%s\' \')\'; rm ./nested-a)" && echo `printf ready; rm ./nested-b`',
		),
		["rm ./nested-a", "rm ./nested-b"],
	);
});

test("外层和嵌套 rm 命令都会展示", () => {
	assert.deepEqual(extractRmCommands("rm ./outer-$(rm ./inner)"), [
		"rm ./outer-$(rm ./inner)",
		"rm ./inner",
	]);
});

test("终端控制字符会转换为可见文本", () => {
	assert.equal(
		sanitizeTerminalText("rm\t-f\u001b[31m target\r\nnext"),
		"rm    -f\\x1b[31m target\nnext",
	);
});
