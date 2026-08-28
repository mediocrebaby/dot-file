// Optional live contract probe for OpenAI Responses web_search and CLIProxyAPI.
// Secrets are read only from environment variables and never written to output.
//
// Direct OpenAI example:
//   OPENAI_WEB_SEARCH_PROBE_API_KEY="$OPENAI_API_KEY" \
//   OPENAI_WEB_SEARCH_PROBE_MODELS="gpt-5.6" \
//   node evidence/openai-web-search-contract-probe.mjs
//
// CLIProxyAPI v7.2.144 example:
//   OPENAI_WEB_SEARCH_PROBE_BASE_URL="http://127.0.0.1:8317/v1" \
//   OPENAI_WEB_SEARCH_PROBE_API_KEY="$CLIPROXYAPI_API_KEY" \
//   OPENAI_WEB_SEARCH_PROBE_MODELS="gpt-5.5,gpt-5.6-sol" \
//   node evidence/openai-web-search-contract-probe.mjs

import { lookup as dnsLookup } from "node:dns/promises";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.OPENAI_WEB_SEARCH_PROBE_BASE_URL?.trim() || "https://api.openai.com/v1";
const apiKey = process.env.OPENAI_WEB_SEARCH_PROBE_API_KEY?.trim() || "";
const models = (process.env.OPENAI_WEB_SEARCH_PROBE_MODELS || "gpt-5.6")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const outputPath = process.env.OPENAI_WEB_SEARCH_PROBE_OUTPUT?.trim()
  || fileURLToPath(new URL("./OPENAI-WEB-SEARCH-CONTRACT-EVIDENCE.json", import.meta.url));
const extraHeadersSource = process.env.OPENAI_WEB_SEARCH_PROBE_EXTRA_HEADERS_JSON?.trim() || "{}";
const timeoutMs = 30_000;

if (!apiKey) {
  console.error("OPENAI_WEB_SEARCH_PROBE_API_KEY is required. The probe will not read auth.json, browser cookies, or Pi model credentials.");
  process.exit(1);
}
if (models.length === 0) {
  console.error("OPENAI_WEB_SEARCH_PROBE_MODELS must contain at least one model.");
  process.exit(1);
}

