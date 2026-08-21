import { access, chmod } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
	HELPER_BINARY_NAME,
	HELPER_INPUT_MAX_BYTES,
	HELPER_STDERR_MAX_BYTES,
	HELPER_STDOUT_MAX_BYTES,
	HELPER_TIMEOUT_MS,
} from "./constants.ts";
import {
	AnalysisSource,
	AnalysisStatus,
	type AnalysisDiagnostic,
	type RmCommandDetail,
	type RmCommandGroup,
	type StaticAnalysisResult,
	utf8ByteLength,
} from "./rm-command.ts";
import { EXTENSION_ROOT, loadRuntimeManifest } from "./manifest.ts";

const BIN_DIRECTORY = "bin";
const VERSION_ARGUMENT = "--version";
const EXECUTABLE_MODE = 0o755;

interface HelperIdentity {
	helperVersion: string;
	protocolVersion: number;
	goos: string;
	goarch: string;
}

interface ExpectedHelperIdentity extends HelperIdentity {
	executablePath: string;
}

interface RawHelperGroup {
	command: string;
	rmCommands: RmCommandDetail[];
	start: number;
	end: number;
}

interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

export class HelperClient {
	private initialized = false;
	private identity: ExpectedHelperIdentity | undefined;
	private initializationError: string | undefined;
	private readonly children = new Set<ChildProcessWithoutNullStreams>();

	async initialize(signal?: AbortSignal): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		try {
			const expected = await readExpectedIdentity();
			if (process.platform !== "win32") {
				await chmod(expected.executablePath, EXECUTABLE_MODE);
			}
			await access(expected.executablePath, fsConstants.X_OK);
			const result = await this.runProcess(
				expected.executablePath,
				[VERSION_ARGUMENT],
				undefined,
				signal,
				"验证 helper 版本",
			);
			if (result.exitCode !== 0) {
				throw new Error(
					`helper --version 退出码为 ${String(result.exitCode)}: ${summarizeStderr(result.stderr)}`,
				);
			}
			const actual = parseHelperIdentity(result.stdout);
			assertIdentityMatches(expected, actual);
			this.identity = expected;
		} catch (error) {
			this.initializationError = formatError(error);
			console.error(`pi-guard helper 验证失败: ${this.initializationError}`);
		}
	}

	async analyze(command: string, signal?: AbortSignal): Promise<StaticAnalysisResult> {
		if (!this.initialized) {
			throw new Error("helper 尚未在 session_start 阶段初始化");
		}
		if (!this.identity) {
			throw new Error(
				`helper 不可用: ${this.initializationError ?? "初始化状态未知"}`,
			);
		}
		const commandBytes = utf8ByteLength(command);
		if (commandBytes > HELPER_INPUT_MAX_BYTES) {
			throw new Error(
				`Bash 输入为 ${commandBytes} 字节，超过 ${HELPER_INPUT_MAX_BYTES} 字节限制`,
			);
		}

		const request = JSON.stringify({
			protocolVersion: this.identity.protocolVersion,
			command,
		});
		const result = await this.runProcess(
			this.identity.executablePath,
			[],
			request,
			signal,
			"执行 Bash 静态分析",
		);
		if (result.exitCode !== 0) {
			throw new Error(
				`helper 退出码为 ${String(result.exitCode)}: ${summarizeStderr(result.stderr)}`,
			);
		}
		return parseHelperResponse(result.stdout, this.identity.protocolVersion);
	}

	shutdown(): void {
		for (const child of this.children) child.kill();
		this.children.clear();
	}

	private runProcess(
		executablePath: string,
		args: string[],
		input: string | undefined,
		signal: AbortSignal | undefined,
		operation: string,
	): Promise<ProcessResult> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new Error(`${operation}已取消`));
				return;
			}

			const child = spawn(executablePath, args, {
				shell: false,
				stdio: "pipe",
				windowsHide: true,
			});
			this.children.add(child);

			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];
			let stdoutBytes = 0;
			let stderrBytes = 0;
			let settled = false;
			let failure: Error | undefined;

			const cleanup = () => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", abortListener);
				this.children.delete(child);
			};
			const fail = (error: Error) => {
				if (failure) return;
				failure = error;
				child.kill();
			};
			const abortListener = () => fail(new Error(`${operation}已取消`));
			const timeout = setTimeout(
				() => fail(new Error(`${operation}超过 ${HELPER_TIMEOUT_MS}ms 限制`)),
				HELPER_TIMEOUT_MS,
			);

			signal?.addEventListener("abort", abortListener, { once: true });
			if (signal?.aborted) abortListener();
			child.stdout.on("data", (chunk: Buffer) => {
				stdoutBytes += chunk.length;
				if (stdoutBytes > HELPER_STDOUT_MAX_BYTES) {
					fail(
						new Error(
							`${operation}的 stdout 超过 ${HELPER_STDOUT_MAX_BYTES} 字节限制`,
						),
					);
					return;
				}
				stdoutChunks.push(chunk);
			});
			child.stderr.on("data", (chunk: Buffer) => {
				stderrBytes += chunk.length;
				if (stderrBytes > HELPER_STDERR_MAX_BYTES) {
					fail(
						new Error(
							`${operation}的 stderr 超过 ${HELPER_STDERR_MAX_BYTES} 字节限制`,
						),
					);
					return;
				}
				stderrChunks.push(chunk);
			});
			child.once("error", (error) => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(
					new Error(`${operation}无法启动 ${executablePath}: ${error.message}`, {
						cause: error,
					}),
				);
			});
			child.once("close", (exitCode) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (failure) {
					reject(failure);
					return;
				}
				resolve({
					stdout: Buffer.concat(stdoutChunks).toString("utf8"),
					stderr: Buffer.concat(stderrChunks).toString("utf8"),
					exitCode,
				});
			});

			if (input === undefined) {
				child.stdin.end();
			} else {
				child.stdin.end(input, "utf8");
			}
		});
	}
}

