import assert from "node:assert/strict";
import test from "node:test";

import { HelperClient } from "./helper-client.ts";
import { sanitizeTerminalText } from "./rm-command.ts";

const helper = new HelperClient();
await helper.initialize();

async function groupCommands(command: string): Promise<string[]> {
	const result = await helper.analyze(command);
	return result.groups.map((group) => group.command);
}

test("提取复合命令中的单条 rm 子命令", async () => {
	assert.deepEqual(
		await groupCommands("echo start && rm -rf ./cache && echo done"),
		["rm -rf ./cache"],
	);
});

test("按出现顺序提取多条 rm 子命令", async () => {
	assert.deepEqual(
		await groupCommands(
			"rm ./first; echo middle || sudo /bin/rm -f './second file'",
		),
		["rm ./first", "sudo /bin/rm -f './second file'"],
	);
});

test("保留 rm 参数中的引号和控制操作符文本", async () => {
	assert.deepEqual(
		await groupCommands('printf ready && rm -f "a && b" || echo done'),
		['rm -f "a && b"'],
	);
});

test("保留重定向但正确切分后台与后续命令", async () => {
	assert.deepEqual(
		await groupCommands("rm ./a &>/tmp/rm.log && rm ./b 2>&1 & echo done"),
		["rm ./a &>/tmp/rm.log", "rm ./b 2>&1"],
	);
});

test("忽略注释中的 rm 并继续解析下一行", async () => {
	assert.deepEqual(
		await groupCommands("rm ./a # rm ./ignored\necho next && rm ./b"),
		["rm ./a", "rm ./b"],
	);
});

test("提取命令替换与反引号中的 rm 子命令", async () => {
	assert.deepEqual(
		await groupCommands(
			'echo "$(printf \'%s\' \')\'; rm ./nested-a)" && echo `printf ready; rm ./nested-b`',
		),
		["rm ./nested-a", "rm ./nested-b"],
	);
});

test("外层和嵌套 rm 命令都会保留", async () => {
	assert.deepEqual(await groupCommands("rm ./outer-$(rm ./inner)"), [
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
