import { createHash } from "node:crypto";
import * as path from "node:path";
import { getAgentDir } from "./utils.ts";

const EXTENSIONS_DIR_NAME = "extensions";
const PI_SUBAGENT_EXTENSION_DIR_NAME = "pi-subagent";
const CONFIG_FILE_NAME = "config.json";
const DATA_DIR_NAME = "data";
const PROJECT_KEY_SEPARATOR = "\0";

export function getPiSubagentExtensionDir(agentDir = getAgentDir()): string {
	return path.join(agentDir, EXTENSIONS_DIR_NAME, PI_SUBAGENT_EXTENSION_DIR_NAME);
}

export function getPiSubagentConfigPath(agentDir = getAgentDir()): string {
	return path.join(getPiSubagentExtensionDir(agentDir), CONFIG_FILE_NAME);
}

export function getPiSubagentDataDir(agentDir = getAgentDir()): string {
	return path.join(getPiSubagentExtensionDir(agentDir), DATA_DIR_NAME);
}

export function getProjectStorageKey(projectRoot: string): string {
	return createHash("sha256").update(`${path.resolve(projectRoot)}${PROJECT_KEY_SEPARATOR}`).digest("hex");
}