async function readExpectedIdentity(): Promise<ExpectedHelperIdentity> {
	const manifest = await loadRuntimeManifest();
	const target = manifest.targets.find(
		(candidate) =>
			candidate.platform === process.platform && candidate.arch === process.arch,
	);
	if (!target) {
		throw new Error(`不支持 helper 平台 ${process.platform}/${process.arch}`);
	}
	return {
		helperVersion: manifest.helperVersion,
		protocolVersion: manifest.protocolVersion,
		goos: target.goos,
		goarch: target.goarch,
		executablePath: join(
			EXTENSION_ROOT,
			BIN_DIRECTORY,
			target.directory,
			`${HELPER_BINARY_NAME}${target.extension}`,
		),
	};
}

function parseHelperIdentity(text: string): HelperIdentity {
	const value: unknown = JSON.parse(text);
	if (
		!isRecord(value) ||
		typeof value.helperVersion !== "string" ||
		!Number.isInteger(value.protocolVersion) ||
		typeof value.goos !== "string" ||
		typeof value.goarch !== "string"
	) {
		throw new Error("helper --version 返回了无效 JSON 协议");
	}
	return {
		helperVersion: value.helperVersion,
		protocolVersion: value.protocolVersion as number,
		goos: value.goos,
		goarch: value.goarch,
	};
}

function assertIdentityMatches(
	expected: ExpectedHelperIdentity,
	actual: HelperIdentity,
): void {
	for (const field of [
		"helperVersion",
		"protocolVersion",
		"goos",
		"goarch",
	] as const) {
		if (actual[field] !== expected[field]) {
			throw new Error(
				`helper ${field} 不匹配: 收到 ${String(actual[field])}, 期望 ${String(expected[field])}`,
			);
		}
	}
}

function parseHelperResponse(
	text: string,
	expectedProtocolVersion: number,
): StaticAnalysisResult {
	const value: unknown = JSON.parse(text);
	if (!isRecord(value)) throw new Error("helper 响应根节点不是 JSON 对象");
	if (value.protocolVersion !== expectedProtocolVersion) {
		throw new Error(
			`helper 响应协议版本不匹配: 收到 ${String(value.protocolVersion)}, 期望 ${expectedProtocolVersion}`,
		);
	}
	if (!Object.values(AnalysisStatus).includes(value.status as AnalysisStatus)) {
		throw new Error(`helper 返回未知分析状态 ${String(value.status)}`);
	}
	if (typeof value.hasRmEvidence !== "boolean") {
		throw new Error("helper 响应缺少 hasRmEvidence 布尔值");
	}
	if (!Array.isArray(value.groups) || !Array.isArray(value.diagnostics)) {
		throw new Error("helper 响应中的 groups 或 diagnostics 不是数组");
	}

	const groups: RmCommandGroup[] = value.groups.map((group, index) =>
		parseHelperGroup(group, index),
	);
	const diagnostics = value.diagnostics.map((diagnostic, index) =>
		parseDiagnostic(diagnostic, index),
	);
	return {
		protocolVersion: expectedProtocolVersion,
		status: value.status as StaticAnalysisResult["status"],
		hasRmEvidence: value.hasRmEvidence,
		groups,
		diagnostics,
	};
}

function parseHelperGroup(value: unknown, index: number): RmCommandGroup {
	if (
		!isRecord(value) ||
		typeof value.command !== "string" ||
		!Array.isArray(value.rmCommands) ||
		!Number.isInteger(value.start) ||
		!Number.isInteger(value.end)
	) {
		throw new Error(`helper groups[${index}] 格式无效`);
	}
	const rmCommands = value.rmCommands.map((detail, detailIndex) =>
		parseRmCommandDetail(detail, `groups[${index}].rmCommands[${detailIndex}]`),
	);
	return {
		command: value.command,
		rmCommands,
		source: AnalysisSource.static,
		start: value.start as number,
		end: value.end as number,
	};
}

function parseRmCommandDetail(value: unknown, path: string): RmCommandDetail {
	if (
		!isRecord(value) ||
		typeof value.command !== "string" ||
		!Array.isArray(value.arguments) ||
		!value.arguments.every((argument) => typeof argument === "string")
	) {
		throw new Error(`helper ${path} 格式无效`);
	}
	return { command: value.command, arguments: value.arguments as string[] };
}

function parseDiagnostic(value: unknown, index: number): AnalysisDiagnostic {
	if (!isRecord(value) || typeof value.message !== "string") {
		throw new Error(`helper diagnostics[${index}] 格式无效`);
	}
	const diagnostic: AnalysisDiagnostic = { message: value.message };
	if (value.line !== undefined) {
		if (!Number.isInteger(value.line)) {
			throw new Error(`helper diagnostics[${index}].line 格式无效`);
		}
		diagnostic.line = value.line as number;
	}
	if (value.column !== undefined) {
		if (!Number.isInteger(value.column)) {
			throw new Error(`helper diagnostics[${index}].column 格式无效`);
		}
		diagnostic.column = value.column as number;
	}
	return diagnostic;
}

function summarizeStderr(stderr: string): string {
	const trimmed = stderr.trim();
	return trimmed === "" ? "无 stderr" : trimmed.slice(0, 512);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
