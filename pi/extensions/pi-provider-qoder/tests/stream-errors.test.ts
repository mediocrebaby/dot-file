import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Synthetic SSE only. Isolate auth/model caches before loading the provider.
const home = mkdtempSync(join(tmpdir(), "qoder-stream-errors-"));
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

const token = "synthetic-secret-token";
const frame = (body: unknown, statusCodeValue: unknown = 200) =>
  `data: ${JSON.stringify({ statusCodeValue, body: typeof body === "string" ? body : JSON.stringify(body) })}\n\n`;
const textFrame = (text: string, status: unknown = 200) =>
  frame({ choices: [{ delta: { content: text } }] }, status);
const errorFrame = (status: unknown = 429) => frame({ message: "quota exceeded" }, status);

function mockResponse(chunks: string[], options: { open?: boolean; abort?: AbortController } = {}) {
  let cancelled = false;
  globalThis.fetch = async (_url, init) => {
    init?.signal?.throwIfAborted();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        if (options.abort) {
          options.abort.signal.addEventListener("abort", () => controller.error(options.abort!.signal.reason), { once: true });
        }
        if (!options.open) controller.close();
      },
      cancel() { cancelled = true; },
    });
    return new Response(body, { status: 200 });
  };
  return () => cancelled;
}

async function collect(signal?: AbortSignal) {
  const stream = streamQoder(model, { messages: [] }, { apiKey: token, signal });
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, message: await stream.result() };
}

function assertError(result: Awaited<ReturnType<typeof collect>>, reason = "error") {
  assert.equal(result.message.stopReason, reason);
  assert.equal(result.events.filter((e) => e.type === "error").length, 1);
  assert.equal(result.events.filter((e) => e.type === "done").length, 0);
}

test("first-frame upstream error produces one error, preserves code and details", async () => {
  mockResponse([errorFrame()], { open: true });
  const result = await collect();
  assertError(result);
  assert.match(result.message.errorMessage!, /429.*quota exceeded/);
});

test("mid-stream business error preserves partial text and cancels the reader", async () => {
  const cancelled = mockResponse([textFrame("partial"), errorFrame("503"), textFrame("must not appear")]);
  const result = await collect();
  assertError(result);
  assert.deepEqual(result.message.content, [{ type: "text", text: "partial" }]);
  assert.match(result.message.errorMessage!, /503/);
  assert.equal(cancelled(), true);
});

test("both numeric and string 200 finish successfully", async () => {
  mockResponse([textFrame("one", 200), textFrame("two", "200"), "data: [DONE]\n\n"]);
  const result = await collect();
  assert.equal(result.message.stopReason, "stop");
  assert.deepEqual(result.message.content, [{ type: "text", text: "onetwo" }]);
  assert.equal(result.events.filter((e) => e.type === "done").length, 1);
  assert.equal(result.events.filter((e) => e.type === "error").length, 0);
});

test("normal EOF tolerates malformed JSON and fragmented CRLF frames", async () => {
  const valid = textFrame("正常输出").replaceAll("\n", "\r\n");
  mockResponse(["data: {broken\n\n", frame("{broken"), valid.slice(0, 19), valid.slice(19)]);
  const result = await collect();
  assert.equal(result.message.stopReason, "stop");
  assert.deepEqual(result.message.content, [{ type: "text", text: "正常输出" }]);
  assert.equal(result.events.filter((e) => e.type === "done").length, 1);
});

test("malformed JSON is skipped without swallowing the following business error", async () => {
  mockResponse(["data: {broken\n\n", frame("{broken"), "data: null\n\n", errorFrame(0)]);
  const result = await collect();
  assertError(result);
  assert.match(result.message.errorMessage!, /status 0.*quota exceeded/);
});

test("error details support an object body and envelope message fallback", async () => {
  for (const envelope of [
    { statusCodeValue: 403, body: { message: "access denied" } },
    { statusCodeValue: 403, message: "access denied" },
  ]) {
    mockResponse([`data: ${JSON.stringify(envelope)}\n\n`]);
    const result = await collect();
    assertError(result);
    assert.match(result.message.errorMessage!, /403.*access denied/);
  }
});

test("business errors redact credentials and signed request headers", async () => {
  globalThis.fetch = async (_url, init) => {
    const headers = init!.headers as Record<string, string>;
    return new Response(frame({
      message: `rejected ${token}`,
      authorization: headers.Authorization,
      "Cosy-Key": headers["Cosy-Key"],
      access_token: "another-secret",
      refresh_token: "refresh-secret",
    }, 401));
  };
  const result = await collect();
  assertError(result);
  assert.match(result.message.errorMessage!, /401.*rejected/);
  for (const secret of [token, "COSY.", "another-secret", "refresh-secret"]) {
    assert.ok(!result.message.errorMessage!.includes(secret));
  }
});

test("HTTP errors also redact the supplied access token", async () => {
  globalThis.fetch = async () => new Response(`invalid token ${token}`, { status: 401 });
  const result = await collect();
  assertError(result);
  assert.ok(!result.message.errorMessage!.includes(token));
});

test("DONE markers stop parsing later frames and cancel an open response", { timeout: 2000 }, async () => {
  for (const done of ["data: [DONE]\n\n", frame("[DONE]")]) {
    const cancelled = mockResponse([textFrame("ok") + done + errorFrame()], { open: true });
    const result = await collect();
    assert.equal(result.message.stopReason, "stop");
    assert.equal(cancelled(), true);
  }
});

test("abort before request returns only an aborted terminal event", async () => {
  const controller = new AbortController();
  controller.abort();
  mockResponse([]);
  assertError(await collect(controller.signal), "aborted");
});

test("abort while reading preserves partial output and never emits done", async () => {
  const controller = new AbortController();
  mockResponse([textFrame("partial")], { open: true, abort: controller });
  const stream = streamQoder(model, { messages: [] }, { apiKey: token, signal: controller.signal });
  const events = [];
  for await (const event of stream) {
    events.push(event);
    if (event.type === "text_delta") controller.abort();
  }
  assertError({ events, message: await stream.result() }, "aborted");
});
