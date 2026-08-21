import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import { PI_GUARD_CONFIG_FILE } from "./constants.ts";

export interface ConfiguredModel {
	provider: string;
	id: string;
}

export interface PiGuardConfig {
	model?: ConfiguredModel;
}

export interface LoadedPiGuardConfig {
	config: PiGuardConfig;
	error?: string;
}

export function loadPiGuardConfig(): LoadedPiGuardConfig {
	const configPath = join(
		getAgentDir(),
		"extensions",
		PI_GUARD_CONFIG_FILE,
	);
	if (!existsSync(configPath)) return { config: {} };

	try {
		const value: unknown = JSON.parse(readFileSync(configPath, "utf8"));
		if (!isRecord(value)) {
			throw new Error("配置根节点必须是 JSON 对象");
		}

		const modelValue = value.model;
		if (modelValue === undefined) return { config: {} };
		if (!isRecord(modelValue)) {
			throw new Error("model 必须是 JSON 对象");
		}

		const provider = readNonEmptyString(modelValue.provider, "model.provider");
		const id = readNonEmptyString(modelValue.id, "model.id");
		return { config: { model: { provider, id } } };
	} catch (error) {
		return {
			config: {},
			error: `读取 pi-guard 配置 ${configPath} 失败: ${formatError(error)}`,
		};
	}
}

function readNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${field} 必须是非空字符串`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