function hasLiteralLoopbackAuthority(rawUrl) {
  const authority = rawUrl.match(/^http:\/\/([^/?#]+)/i)?.[1] || "";
  return /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(authority) || /^\[::1\](?::\d+)?$/i.test(authority);
}

const blockedProbeEndpoints = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blockedProbeEndpoints.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["5f00::", 16],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) blockedProbeEndpoints.addSubnet(network, prefix, "ipv6");

function blockedIPv4(address) {
  return blockedProbeEndpoints.check(address, "ipv4");
}

function blockedIPv6(address) {
  const firstHextet = Number.parseInt(address.split(":", 1)[0] || "", 16);
  return !Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff || blockedProbeEndpoints.check(address, "ipv6");
}

function assertPublicAddress(address, hostname) {
  const family = net.isIP(address);
  if (family === 4 && blockedIPv4(address)) throw new Error(`Probe endpoint resolves to a blocked IPv4 address: ${hostname}`);
  if (family === 6 && blockedIPv6(address)) throw new Error(`Probe endpoint resolves to a blocked IPv6 address: ${hostname}`);
  if (family === 0) throw new Error(`Probe endpoint resolved a non-IP address: ${hostname}`);
  return { address, family };
}

async function endpointFor(rawBaseUrl) {
  const trimmed = rawBaseUrl.trim();
  const pathInput = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").split(/[?#]/, 1)[0];
  if (!trimmed || trimmed.includes("\\") || /(?:^|\/)\.{1,2}(?:\/|$)/.test(pathInput) || /%(?:2e|2f|5c)/i.test(pathInput)) {
    throw new Error("Probe base URL contains an unsafe path");
  }
  const url = new URL(trimmed);
  if (url.username || url.password || url.search || url.hash || url.port === "0") {
    throw new Error("Probe base URL must not contain credentials, query parameters, fragments, or port 0");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = (net.isIP(hostname) === 4 && hostname.startsWith("127.")) || hostname === "::1";
  if (url.protocol === "http:" && (!loopback || !hasLiteralLoopbackAuthority(trimmed))) {
    throw new Error("Plain HTTP probe endpoints are limited to literal loopback addresses");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Probe endpoint must use HTTPS, or HTTP on literal loopback");
  }
  let validatedAddress;
  if (url.protocol === "https:") {
    if (net.isIP(hostname)) {
      validatedAddress = assertPublicAddress(hostname, hostname);
    } else {
      const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
      if (addresses.length === 0) throw new Error(`Probe endpoint returned no DNS addresses: ${hostname}`);
      const validated = addresses.map(({ address }) => assertPublicAddress(address, hostname));
      validatedAddress = validated[0];
    }
  } else {
    validatedAddress = { address: hostname, family: net.isIP(hostname) };
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/responses") ? path : `${path}/responses`;
  return { url, validatedAddress };
}

function extraHeaders() {
  let parsed;
  try {
    parsed = JSON.parse(extraHeadersSource);
  } catch {
    throw new Error("OPENAI_WEB_SEARCH_PROBE_EXTRA_HEADERS_JSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OPENAI_WEB_SEARCH_PROBE_EXTRA_HEADERS_JSON must be an object");
  }
  const allowed = new Set(["openai-organization", "openai-project", "x-openai-actor-authorization"]);
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(parsed)) {
    const name = rawName.toLowerCase();
    if (!allowed.has(name) || typeof rawValue !== "string" || /[\r\n\0]/.test(rawValue)) {
      throw new Error(`Disallowed or invalid probe header: ${rawName}`);
    }
    headers[name] = rawValue;
  }
  return headers;
}

const { url: endpoint, validatedAddress } = await endpointFor(baseUrl);
const targetKind = endpoint.hostname.toLowerCase() === "api.openai.com" ? "openai-managed" : "openai-compatible-gateway";
const targetVersion = process.env.OPENAI_WEB_SEARCH_PROBE_TARGET_VERSION?.trim()
  || (targetKind === "openai-managed" ? "managed-service" : "");
if (!targetVersion) {
  throw new Error("OPENAI_WEB_SEARCH_PROBE_TARGET_VERSION is required for gateway probes (for example, v7.2.144)");
}
if (!/^[A-Za-z0-9._+-]{1,80}$/.test(targetVersion)) {
  throw new Error("OPENAI_WEB_SEARCH_PROBE_TARGET_VERSION must be a short version identifier");
}
const configuredExtraHeaders = extraHeaders();
const invalidProbeToken = "invalid-probe-token";
const secrets = [apiKey, invalidProbeToken, ...Object.values(configuredExtraHeaders)].filter(Boolean);

function redact(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of secrets) text = text.split(secret).join("[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

function hostname(value) {
  try { return new URL(value).hostname; }
  catch { return null; }
}

function summarizeResponse(status, elapsedMs, payload, aborted = false) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const eventTypes = output.map(item => item?.type).filter(value => typeof value === "string");
  const sourceHosts = [];
  const citationHosts = [];
  for (const item of output) {
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
      const host = hostname(source?.url);
      if (host && !sourceHosts.includes(host)) sourceHosts.push(host);
    }
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type !== "url_citation") continue;
        const host = hostname(annotation.url);
        if (host && !citationHosts.includes(host)) citationHosts.push(host);
      }
    }
  }
  return {
    status,
    elapsedMs,
    aborted,
    topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload).sort() : [],
    eventTypes,
    sourceHosts,
    citationHosts,
    sourceCount: sourceHosts.length,
    citationCount: citationHosts.length,
    responseStatus: typeof payload?.status === "string" ? payload.status : null,
    error: payload?.error ? redact(payload.error) : null,
  };
}

