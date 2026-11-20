import { afterEach, expect, mock, test } from "bun:test";
import { publish, watch } from "./try";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
const broadcast = { project: "try", name: "0123456789.hang" };
const token = {
	project: "try",
	broadcast: broadcast.name,
	publishToken: "publish-secret",
	watchToken: "watch-secret",
	expiresAt: Math.floor(Date.now() / 1000) + 3600,
} as const;
function response(value: unknown = token, status = 200) {
	const fetch = mock(async () => Response.json(value, { status }));
	globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
	return fetch;
}

test("publish mints cookie-less credentials from the API", async () => {
	const fetch = response();
	expect(await publish("https://api.example")).toEqual(token);
	const args = fetch.mock.calls[0] as unknown as [URL, RequestInit];
	expect(args[0].toString()).toBe("https://api.example/try/token");
	expect(args[1].credentials).toBe("omit");
	expect(args[1].method).toBe("POST");
});

test("watch only obtains a watch credential for the exact broadcast", async () => {
	const fetch = response();
	const params = new URLSearchParams();
	expect((await watch("https://api.example", broadcast, params)).get("jwt")).toBe("watch-secret");
	expect(params.has("jwt")).toBe(false);
	const args = fetch.mock.calls[0] as unknown as [URL, RequestInit];
	expect(args[0].pathname).toBe("/try/watch");
	expect(JSON.parse(String(args[1].body))).toEqual({ broadcast: broadcast.name });
});

test("explicit tokens and external relays never mint platform credentials", async () => {
	const fetch = response();
	for (const params of [
		new URLSearchParams({ jwt: "supplied" }),
		new URLSearchParams({ relay: "https://other.example" }),
		new URLSearchParams({ cloudflare: "draft-16" }),
	]) {
		expect((await watch("https://api.example", broadcast, params)).toString()).toBe(params.toString());
	}
	await watch("https://api.example", { project: "demo", name: "bbb.hang" }, new URLSearchParams());
	expect(fetch).not.toHaveBeenCalled();
});

test("malformed broadcast names are refused before minting", async () => {
	const fetch = response();
	for (const name of ["", ".dash/x", "../demo/bbb.hang", "0123456789.hang/child"]) {
		await expect(watch("https://api.example", { project: "try", name }, new URLSearchParams())).rejects.toThrow();
	}
	expect(fetch).not.toHaveBeenCalled();
});

test("failed, expired, or mismatched credentials fail closed", async () => {
	response({}, 429);
	await expect(publish("https://api.example")).rejects.toThrow("429");
	for (const value of [
		null,
		{},
		{ ...token, project: "demo" },
		{ ...token, expiresAt: 0 },
		{ ...token, publishToken: "" },
	]) {
		response(value);
		await expect(publish("https://api.example")).rejects.toThrow();
	}
	response({ ...token, broadcast: "abcdefghjk.hang" });
	await expect(watch("https://api.example", broadcast, new URLSearchParams())).rejects.toThrow();
});
