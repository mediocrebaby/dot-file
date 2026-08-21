import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const HELPER_DIRECTORY = join(EXTENSION_ROOT, "helper");
const BINARY_DIRECTORY = join(EXTENSION_ROOT, "bin");
const PACKAGE_PATH = join(EXTENSION_ROOT, "package.json");
const PROTOCOL_PATH = join(HELPER_DIRECTORY, "protocol.json");
const TARGETS_PATH = join(HELPER_DIRECTORY, "targets.json");
const BINARY_NAME = "pi-guard-helper";
const EXECUTABLE_MODE = 0o755;

const packageValue = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
const protocolValue = JSON.parse(readFileSync(PROTOCOL_PATH, "utf8"));
const targets = JSON.parse(readFileSync(TARGETS_PATH, "utf8"));
if (typeof packageValue.version !== "string") {
	throw new Error(`${PACKAGE_PATH} 缺少 version`);
}
if (!Number.isInteger(protocolValue.version) || protocolValue.version <= 0) {
	throw new Error(`${PROTOCOL_PATH} 缺少有效 version`);
}
if (!Array.isArray(targets)) throw new Error(`${TARGETS_PATH} 必须是数组`);

const hostOnly = process.argv.includes("--host");
const selectedTargets = hostOnly
	? targets.filter(
			(target) =>
				target.platform === process.platform && target.arch === process.arch,
		)
	: targets;
if (selectedTargets.length === 0) {
	throw new Error(`没有匹配 ${process.platform}/${process.arch} 的 helper 目标`);
}

const ldflags = [
	"-s",
	"-w",
	`-X=main.helperVersion=${packageValue.version}`,
	`-X=main.protocolVersion=${protocolValue.version}`,
].join(" ");

for (const target of selectedTargets) {
	const outputPath = join(
		BINARY_DIRECTORY,
		target.directory,
		`${BINARY_NAME}${target.extension}`,
	);
	mkdirSync(dirname(outputPath), { recursive: true });
	const result = spawnSync(
		"go",
		["build", "-trimpath", "-ldflags", ldflags, "-o", outputPath, "."],
		{
			cwd: HELPER_DIRECTORY,
			env: {
				...process.env,
				CGO_ENABLED: "0",
				GOOS: target.goos,
				GOARCH: target.goarch,
			},
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`构建 ${target.goos}/${target.goarch} helper 失败: ${(result.stderr || result.stdout).trim()}`,
		);
	}
	if (target.goos !== "windows") chmodSync(outputPath, EXECUTABLE_MODE);
	console.log(`built ${target.goos}/${target.goarch}: ${outputPath}`);
}
