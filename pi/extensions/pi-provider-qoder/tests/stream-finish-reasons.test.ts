import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Synthetic SSE; never use real credentials, model caches or HTTP endpoints.
const home = mkdtempSync(join(tmpdir(), "qoder-stream-finish-"));
const previousHome = process.env.HOME;
process.env.HOME = home;
const { streamQoder } = await import("../stream.ts");
const { staticCnModels } = await import("../models.ts");
const model = staticCnModels.find((m) => m.id === "glm-5.3")!;
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

const token = "synthetic-finish-token";
const frame = (body: unknown, statusCodeValue = 200) =>
  `data: ${JSON.stringify({ statusCodeValue, body: JSON.stringify(body) })}\n\n`;
const choice = (finish_reason: unknown, delta: unknown = {}) => ({ choices: [{ delta, finish_reason }] });
const tool = (args: string, index = 0) => ({
  index, id: `call-${index}`, function: { name: "lookup", arguments: args },
});

async function run(chunks: unknown[], error = false) {
  globalThis.fetch = async () => new Response(chunks.map((chunk) => frame(chunk)).join("") +
    (error ? frame({ message: "upstream unavailable" }, 503) : "data: [DONE]\n\n"));
  const stream = streamQoder(model, { messages: [] }, { apiKey: token });
  const events = [];
  for await (const event of stream) events.push(structuredClone(event));
  return { events, message: await stream.result() };
}

function assertDone(result: Awaited<ReturnType<typeof run>>, reason: "stop" | "length" | "toolUse") {
  assert.equal(result.message.stopReason, reason);
  const terminal = result.events.filter((e) => e.type === "done" || e.type === "error");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].type, "done");
  assert.equal(terminal[0].reason, reason);
}

test("normal stop and end map to Pi stop", async () => {
  for (const reason of ["stop", "end"]) {
    const result = await run([choice(reason, { content: "ok" })]);
    assertDone(result, "stop");
    assert.deepEqual(result.message.content, [{ type: "text", text: "ok" }]);
  }
});

test("length survives text finalization and a usage-only tail", async () => {
  const result = await run([
    choice("length", { content: "truncated text <" }),
    { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
  ]);
  assertDone(result, "length");
  assert.equal(result.message.usage.totalTokens, 30);
  // A trailing possible thinking-tag prefix is flushed during finalization.
  assert.deepEqual(result.message.content, [{ type: "text", text: "truncated text <" }]);
});

test("tool_calls and legacy function_call map to toolUse", async () => {
  for (const reason of ["tool_calls", "function_call"]) {
    const result = await run([choice(reason, { tool_calls: [tool('{"q":"ok"}')] })]);
    assertDone(result, "toolUse");
    assert.deepEqual(result.message.content, [{ type: "toolCall", id: "call-0", name: "lookup", arguments: { q: "ok" } }]);
    assert.equal(result.events.filter((e) => e.type === "toolcall_end").length, 1);
  }
});

test("length takes priority over complete or incomplete tool arguments", async () => {
  for (const args of ['{"q":"ok"}', '{"q":"unfinished']) {
    const result = await run([choice("length", { tool_calls: [tool(args)] })]);
    assertDone(result, "length");
    assert.equal(result.message.content[0].type, "toolCall");
    assert.equal(result.events.filter((e) => e.type === "toolcall_end").length, 1);
  }
});

test("length takes priority over a parallel tool batch", async () => {
  const result = await run([choice("length", { tool_calls: [tool("{}"), tool('{"q":', 2)] })]);
  assertDone(result, "length");
  assert.equal(result.message.content.filter((c) => c.type === "toolCall").length, 2);
});

test("length is not erased by later stop or tool finish markers", async () => {
  for (const reason of ["stop", "tool_calls", "function_call", null, ""]) {
    assertDone(await run([choice("length", { content: "partial" }), choice(reason)]), "length");
  }
  assertDone(await run([choice("tool_calls", { tool_calls: [tool("{}")] }), choice("length")]), "length");
});

test("missing reasons fall back by emitted content, not sparse tool state", async () => {
  for (const reason of [undefined, null, ""]) {
    assertDone(await run([choice(reason, { content: "text" })]), "stop");
    assertDone(await run([choice(reason, { tool_calls: [tool("{}", 3)] })]), "toolUse");
    // A header with no argument block has not emitted a ToolCall.
    assertDone(await run([choice(reason, { tool_calls: [tool("", 3)] })]), "stop");
  }
  assertDone(await run([]), "stop");
});

test("existing tool content still produces toolUse when upstream reports stop", async () => {
  assertDone(await run([choice("stop", { tool_calls: [tool("{}")] })]), "toolUse");
});

test("explicit tool finish without content remains a legal toolUse event", async () => {
  assertDone(await run([choice("tool_calls")]), "toolUse");
});

test("content_filter, network_error and unknown reasons emit error, never done", async () => {
  for (const reason of ["content_filter", "network_error", "future_reason", "pending", "deferred", 0, false, { bad: true }]) {
    const result = await run([choice(reason, { content: "partial" })]);
    assert.equal(result.message.stopReason, "error");
    assert.match(result.message.errorMessage!, /finish_reason/);
    assert.equal(result.events.filter((e) => e.type === "error").length, 1);
    assert.equal(result.events.some((e) => e.type === "done"), false);
  }
});

test("unknown finish errors are redacted and dominate preceding length", async () => {
  const result = await run([choice("length"), choice(`unknown ${token}`)]);
  assert.equal(result.message.stopReason, "error");
  assert.ok(!JSON.stringify(result.message).includes(token));
  assert.equal(result.events.some((e) => e.type === "done"), false);
});

test("upstream business errors still dominate length and preserve partial content", async () => {
  const result = await run([choice("length", { content: "partial" })], true);
  assert.equal(result.message.stopReason, "error");
  assert.match(result.message.errorMessage!, /503/);
  assert.deepEqual(result.message.content, [{ type: "text", text: "partial" }]);
  assert.equal(result.events.some((e) => e.type === "done"), false);
});
