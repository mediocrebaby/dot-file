import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	HELPER_PROTOCOL_FILE,
	HELPER_TARGETS_FILE,
} from "./constants.ts";

const PACKAGE_FILE = "package.json";
const HELPER_DIRECTORY = "helper";

export const EXTENSION_ROOT = fileURLToPath(new URL(".", import.meta.url));

export interface HelperTarget {
	platform: NodeJS.Platform;
	arch: NodeJS.Architecture;
	goos: string;
	goarch: string;
	directory: string;
	extension: string;
}

export interface RuntimeManifest {
	helperVersion: string;
	protocolVersion: number;
	targets: HelperTarget[];
}

let manifestPromise: Promise<RuntimeManifest> | undefined;

export function loadRuntimeManifest(): Promise<RuntimeManifest> {
	manifestPromise ??= readRuntimeManifest();
	return manifestPromise;
}

async function readRuntimeManifest(): Promise<RuntimeManifest> {
	const packagePath = join(EXTENSION_ROOT, PACKAGE_FILE);
	const protocolPath = join(
		EXTENSION_ROOT,
		HELPER_DIRECTORY,
		HELPER_PROTOCOL_FILE,
	);
	const targetsPath = join(
		EXTENSION_ROOT,
		HELPER_DIRECTORY,
		HELPER_TARGETS_FILE,
	);
	const [packageText, protocolText, targetsText] = await Promise.all([
		readFile(packagePath, "utf8"),
		readFile(protocolPath, "utf8"),
		readFile(targetsPath, "utf8"),
	]);
	const packageValue: unknown = JSON.parse(packageText);
	const protocolValue: unknown = JSON.parse(protocolText);
	const targetsValue: unknown = JSON.parse(targetsText);
	if (!isRecord(packageValue) || typeof packageValue.version !== "string") {
		throw new Error(`${packagePath} 缺少有效 version`);
	}
	if (
		!isRecord(protocolValue) ||
		!Number.isInteger(protocolValue.version) ||
		(protocolValue.version as number) <= 0
	) {
		throw new Error(`${protocolPath} 缺少有效协议版本`);
	}
	if (!Array.isArray(targetsValue)) {
		throw new Error(`${targetsPath} 必须是 JSON 数组`);
	}
	const targets = targetsValue.map((target, index) =>
		parseTarget(target, `${targetsPath}[${index}]`),
	);
	return {
		helperVersion: packageValue.version,
		protocolVersion: protocolValue.version as number,
		targets,
	};
}

function parseTarget(value: unknown, path: string): HelperTarget {
	if (
		!isRecord(value) ||
		typeof value.platform !== "string" ||
		typeof value.arch !== "string" ||
		typeof value.goos !== "string" ||
		typeof value.goarch !== "string" ||
		typeof value.directory !== "string" ||
		typeof value.extension !== "string"
	) {
		throw new Error(`${path} 格式无效`);
	}
	return value as unknown as HelperTarget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
