import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { QoderModelEntry } from "../models.ts";

// Synthetic catalog, credentials and SSE only. Inspect the actual encoded request.
const home = mkdtempSync(join(tmpdir(), "qoder-stream-reasoning-"));
const previousHome = process.env.HOME;
process.env.HOME = home;
const { streamQoder } = await import("../stream.ts");
const { staticCnModels } = await import("../models.ts");
const model = staticCnModels.find((m) => m.id === "glm-5.3")!;
const originalFetch = globalThis.fetch;
const cacheDir = join(home, ".pi", "agent");
mkdirSync(cacheDir, { recursive: true });
after(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

function decodeRequest(body: unknown) {
  assert.ok(Buffer.isBuffer(body));
  const custom = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
  const standard = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const rotated = [...body.toString("ascii")].map((c) => c === "$" ? "=" : standard[custom.indexOf(c)]).join("");
  const part = Math.floor(rotated.length / 3);
  const base64 = rotated.slice(-part) + rotated.slice(part, -part) + rotated.slice(0, part);
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

const catalog: QoderModelEntry = {
  key: "gmodel", is_reasoning: true, max_output_tokens: 32768,
  thinking_config: { enabled: { efforts: { low: {}, medium: {}, high: {}, xhigh: {}, max: {} } } },
};

type Options = NonNullable<Parameters<typeof streamQoder>[2]>;
async function run(options: Record<string, unknown> = {}, config: QoderModelEntry | null = catalog, id = model.id) {
  const cachePath = join(cacheDir, "qoder-cn-models-cache.json");
  if (config) writeFileSync(cachePath, JSON.stringify({ configs: { [config.key!]: config } }));
  else rmSync(cachePath, { force: true });
  const requests: ReturnType<typeof decodeRequest>[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(decodeRequest(init?.body));
    const inner = { choices: [{ delta: { content: "<think>analysis</think>answer", reasoning_content: "api reasoning" } }] };
    return new Response(`data: ${JSON.stringify({ statusCodeValue: 200, body: JSON.stringify(inner) })}\n\ndata: [DONE]\n\n`);
  };
  // Runtime-only off/false and invalid values deliberately cross the normal Pi type boundary.
  const stream = streamQoder({ ...model, id }, { messages: [] }, { apiKey: "synthetic-token", ...options } as Options);
  const events = [];
  for await (const event of stream) events.push(event);
  return { requests, events, message: await stream.result() };
}

test("maps Pi efforts into the encoded parameters, minimal uses low", async () => {
  for (const [pi, upstream] of [["minimal", "low"], ["low", "low"], ["medium", "medium"], ["high", "high"], ["xhigh", "xhigh"], ["max", "max"]]) {
    const result = await run({ reasoning: pi, maxTokens: 123 });
    assert.equal(result.message.stopReason, "stop");
    assert.equal(result.requests.length, 1);
    assert.deepEqual(result.requests[0].parameters, { max_tokens: 123, reasoning_effort: upstream });
  }
});

test("unspecified effort preserves server default even when catalog marks a default", async () => {
  const config = { ...catalog, thinking_config: { enabled: { efforts: { high: { is_default: true } }, is_default: true } } };
  const result = await run({}, config);
  assert.equal(result.message.stopReason, "stop");
  assert.equal(Object.hasOwn(result.requests[0].parameters, "reasoning_effort"), false);
});

test("rejects an unsupported effort before sending HTTP rather than silently choosing another", async () => {
  const config = { ...catalog, thinking_config: { enabled: { efforts: { low: {}, high: {}, max: {} } } } };
  for (const reasoning of ["medium", "xhigh"]) {
    const result = await run({ reasoning }, config);
    assert.equal(result.message.stopReason, "error");
    assert.match(result.message.errorMessage!, /reasoning effort.*not supported/i);
    assert.equal(result.requests.length, 0);
    assert.equal(result.events.some((e) => e.type === "done"), false);
  }
});

test("non-reasoning models keep default requests but reject explicit reasoning", async () => {
  const config = { key: "gmodel", is_reasoning: false };
  assert.equal((await run({}, config)).message.stopReason, "stop");
  const result = await run({ reasoning: "high" }, config);
  assert.equal(result.message.stopReason, "error");
  assert.equal(result.requests.length, 0);
});

test("reasoning flag alone does not establish configurable effort levels", async () => {
  for (const efforts of [undefined, null, [], ["high"], "high", {}]) {
    const config = { ...catalog, thinking_config: { enabled: { efforts } } };
    const result = await run({ reasoning: "high" }, config);
    assert.equal(result.message.stopReason, "error");
    assert.equal(result.requests.length, 0);
    assert.equal((await run({}, config)).message.stopReason, "stop");
  }
});

test("Kimi thinking_config supports effort even with raw is_reasoning false", async () => {
  const config = { ...catalog, key: "kmodel_latest", is_reasoning: false };
  const result = await run({ reasoning: "high" }, config, "kimi-k3");
  assert.equal(result.message.stopReason, "stop");
  assert.equal(result.requests[0].parameters.reasoning_effort, "high");
  assert.equal(result.requests[0].model_config.key, "kmodel_latest");
  assert.equal(result.requests[0].model_config.is_reasoning, false);
});

test("missing cache uses advertised static efforts without guessing capabilities", async () => {
  for (const id of ["glm-5.3", "kimi-k3"]) {
    const result = await run({ reasoning: "high" }, null, id);
    assert.equal(result.message.stopReason, "stop");
    assert.equal(result.requests[0].parameters.reasoning_effort, "high");
  }
  const unknownEfforts = await run({ reasoning: "high" }, null, "deepseek-v4-pro");
  assert.equal(unknownEfforts.message.stopReason, "error");
  assert.equal(unknownEfforts.requests.length, 0);
});

test("off and false fail explicitly even if catalog advertises disabled support", async () => {
  const config = { ...catalog, thinking_config: { ...catalog.thinking_config, disabled: {} } };
  for (const reasoning of ["off", false]) {
    const result = await run({ reasoning }, config);
    assert.equal(result.message.stopReason, "error");
    assert.match(result.message.errorMessage!, /disabling.*not verified/i);
    assert.equal(result.requests.length, 0);
  }
});

test("local tag parsing is independent of reasoning generation and API thinking", async () => {
  const result = await run({ reasoning: "high", parseThinkingTags: false });
  assert.equal(result.requests[0].parameters.reasoning_effort, "high");
  assert.deepEqual(result.message.content, [
    { type: "thinking", thinking: "api reasoning" },
    { type: "text", text: "<think>analysis</think>answer" },
  ]);
  const parsed = await run({ reasoning: "high" });
  assert.ok(parsed.message.content.some((c) => c.type === "thinking" && c.thinking === "analysis"));
  assert.ok(parsed.message.content.some((c) => c.type === "text" && c.text === "answer"));
});

test("local parsing can be disabled while leaving upstream generation at its default", async () => {
  const result = await run({ parseThinkingTags: false });
  assert.equal(result.message.stopReason, "stop");
  assert.equal(Object.hasOwn(result.requests[0].parameters, "reasoning_effort"), false);
  assert.ok(result.message.content.some((c) => c.type === "text" && c.text.includes("<think>")));
});

test("unknown runtime effort cannot pass through into upstream parameters", async () => {
  for (const reasoning of ["none", "enabled", "__proto__", "constructor", 1, true]) {
    const result = await run({ reasoning });
    assert.equal(result.message.stopReason, "error");
    assert.equal(result.requests.length, 0);
  }
});
