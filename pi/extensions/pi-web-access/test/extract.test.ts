import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Import after isolating configuration so this test never reads personal settings.
test("fetch_content extracts a fake-IP hostname without configuration and blocks literal IP targets", async (t) => {
	const configDir = await mkdtemp(join(tmpdir(), "pi-web-access-fake-ip-"));
	const previousConfigDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = configDir;
	t.after(async () => {
		if (previousConfigDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousConfigDir;
		await rm(configDir, { recursive: true, force: true });
	});
	const { extractContent } = await import("../extract.ts");
	const requests: string[] = [];
	t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
		requests.push(String(input));
		assert.equal(init?.redirect, "manual");
		return new Response("# Guide\n\nFake-IP content extraction works.", {
			headers: { "content-type": "text/markdown" },
		});
	});
	const lookup = async () => [{ address: "198.18.0.64", family: 4 }];
	const result = await extractContent("https://docs.example/guide", undefined, { lookup });
	assert.equal(result.error, null);
	assert.match(result.content, /Fake-IP content extraction works/);
	assert.deepEqual(requests, ["https://docs.example/guide"]);

	const blocked = await extractContent("https://198.18.0.64/guide", undefined, { lookup });
	assert.match(blocked.error ?? "", /Blocked internal address/);
	assert.equal(requests.length, 1);
});
