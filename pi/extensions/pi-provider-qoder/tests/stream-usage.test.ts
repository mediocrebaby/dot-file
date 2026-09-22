import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// All usage payloads below are synthetic, not captured Qoder responses.
const home = mkdtempSync(join(tmpdir(), "qoder-stream-usage-"));
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

const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
const expected = (input = 0, output = 0, cacheRead = 0, cacheWrite = 0, totalTokens = 0) =>
  ({ input, output, cacheRead, cacheWrite, totalTokens, cost });
const envelope = (body: unknown, statusCodeValue = 200) =>
  `data: ${JSON.stringify({ statusCodeValue, body: JSON.stringify(body) })}\n\n`;

async function run(chunks: unknown[], error = false, abort = false) {
  const controller = new AbortController();
  globalThis.fetch = async () => {
    const data = chunks.map((chunk) => envelope(chunk)).join("");
    if (abort) {
      return new Response(new ReadableStream<Uint8Array>({
        start(body) {
          body.enqueue(new TextEncoder().encode(data));
          controller.signal.addEventListener("abort", () => body.error(controller.signal.reason), { once: true });
        },
      }));
    }
    return new Response(data + (error ? envelope({ message: "quota exceeded" }, 429) : "data: [DONE]\n\n"));
  };
  const stream = streamQoder(model, { messages: [] }, { apiKey: "synthetic-token", signal: controller.signal });
  const events = [];
  for await (const event of stream) {
    // Copy now: Pi events deliberately share the mutable partial message.
    events.push(structuredClone(event));
    if (abort && event.type === "text_delta") controller.abort();
  }
  return { events, message: await stream.result() };
}

const usage = {
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  prompt_tokens_details: { cached_tokens: 30, cacheable_tokens: 10 },
};

test("maps prompt, output, cache read/write and total before emitting text", async () => {
  const result = await run([{ usage, choices: [{ delta: { content: "hello" } }] }]);
  assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
  const delta = result.events.find((e) => e.type === "text_delta");
  assert.ok(delta && delta.type === "text_delta");
  assert.deepEqual(delta.partial.usage, result.message.usage);
  assert.equal(result.message.stopReason, "stop");
});

test("usage-only frames work without choices, with empty choices or null choices", async () => {
  for (const choices of [undefined, [], null]) {
    const result = await run([{ usage, choices }]);
    assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
    assert.equal(result.events.at(-1)?.type, "done");
  }
});

test("final usage-only frame after finish_reason reaches the done message", async () => {
  const result = await run([
    { choices: [{ delta: { content: "done" } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
    { usage },
  ]);
  const done = result.events.at(-1);
  assert.ok(done && done.type === "done");
  assert.deepEqual(done.message.usage, expected(60, 20, 30, 10, 120));
});

test("cache-only statistics remain visible without inventing prompt tokens", async () => {
  const result = await run([{ usage: { prompt_tokens_details: { cached_tokens: 30, cacheable_tokens: 10 } } }]);
  assert.deepEqual(result.message.usage, expected(0, 0, 30, 10));
});

test("malformed cache details do not hide usable top-level counts", async () => {
  for (const details of [null, [], "bad", { cached_tokens: "30", cacheable_tokens: -1 }]) {
    const result = await run([{ usage: {
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
      prompt_cache_hit_tokens: 30, prompt_tokens_details: details,
    } }]);
    assert.deepEqual(result.message.usage, expected(70, 20, 30, 0, 120));
  }
});

test("repeated and revised cumulative snapshots replace counts rather than add", async () => {
  const newer = { ...usage, prompt_tokens: 200, completion_tokens: 40, total_tokens: 240 };
  const result = await run([{ usage }, { usage }, { usage: newer }, { usage: newer }]);
  assert.deepEqual(result.message.usage, expected(160, 40, 30, 10, 240));
  // A lower authoritative revision is not converted into a maximum or delta.
  const revised = await run([{ usage: newer }, { usage }]);
  assert.deepEqual(revised.message.usage, expected(60, 20, 30, 10, 120));
});

test("partial snapshots preserve earlier counts without subtracting caches twice", async () => {
  const result = await run([
    { usage: { prompt_tokens: 100, completion_tokens: 10 } },
    { usage: { prompt_tokens_details: { cached_tokens: 30, cacheable_tokens: 10 } } },
    { usage: { completion_tokens: 20, total_tokens: 120 } },
    { usage: { total_tokens: 120 } },
  ]);
  assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
});

test("cache hit alias works, but a valid nested zero takes precedence", async () => {
  const base = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_cache_hit_tokens: 30 };
  assert.deepEqual((await run([{ usage: base }])).message.usage, expected(70, 20, 30, 0, 120));
  assert.deepEqual((await run([{ usage: { ...base, prompt_tokens_details: { cached_tokens: 0 } } }])).message.usage,
    expected(100, 20, 0, 0, 120));
});

test("absent or unrecognized statistics do not estimate tokens or monetary costs", async () => {
  for (const raw of [undefined, null, {}, [], "bad", { credit: 10, credits: 10, original_credits: 20, billable: true },
    { completion_tokens_details: { cached_tokens: 25, reasoning_tokens: 15 } }]) {
    const result = await run([{ usage: raw, choices: [{ delta: { content: "some uncounted text" } }] }]);
    assert.deepEqual(result.message.usage, expected());
  }
});

test("missing total is not estimated and reported total is not overwritten", async () => {
  assert.deepEqual((await run([{ usage: { prompt_tokens: 10, completion_tokens: 5 } }])).message.usage,
    expected(10, 5));
  assert.deepEqual((await run([{ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 19 } }])).message.usage,
    expected(10, 5, 0, 0, 19));
});

test("invalid counts and empty frames never erase an earlier valid snapshot", async () => {
  for (const invalid of [-1, 1.5, "12", null, true, 1e100]) {
    const result = await run([{ usage }, { usage: {
      prompt_tokens: invalid, completion_tokens: invalid, total_tokens: invalid,
      prompt_tokens_details: { cached_tokens: invalid, cacheable_tokens: invalid },
    } }, { usage: {} }, { usage: null }]);
    assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
  }
});

test("explicit zero snapshots reset counts instead of retaining old values", async () => {
  const result = await run([{ usage }, { usage: {
    prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
    prompt_tokens_details: { cached_tokens: 0, cacheable_tokens: 0 },
  } }]);
  assert.deepEqual(result.message.usage, expected());
});

test("inconsistent cache breakdowns are discarded rather than inflating input", async () => {
  const result = await run([{ usage: { ...usage, prompt_tokens: 20, total_tokens: 40 } }]);
  assert.deepEqual(result.message.usage, expected(20, 20, 0, 0, 40));
});

test("upstream errors preserve already-reported usage without emitting done", async () => {
  const result = await run([{ usage }], true);
  assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
  assert.equal(result.message.stopReason, "error");
  assert.equal(result.events.some((e) => e.type === "done"), false);
});

test("user cancellation preserves reported usage", async () => {
  const result = await run([{ usage, choices: [{ delta: { content: "partial" } }] }], false, true);
  assert.deepEqual(result.message.usage, expected(60, 20, 30, 10, 120));
  assert.equal(result.message.stopReason, "aborted");
});

test("usage never leaks across requests and billing credits never become cost", async () => {
  assert.deepEqual((await run([{ usage: { ...usage, credit: 7, credits: 7 } }])).message.usage,
    expected(60, 20, 30, 10, 120));
  assert.deepEqual((await run([{}])).message.usage, expected());
});