function pinnedPost(headers, body, signal) {
  return new Promise((resolve, reject) => {
    const requestImpl = endpoint.protocol === "https:" ? https.request : http.request;
    const request = requestImpl(endpoint, {
      method: "POST",
      headers: { ...headers, "content-length": String(Buffer.byteLength(body, "utf8")) },
      signal,
      ...(endpoint.protocol === "https:" ? {
        servername: net.isIP(endpoint.hostname.replace(/^\[|\]$/g, "")) ? undefined : endpoint.hostname,
        autoSelectFamily: false,
        family: validatedAddress.family,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: validatedAddress.address, family: validatedAddress.family }]);
          else callback(null, validatedAddress.address, validatedAddress.family);
        },
      } : {}),
    }, response => {
      const chunks = [];
      let total = 0;
      response.on("data", chunk => {
        total += chunk.length;
        if (total > 2 * 1024 * 1024) {
          request.destroy(new Error("Probe response exceeded 2 MiB"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function call(body, { authorization = apiKey, abortAfterMs = null, includeExtraHeaders = true } = {}) {
  const controller = new AbortController();
  const timer = abortAfterMs === null
    ? setTimeout(() => controller.abort(), timeoutMs)
    : setTimeout(() => controller.abort(), abortAfterMs);
  const startedAt = Date.now();
  try {
    const response = await pinnedPost({
      accept: "application/json",
      "content-type": "application/json",
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
      ...(includeExtraHeaders ? configuredExtraHeaders : {}),
    }, JSON.stringify(body), controller.signal);
    const text = response.text;
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: `non-json response: ${text.slice(0, 200)}` };
    }
    return summarizeResponse(response.status, Date.now() - startedAt, payload);
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      status: null,
      elapsedMs: Date.now() - startedAt,
      aborted,
      topLevelKeys: [],
      eventTypes: [],
      sourceHosts: [],
      citationHosts: [],
      sourceCount: 0,
      citationCount: 0,
      responseStatus: null,
      error: aborted ? "client-abort" : redact(error instanceof Error ? error.message : error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const query = "Search the web for the current stable Go release and cite the official source.";
const records = [];
for (const model of models) {
  const baseBody = {
    model,
    tools: [{ type: "web_search", search_context_size: "low" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: query,
    stream: false,
    max_output_tokens: 800,
  };
  records.push({ model, case: "baseline-with-sources", result: await call(baseBody) });
  records.push({
    model,
    case: "allowed-and-blocked-domains",
    result: await call({
      ...baseBody,
      tools: [{
        type: "web_search",
        search_context_size: "low",
        filters: { allowed_domains: ["go.dev"], blocked_domains: ["reddit.com"] },
      }],
    }),
  });
  records.push({
    model,
    case: "empty-or-no-match-sources",
    result: await call({
      ...baseBody,
      tools: [{
        type: "web_search",
        search_context_size: "low",
        filters: { allowed_domains: ["this-domain-should-not-exist.example"] },
      }],
      input: "Find a current source only on this-domain-should-not-exist.example and cite it.",
    }),
  });
  records.push({ model, case: "missing-authorization", result: await call(baseBody, { authorization: null, includeExtraHeaders: false }) });
  records.push({ model, case: "invalid-authorization", result: await call(baseBody, { authorization: invalidProbeToken, includeExtraHeaders: false }) });
  records.push({ model, case: "client-cancel", result: await call(baseBody, { abortAfterMs: 250 }) });
}

const baselineRecords = records.filter(record => record.case === "baseline-with-sources");
const baselineVerified = baselineRecords.length === models.length && baselineRecords.every(record =>
  record.result.status >= 200 && record.result.status < 300 && record.result.sourceCount > 0
);
const evidence = {
  generatedAt: new Date().toISOString(),
  endpoint: `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`,
  targetKind,
  targetVersion,
  wireApi: "OpenAI Responses v1 / non-streaming web_search",
  verificationStatus: baselineVerified ? "baseline-passed" : "inconclusive",
  models,
  stream: false,
  records,
  notes: [
    "Payload text and full URLs are intentionally omitted.",
    "Only status, event types, source hostnames, citation hostnames, response status, and bounded redacted errors are retained.",
    "A successful run certifies only this exact endpoint deployment and model list, not all CLIProxyAPI versions or model aliases.",
  ],
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
for (const secret of secrets) {
  if (secret && serialized.includes(secret)) throw new Error("A configured secret would appear in probe output; refusing to write evidence");
}
await writeFile(outputPath, serialized, "utf8");
console.log(`Wrote sanitized contract evidence: ${outputPath}`);
if (!baselineVerified) {
  console.error("Probe baseline was inconclusive; the live contract ticket must remain open.");
  process.exitCode = 2;
}
