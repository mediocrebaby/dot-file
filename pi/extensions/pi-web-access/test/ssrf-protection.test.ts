import assert from "node:assert/strict";
import test from "node:test";
import { fetchRemoteUrl, validateRemoteUrl, type Lookup } from "../ssrf-protection.ts";

const fakeIpLookup: Lookup = async () => [{ address: "198.18.0.64", family: 4 }];

test("accepts hostname DNS results across the fake-IP pool without SSRF configuration", async () => {
	for (const protocol of ["http:", "https:"]) {
		for (const address of ["198.18.0.0", "198.18.0.64", "198.19.255.255"]) {
			const url = `${protocol}//docs.example/guide`;
			const validated = await validateRemoteUrl(url, {
				lookup: async () => [{ address, family: 4 }],
			});
			assert.equal(validated.toString(), url);
		}
	}
});

test("does not extend default fake-IP compatibility to literal or mapped IP URLs", async () => {
	for (const host of ["198.18.0.0", "198.18.0.64", "198.19.255.255", "[::ffff:198.18.0.64]"]) {
		for (const protocol of ["http:", "https:"]) {
			await assert.rejects(validateRemoteUrl(`${protocol}//${host}/`, {
				lookup: async () => { assert.fail("Literal IPs must not use DNS"); },
			}), /Blocked internal address/);
		}
	}
});

test("still rejects other internal DNS results and invalid addresses by default", async () => {
	for (const address of [
		"10.0.0.8", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "224.0.0.1",
		"::1", "fc00::1", "fe80::1", "::ffff:198.18.0.64", "198.18.0.999", "not-an-ip",
	]) {
		await assert.rejects(validateRemoteUrl("https://docs.example/", {
			lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
		}), /Blocked internal address|Resolved non-IP address/);
	}
});

test("validates every DNS result rather than allowing a fake-IP result to bypass private addresses", async () => {
	const fake = { address: "198.18.0.64", family: 4 };
	const privateAddress = { address: "10.0.0.8", family: 4 };
	let fetchCalls = 0;
	for (const addresses of [[fake, privateAddress], [privateAddress, fake]]) {
		await assert.rejects(fetchRemoteUrl("https://docs.example/", {}, {
			lookup: async () => addresses,
			fetch: async () => { fetchCalls++; return new Response("unexpected"); },
		}), /Blocked internal address/);
	}
	assert.equal(fetchCalls, 0);
	await validateRemoteUrl("https://docs.example/", {
		lookup: async () => [fake, { address: "93.184.216.34", family: 4 }],
	});
});

test("retains hostname policy and localhost checks for fake-IP DNS results", async () => {
	await assert.rejects(validateRemoteUrl("https://docs.example/", {
		lookup: fakeIpLookup,
		domainPolicy: { allow: ["example"], deny: ["docs.example"] },
	}), /Blocked hostname by fetch_content domain policy/);
	await assert.rejects(validateRemoteUrl("https://docs.example/", {
		lookup: fakeIpLookup,
		domainPolicy: { allow: ["other.example"], deny: [] },
	}), /Hostname not allowed/);
	for (const hostname of ["localhost", "nested.localhost"]) {
		await assert.rejects(validateRemoteUrl(`https://${hostname}/`, {
			lookup: fakeIpLookup,
		}), /Blocked internal hostname/);
	}
});

test("fetches fake-IP hostnames and revalidates each allowed redirect without rewriting the URL", async () => {
	const requests: string[] = [];
	const response = await fetchRemoteUrl("https://docs.example/start", {}, {
		lookup: fakeIpLookup,
		fetch: async (input, init) => {
			requests.push(String(input));
			assert.equal(init?.redirect, "manual");
			if (requests.length === 1) return new Response(null, { status: 302, headers: { location: "/guide" } });
			if (requests.length === 2) return new Response(null, { status: 302, headers: { location: "https://cdn.example/guide" } });
			return new Response("guide content");
		},
	});
	assert.deepEqual(requests, ["https://docs.example/start", "https://docs.example/guide", "https://cdn.example/guide"]);
	assert.equal(await response.text(), "guide content");
});

test("blocks fake-IP fetch redirects to literal IPs, private DNS results, and disallowed hostnames", async () => {
	for (const location of ["https://198.18.0.64/", "https://private.example/", "https://blocked.example/"]) {
		let fetchCalls = 0;
		await assert.rejects(fetchRemoteUrl("https://docs.example/start", {}, {
			lookup: async hostname => hostname === "private.example"
				? [{ address: "10.0.0.8", family: 4 }]
				: fakeIpLookup(hostname),
			domainPolicy: { allow: [], deny: ["blocked.example"] },
			fetch: async () => {
				fetchCalls++;
				return new Response(null, { status: 302, headers: { location } });
			},
		}), /Blocked internal address|Blocked hostname by fetch_content domain policy/);
		assert.equal(fetchCalls, 1);
	}
});

test("preserves explicit content-fetch CIDR exemptions without making them default", async () => {
	const url = "https://custom-pool.example/";
	const lookup: Lookup = async () => [{ address: "172.16.0.8", family: 4 }];
	await assert.rejects(validateRemoteUrl(url, { lookup }), /Blocked internal address/);
	assert.equal((await validateRemoteUrl(url, { lookup, allowRanges: ["172.16.0.0/24"] })).toString(), url);
	assert.equal((await validateRemoteUrl("https://198.18.0.64/", { allowRanges: ["198.18.0.0/15"] })).hostname, "198.18.0.64");
	for (const range of ["198.18.0.0/", "0.0.0.0/0", "::/0"]) {
		await assert.rejects(validateRemoteUrl(url, { lookup, allowRanges: [range] }), /Invalid CIDR notation/);
	}
});
