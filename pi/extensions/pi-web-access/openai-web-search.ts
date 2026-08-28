import { lookup as dnsLookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { activityMonitor } from "./activity.ts";
import {
	CredentialResolutionError,
	hasCredentialSource,
	redactCredential,
	resolveCredential,
	type CredentialCommandRunner,
} from "./credential-source.ts";
import type { SearchOptions, SearchResponse, SearchResult } from "./search.ts";
import {
	normalizeSearchDomainFilters,
	normalizeSearchResultCount,
	type NormalizedSearchDomainFilters,
} from "./search-options.ts";
import type { Lookup, LookupAddress } from "./ssrf-protection.ts";
import { getWebSearchConfigPath } from "./utils.ts";

export type OpenAIWebSearchFailureCategory =
	| "missing-credentials"
	| "credential-resolution"
	| "configuration"
	| "security"
	| "invalid-parameter"
	| "caller-abort"
	| "timeout"
	| "network"
	| "authentication"
	| "rate-limit"
	| "server"
	| "capability"
	| "protocol"
	| "no-sources";

export class OpenAIWebSearchError extends Error {
	readonly category: OpenAIWebSearchFailureCategory;
	readonly fallbackEligible: boolean;
	readonly status?: number;

	constructor(
		category: OpenAIWebSearchFailureCategory,
		message: string,
		options: { fallbackEligible?: boolean; status?: number; cause?: unknown } = {},
	) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "OpenAIWebSearchError";
		this.category = category;
		this.fallbackEligible = options.fallbackEligible === true;
		this.status = options.status;
	}
}

export interface ResolveOpenAIEndpointOptions {
	lookup?: Lookup;
	signal?: AbortSignal;
	onValidatedAddresses?: (addresses: LookupAddress[]) => void;
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(abortReason(signal));
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortReason(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});
}

const BLOCKED_OPENAI_ENDPOINTS = new net.BlockList();
for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) BLOCKED_OPENAI_ENDPOINTS.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
	["::", 128],
	["::1", 128],
	["64:ff9b::", 96],
	["64:ff9b:1::", 48],
	["100::", 64],
	["2001::", 23],
	["2001:db8::", 32],
	["2002::", 16],
	["3fff::", 20],
	["5f00::", 16],
	["fc00::", 7],
	["fe80::", 10],
	["fec0::", 10],
	["ff00::", 8],
] as const) BLOCKED_OPENAI_ENDPOINTS.addSubnet(network, prefix, "ipv6");

function assertOpenAIPublicAddress(address: string, hostname: string): LookupAddress {
	const family = net.isIP(address);
	if (family !== 4 && family !== 6) {
		throw new OpenAIWebSearchError("security", `OpenAI Web Search endpoint resolved a non-IP address for ${hostname}`);
	}
	const firstIPv6Hextet = family === 6 ? Number.parseInt(address.split(":", 1)[0] ?? "", 16) : undefined;
	if ((family === 6 && (firstIPv6Hextet === undefined || !Number.isFinite(firstIPv6Hextet) || firstIPv6Hextet < 0x2000 || firstIPv6Hextet > 0x3fff))
		|| BLOCKED_OPENAI_ENDPOINTS.check(address, family === 4 ? "ipv4" : "ipv6")) {
		throw new OpenAIWebSearchError("security", `OpenAI Web Search endpoint resolved to a private or reserved address for ${hostname}`);
	}
	return { address, family };
}

async function defaultOpenAILookup(hostname: string): Promise<LookupAddress[]> {
	return dnsLookup(hostname, { all: true, verbatim: true });
}

async function resolveOpenAIHttpsAddresses(hostname: string, lookup: Lookup | undefined, signal?: AbortSignal): Promise<LookupAddress[]> {
	if (net.isIP(hostname)) return [assertOpenAIPublicAddress(hostname, hostname)];
	let addresses: LookupAddress[];
	try {
		addresses = await raceWithSignal((lookup ?? defaultOpenAILookup)(hostname), signal);
	} catch (error) {
		if (signal?.aborted) throw error;
		throw new OpenAIWebSearchError("network", `OpenAI Web Search failed to resolve ${hostname}`, { fallbackEligible: true, cause: error });
	}
	if (addresses.length === 0) {
		throw new OpenAIWebSearchError("network", `OpenAI Web Search failed to resolve ${hostname}: no addresses returned`, { fallbackEligible: true });
	}
	return addresses.map(({ address }) => assertOpenAIPublicAddress(address, hostname));
}

function isLiteralLoopback(hostname: string): boolean {
	if (net.isIP(hostname) === 4) return hostname.startsWith("127.");
	return hostname === "::1";
}

function hasLiteralLoopbackAuthority(rawUrl: string): boolean {
	const authority = rawUrl.match(/^http:\/\/([^/?#]+)/i)?.[1] ?? "";
	return /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(authority)
		|| /^\[::1\](?::\d+)?$/i.test(authority);
}

export async function resolveOpenAIResponsesEndpoint(
	baseUrl: string,
	options: ResolveOpenAIEndpointOptions = {},
): Promise<URL> {
	if (options.signal?.aborted) throw abortReason(options.signal);
	const trimmed = baseUrl.trim();
	if (!trimmed || trimmed.includes("\\")) {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search base URL is invalid");
	}
	const pathInput = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").split(/[?#]/, 1)[0];
	if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(pathInput) || /%(?:2e|2f|5c)/i.test(pathInput)) {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search base URL contains an unsafe path");
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search base URL is invalid");
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search base URL must not contain credentials, query parameters, or fragments");
	}
	if (url.port === "0") {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search base URL uses an invalid port");
	}
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
	if (url.protocol === "http:") {
		if (!isLiteralLoopback(hostname) || !hasLiteralLoopbackAuthority(trimmed)) {
			throw new OpenAIWebSearchError("security", "HTTP OpenAI Web Search endpoints are limited to literal loopback addresses");
		}
		options.onValidatedAddresses?.([{ address: hostname, family: net.isIP(hostname) }]);
	} else if (url.protocol === "https:") {
		const addresses = await resolveOpenAIHttpsAddresses(hostname, options.lookup, options.signal);
		options.onValidatedAddresses?.(addresses);
	} else {
		throw new OpenAIWebSearchError("security", "OpenAI Web Search endpoints must use HTTPS, or HTTP on a literal loopback address");
	}

	const path = url.pathname.replace(/\/+$/, "");
	url.pathname = path.endsWith("/responses") ? path : `${path}/responses`;
	return url;
}

export interface NormalizeOpenAIResponseOptions {
	numResults?: number;
}

interface OpenAIWebSearchConfigInput {
	enabled?: unknown;
	channel?: unknown;
	baseUrl?: unknown;
	apiKey?: unknown;
	model?: unknown;
	timeoutSeconds?: unknown;
	searchContextSize?: unknown;
	headers?: unknown;
}

interface ResolvedOpenAIWebSearchConfig {
	baseUrl: string;
	model: string;
	timeoutMs: number;
	searchContextSize: "low" | "medium" | "high";
	apiKeySource?: unknown;
	headers: Record<string, unknown>;
}

export interface OpenAIWebSearchRuntime {
	config?: unknown;
	environment?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	lookup?: Lookup;
	runCredentialCommand?: CredentialCommandRunner;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.6";
const DEFAULT_OPENAI_TIMEOUT_SECONDS = 30;
const MAX_OPENAI_TIMEOUT_SECONDS = 120;
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MAX_SUCCESS_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTRA_HEADERS = new Set([
	"openai-organization",
	"openai-project",
	"x-openai-actor-authorization",
]);

function configRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === undefined || value === null) return {};
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new OpenAIWebSearchError("configuration", `${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function loadConfigRoot(): Record<string, unknown> {
	const path = getWebSearchConfigPath();
	if (!existsSync(path)) return {};
	try {
		return configRecord(JSON.parse(readFileSync(path, "utf8")), `Config in ${path}`);
	} catch (error) {
		if (error instanceof OpenAIWebSearchError) throw error;
		throw new OpenAIWebSearchError("configuration", `Failed to parse ${path}`, { cause: error });
	}
}

function optionalTrimmedString(value: unknown, label: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") throw new OpenAIWebSearchError("configuration", `${label} must be a string`);
	const trimmed = value.trim();
	if (!trimmed) throw new OpenAIWebSearchError("configuration", `${label} must not be empty`);
	return trimmed;
}

function resolveTimeoutMs(value: unknown): number {
	if (value === undefined || value === null) return DEFAULT_OPENAI_TIMEOUT_SECONDS * 1000;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
		throw new OpenAIWebSearchError("configuration", "webSearch.openai.timeoutSeconds must be a positive number");
	}
	return Math.min(Math.floor(value), MAX_OPENAI_TIMEOUT_SECONDS) * 1000;
}

function resolveSearchContextSize(value: unknown): "low" | "medium" | "high" {
	if (value === undefined || value === null) return "medium";
	if (value === "low" || value === "medium" || value === "high") return value;
	throw new OpenAIWebSearchError("configuration", "webSearch.openai.searchContextSize must be low, medium, or high");
}

function resolveOpenAIConfig(runtime: OpenAIWebSearchRuntime): ResolvedOpenAIWebSearchConfig {
	const root = configRecord(runtime.config ?? loadConfigRoot(), "Web search config");
	const webSearch = configRecord(root.webSearch, "webSearch");
	const input = configRecord(webSearch.openai, "webSearch.openai") as OpenAIWebSearchConfigInput;
	if (input.enabled === false) {
		throw new OpenAIWebSearchError("missing-credentials", "OpenAI Web Search is disabled", { fallbackEligible: true });
	}
	if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
		throw new OpenAIWebSearchError("configuration", "webSearch.openai.enabled must be a boolean");
	}
	const channel = optionalTrimmedString(input.channel, "webSearch.openai.channel") ?? "openai";
	if (channel !== "openai" && channel !== "cliproxyapi") {
		throw new OpenAIWebSearchError("configuration", "webSearch.openai.channel must be openai or cliproxyapi");
	}
	const environment = runtime.environment ?? process.env;
	const configuredBaseUrl = optionalTrimmedString(input.baseUrl, "webSearch.openai.baseUrl");
	const configuredModel = optionalTrimmedString(input.model, "webSearch.openai.model");
	const baseUrl = configuredBaseUrl
		?? firstNonEmpty(environment.PI_WEB_SEARCH_OPENAI_BASE_URL, environment.OPENAI_BASE_URL)
		?? DEFAULT_OPENAI_BASE_URL;
	const model = configuredModel
		?? firstNonEmpty(environment.PI_WEB_SEARCH_OPENAI_MODEL)
		?? (channel === "cliproxyapi" ? undefined : DEFAULT_OPENAI_MODEL);
	if (!baseUrl) throw new OpenAIWebSearchError("configuration", "OpenAI Web Search base URL must not be empty");
	if (!model) throw new OpenAIWebSearchError("configuration", "CLIProxyAPI requires an explicit webSearch.openai.model");
	return {
		baseUrl,
		model,
		timeoutMs: resolveTimeoutMs(input.timeoutSeconds),
		searchContextSize: resolveSearchContextSize(input.searchContextSize),
		apiKeySource: input.apiKey,
		headers: configRecord(input.headers, "webSearch.openai.headers"),
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function normalizedText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		url.hash = "";
		return url.toString();
	} catch {
		return null;
	}
}

function fallbackTitle(url: string): string {
	try {
		return new URL(url).hostname || url;
	} catch {
		return url;
	}
}

export function normalizeOpenAIWebSearchResponse(
	payload: unknown,
	options: NormalizeOpenAIResponseOptions = {},
): SearchResponse {
	const root = asRecord(payload);
	const output = Array.isArray(root?.output) ? root.output : [];
	const answerParts: string[] = [];
	const resultsByUrl = new Map<string, SearchResult>();

	const addSource = (sourceValue: unknown): void => {
		const source = asRecord(sourceValue);
		if (!source) return;
		const url = normalizeSourceUrl(source.url);
		if (!url) return;
		const existing = resultsByUrl.get(url);
		const title = normalizedText(source.title);
		const snippet = normalizedText(source.snippet ?? source.text);
		if (existing) {
			if (title && existing.title === fallbackTitle(url)) existing.title = title;
			if (snippet && !existing.snippet) existing.snippet = snippet;
			return;
		}
		resultsByUrl.set(url, {
			title: title || fallbackTitle(url),
			url,
			snippet,
		});
	};

	for (const itemValue of output) {
		const item = asRecord(itemValue);
		if (!item) continue;
		if (item.type === "web_search_call") {
			const action = asRecord(item.action);
			for (const source of Array.isArray(action?.sources) ? action.sources : []) addSource(source);
		}
		if (item.type !== "message") continue;
		for (const contentValue of Array.isArray(item.content) ? item.content : []) {
			const content = asRecord(contentValue);
			if (!content || content.type !== "output_text" || typeof content.text !== "string") continue;
			const text = content.text;
			if (text.trim()) answerParts.push(text.trim());
			for (const annotationValue of Array.isArray(content.annotations) ? content.annotations : []) {
				const annotation = asRecord(annotationValue);
				if (!annotation || annotation.type !== "url_citation") continue;
				const url = normalizeSourceUrl(annotation.url);
				if (!url) continue;
				const start = typeof annotation.start_index === "number" ? annotation.start_index : -1;
				const end = typeof annotation.end_index === "number" ? annotation.end_index : -1;
				const snippet = start >= 0 && end > start && end <= text.length
					? text.slice(start, end).trim()
					: "";
				addSource({ url, title: annotation.title, snippet });
			}
		}
	}

	return {
		answer: answerParts.join("\n\n"),
		results: [...resultsByUrl.values()].slice(0, normalizeSearchResultCount(options.numResults)),
	};
}

function configuredEnvironmentApiKey(runtime: OpenAIWebSearchRuntime): string | undefined {
	const environment = runtime.environment ?? process.env;
	return firstNonEmpty(
		environment.PI_WEB_SEARCH_OPENAI_API_KEY,
		environment.OPENAI_API_KEY,
	);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

function classifiedAbort(
	callerSignal: AbortSignal | undefined,
	timeoutSignal: AbortSignal,
	cause: unknown,
): OpenAIWebSearchError | null {
	if (callerSignal?.aborted) {
		return new OpenAIWebSearchError("caller-abort", "OpenAI Web Search was cancelled", { cause });
	}
	if (timeoutSignal.aborted) {
		return new OpenAIWebSearchError("timeout", "OpenAI Web Search timed out", { fallbackEligible: true, cause });
	}
	return null;
}

async function resolveRequestHeaders(
	config: ResolvedOpenAIWebSearchConfig,
	runtime: OpenAIWebSearchRuntime,
	signals: { request: AbortSignal; caller?: AbortSignal; timeout: AbortSignal },
): Promise<{ headers: Record<string, string>; secrets: string[] }> {
	const environment = runtime.environment ?? process.env;
	let apiKey: string | null;
	try {
		apiKey = await resolveCredential({
			provider: "OpenAI Web Search",
			configuredValue: config.apiKeySource,
			environmentValue: configuredEnvironmentApiKey(runtime),
			environment,
			signal: signals.request,
			runCommand: runtime.runCredentialCommand,
		});
	} catch (error) {
		const aborted = classifiedAbort(signals.caller, signals.timeout, error);
		if (aborted) throw aborted;
		const category = error instanceof CredentialResolutionError ? error.category : "credential-resolution";
		throw new OpenAIWebSearchError("credential-resolution", `OpenAI Web Search credential resolution failed: ${category}`, { cause: error });
	}
	if (!apiKey) {
		throw new OpenAIWebSearchError("missing-credentials", "OpenAI Web Search credentials are not configured", { fallbackEligible: true });
	}

	const headers: Record<string, string> = {
		"accept": "application/json",
		"authorization": `Bearer ${apiKey}`,
		"content-type": "application/json",
	};
	const secrets = [apiKey];
	for (const [rawName, source] of Object.entries(config.headers)) {
		const name = rawName.trim().toLowerCase();
		if (!ALLOWED_EXTRA_HEADERS.has(name)) {
			throw new OpenAIWebSearchError("configuration", `webSearch.openai.headers contains a disallowed header: ${rawName}`);
		}
		if (headers[name] !== undefined) {
			throw new OpenAIWebSearchError("configuration", `webSearch.openai.headers contains a duplicate header: ${rawName}`);
		}
		let value: string | null;
		try {
			value = await resolveCredential({
				provider: `OpenAI Web Search ${rawName}`,
				configuredValue: source,
				environment,
				signal: signals.request,
				runCommand: runtime.runCredentialCommand,
			});
		} catch (error) {
			const aborted = classifiedAbort(signals.caller, signals.timeout, error);
			if (aborted) throw aborted;
			throw new OpenAIWebSearchError("credential-resolution", `OpenAI Web Search header resolution failed: ${rawName}`, { cause: error });
		}
		if (!value || /[\r\n\0]/.test(value)) {
			throw new OpenAIWebSearchError("configuration", `webSearch.openai.headers contains an invalid value for ${rawName}`);
		}
		headers[name] = value;
		secrets.push(value);
	}
	return { headers, secrets };
}

function nodeResponseHeaders(headers: http.IncomingHttpHeaders): Headers {
	const normalized = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		normalized.set(name, Array.isArray(value) ? value.join(", ") : value);
	}
	return normalized;
}

export function createPinnedLookup(validatedAddress: LookupAddress): net.LookupFunction {
	return (_hostname, options, callback) => {
		if (options.all) callback(null, [{
			address: validatedAddress.address,
			family: validatedAddress.family,
		}]);
		else callback(null, validatedAddress.address, validatedAddress.family);
	};
}

function requestWithPinnedAddress(
	endpoint: URL,
	validatedAddress: LookupAddress,
	headers: Record<string, string>,
	body: string,
	signal: AbortSignal,
): Promise<Response> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finishReject = (error: unknown) => {
			if (settled) return;
			settled = true;
			reject(error);
		};
		const finishResolve = (response: Response) => {
			if (settled) return;
			settled = true;
			resolve(response);
		};
		const requestImpl = endpoint.protocol === "https:" ? https.request : http.request;
		const request = requestImpl(endpoint, {
			method: "POST",
			headers: { ...headers, "content-length": String(Buffer.byteLength(body, "utf8")) },
			signal,
			...(endpoint.protocol === "https:" ? {
				servername: net.isIP(endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, "")) ? undefined : endpoint.hostname,
				autoSelectFamily: false,
				family: validatedAddress.family,
				lookup: createPinnedLookup(validatedAddress),
			} : {}),
		}, response => {
			const status = response.statusCode ?? 0;
			const ok = status >= 200 && status < 300;
			const maxBytes = ok ? MAX_SUCCESS_RESPONSE_BYTES : MAX_ERROR_RESPONSE_BYTES;
			const chunks: Buffer[] = [];
			let totalBytes = 0;
			let truncated = false;
			const resolveBufferedResponse = () => {
				if (settled) return;
				const text = Buffer.concat(chunks).toString("utf8") + (truncated ? "…" : "");
				finishResolve(new Response([204, 205, 304].includes(status) ? null : text, {
					status,
					headers: nodeResponseHeaders(response.headers),
				}));
			};
			response.on("data", (chunk: Buffer | string) => {
				if (settled) return;
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				if (totalBytes + buffer.length <= maxBytes) {
					chunks.push(buffer);
					totalBytes += buffer.length;
					return;
				}
				if (ok) {
					finishReject(new OpenAIWebSearchError(
						"protocol",
						"OpenAI Web Search returned an oversized response",
						{ fallbackEligible: true },
					));
					request.destroy();
					return;
				}
				const remaining = Math.max(0, maxBytes - totalBytes);
				if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
				totalBytes = maxBytes;
				truncated = true;
				resolveBufferedResponse();
				response.destroy();
				request.destroy();
			});
			response.on("end", resolveBufferedResponse);
			response.on("error", finishReject);
		});
		request.on("error", finishReject);
		request.end(body);
	});
}

async function readBoundedResponseText(response: Response, maxBytes: number, truncate: boolean): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let totalBytes = 0;
	let text = "";
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				if (!truncate) throw new Error("response body exceeded the size limit");
				const remaining = Math.max(0, maxBytes - (totalBytes - value.byteLength));
				text += decoder.decode(value.subarray(0, remaining), { stream: true });
				try { await reader.cancel(); } catch {}
				return `${text}${decoder.decode()}…`;
			}
			text += decoder.decode(value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		reader.releaseLock();
	}
}

function redactSecrets(value: string, secrets: string[]): string {
	let redacted = value;
	for (const secret of secrets) redacted = redactCredential(redacted, secret);
	return redacted.replace(/\s+/g, " ").trim().slice(0, 300);
}

function httpFailure(status: number, detail: string): OpenAIWebSearchError {
	if (status === 401 || status === 403) {
		return new OpenAIWebSearchError("authentication", `OpenAI Web Search authentication failed (HTTP ${status})`, { fallbackEligible: true, status });
	}
	if (status === 408) {
		return new OpenAIWebSearchError("timeout", `OpenAI Web Search timed out (HTTP ${status})`, { fallbackEligible: true, status });
	}
	if (status === 429) {
		return new OpenAIWebSearchError("rate-limit", `OpenAI Web Search was rate-limited (HTTP ${status})`, { fallbackEligible: true, status });
	}
	if (status >= 500) {
		return new OpenAIWebSearchError("server", `OpenAI Web Search server error (HTTP ${status})`, { fallbackEligible: true, status });
	}
	if (status >= 300 && status < 400) {
		return new OpenAIWebSearchError("security", `OpenAI Web Search refused an HTTP redirect (${status})`, { status });
	}
	if (status === 400 || status === 404 || status === 409 || status === 422) {
		return new OpenAIWebSearchError("capability", `OpenAI Web Search request is unsupported (HTTP ${status}): ${detail}`, { fallbackEligible: true, status });
	}
	return new OpenAIWebSearchError("capability", `OpenAI Web Search request failed (HTTP ${status}): ${detail}`, { fallbackEligible: true, status });
}

function domainMatches(hostname: string, domain: string): boolean {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}

function sourceViolatesDomainFilters(url: string, filters: NormalizedSearchDomainFilters): boolean {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return true;
	}
	if (filters.blocked.some(domain => domainMatches(hostname, domain))) return true;
	return filters.allowed.length > 0 && !filters.allowed.some(domain => domainMatches(hostname, domain));
}

function recencyConstraint(value: SearchOptions["recencyFilter"]): string {
	const periods: Record<string, string> = {
		day: "day",
		week: "week",
		month: "month",
		year: "year",
	};
	return value && periods[value]
		? `\n\nRecency constraint: prioritize sources published or updated within the past ${periods[value]}.`
		: "";
}

function isCallerAbort(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

export async function searchWithOpenAI(
	query: string,
	options: SearchOptions = {},
	runtime: OpenAIWebSearchRuntime = {},
): Promise<SearchResponse> {
	const normalizedQuery = query.trim();
	if (!normalizedQuery || normalizedQuery.length > 32_768) {
		throw new OpenAIWebSearchError("invalid-parameter", "OpenAI Web Search query must contain 1 to 32768 characters");
	}
	if (isCallerAbort(options.signal)) {
		throw new OpenAIWebSearchError("caller-abort", "OpenAI Web Search was cancelled");
	}
	const domainFilters = normalizeSearchDomainFilters(options.domainFilter);
	if (domainFilters.allowed.length > 100 || domainFilters.blocked.length > 100) {
		throw new OpenAIWebSearchError("capability", "OpenAI Web Search supports at most 100 allowed and 100 blocked domains", { fallbackEligible: true });
	}

	const config = resolveOpenAIConfig(runtime);
	if (!hasCredentialSource({
		provider: "OpenAI Web Search",
		configuredValue: config.apiKeySource,
		environmentValue: configuredEnvironmentApiKey(runtime),
	})) {
		throw new OpenAIWebSearchError("missing-credentials", "OpenAI Web Search credentials are not configured", { fallbackEligible: true });
	}
	const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
	const requestSignal = options.signal
		? AbortSignal.any([options.signal, timeoutSignal])
		: timeoutSignal;
	const activityId = activityMonitor.logStart({ type: "api", query: normalizedQuery, provider: "openai" });
	let endpoint: URL;
	let validatedAddresses: LookupAddress[] = [];
	try {
		endpoint = await resolveOpenAIResponsesEndpoint(config.baseUrl, {
			lookup: runtime.lookup,
			signal: requestSignal,
			onValidatedAddresses: addresses => { validatedAddresses = addresses; },
		});
	} catch (error) {
		const aborted = classifiedAbort(options.signal, timeoutSignal, error);
		if (aborted?.category === "caller-abort") activityMonitor.logComplete(activityId, 0);
		else activityMonitor.logError(activityId, aborted?.category ?? "endpoint security");
		if (aborted) throw aborted;
		throw error;
	}
	let headers: Record<string, string>;
	let secrets: string[];
	try {
		({ headers, secrets } = await resolveRequestHeaders(config, runtime, {
			request: requestSignal,
			caller: options.signal,
			timeout: timeoutSignal,
		}));
	} catch (error) {
		if (error instanceof OpenAIWebSearchError && error.category === "caller-abort") activityMonitor.logComplete(activityId, 0);
		else activityMonitor.logError(activityId, error instanceof OpenAIWebSearchError ? error.category : "credential error");
		throw error;
	}
	const webSearchTool: Record<string, unknown> = {
		type: "web_search",
		search_context_size: config.searchContextSize,
	};
	if (domainFilters.allowed.length > 0 || domainFilters.blocked.length > 0) {
		webSearchTool.filters = {
			...(domainFilters.allowed.length > 0 ? { allowed_domains: domainFilters.allowed } : {}),
			...(domainFilters.blocked.length > 0 ? { blocked_domains: domainFilters.blocked } : {}),
		};
	}
	const requestBody = {
		model: config.model,
		tools: [webSearchTool],
		tool_choice: "required",
		include: ["web_search_call.action.sources"],
		input: `${normalizedQuery}${recencyConstraint(options.recencyFilter)}`,
		stream: false,
		max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
	};
	const serializedRequestBody = JSON.stringify(requestBody);
	let response: Response;
	try {
		if (runtime.fetch) {
			response = await runtime.fetch(endpoint, {
				method: "POST",
				headers,
				body: serializedRequestBody,
				redirect: "manual",
				signal: requestSignal,
			});
		} else {
			const validatedAddress = validatedAddresses[0];
			if (!validatedAddress) {
				throw new OpenAIWebSearchError("security", "OpenAI Web Search endpoint has no validated destination address");
			}
			response = await requestWithPinnedAddress(endpoint, validatedAddress, headers, serializedRequestBody, requestSignal);
		}
	} catch (error) {
		if (isCallerAbort(options.signal)) {
			activityMonitor.logComplete(activityId, 0);
			throw new OpenAIWebSearchError("caller-abort", "OpenAI Web Search was cancelled", { cause: error });
		}
		if (timeoutSignal.aborted) {
			activityMonitor.logError(activityId, "timeout");
			throw new OpenAIWebSearchError("timeout", "OpenAI Web Search timed out", { fallbackEligible: true, cause: error });
		}
		if (error instanceof OpenAIWebSearchError) {
			activityMonitor.logError(activityId, error.category);
			throw error;
		}
		activityMonitor.logError(activityId, "network error");
		throw new OpenAIWebSearchError("network", "OpenAI Web Search network request failed", { fallbackEligible: true, cause: error });
	}

	let responseText: string;
	try {
		responseText = await readBoundedResponseText(
			response,
			response.ok ? MAX_SUCCESS_RESPONSE_BYTES : MAX_ERROR_RESPONSE_BYTES,
			!response.ok,
		);
	} catch (error) {
		if (isCallerAbort(options.signal)) {
			activityMonitor.logComplete(activityId, 0);
			throw new OpenAIWebSearchError("caller-abort", "OpenAI Web Search was cancelled", { cause: error });
		}
		if (timeoutSignal.aborted) {
			activityMonitor.logError(activityId, "timeout");
			throw new OpenAIWebSearchError("timeout", "OpenAI Web Search timed out", { fallbackEligible: true, cause: error });
		}
		activityMonitor.logError(activityId, "response body error");
		throw new OpenAIWebSearchError("protocol", "OpenAI Web Search returned an unreadable or oversized response", { fallbackEligible: true, cause: error });
	}
	if (!response.ok) {
		const detail = redactSecrets(responseText, secrets);
		activityMonitor.logError(activityId, `HTTP ${response.status}`);
		throw httpFailure(response.status, detail);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(responseText);
	} catch (error) {
		activityMonitor.logError(activityId, "invalid JSON");
		throw new OpenAIWebSearchError("protocol", "OpenAI Web Search returned invalid JSON", { fallbackEligible: true, cause: error });
	}
	const normalized = normalizeOpenAIWebSearchResponse(payload, { numResults: 20 });
	if (normalized.results.some(result => sourceViolatesDomainFilters(result.url, domainFilters))) {
		activityMonitor.logError(activityId, "domain filter mismatch");
		throw new OpenAIWebSearchError("capability", "OpenAI Web Search did not honor the requested domain filters", { fallbackEligible: true });
	}
	if (normalized.results.length === 0) {
		activityMonitor.logError(activityId, "no attributable sources");
		throw new OpenAIWebSearchError("no-sources", "OpenAI Web Search returned no attributable sources", { fallbackEligible: true });
	}
	activityMonitor.logComplete(activityId, response.status);
	return {
		...normalized,
		results: normalized.results.slice(0, normalizeSearchResultCount(options.numResults)),
	};
}
