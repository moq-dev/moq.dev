import { describe, expect, test } from "bun:test";
import worker from "./index";

/** A stand-in for the static assets, recording what the Worker asked it for. */
const assets = () => {
	const seen: string[] = [];
	return {
		seen,
		ASSETS: {
			fetch: async (request: Request) => {
				const { pathname } = new URL(request.url);
				seen.push(pathname);
				return new Response(pathname);
			},
		},
	};
};

type Env = Parameters<typeof worker.fetch>[1];

const send = (url: string, env: ReturnType<typeof assets>, init?: RequestInit) =>
	worker.fetch(new Request(url, init), env as unknown as Env);

describe("fetch", () => {
	test("serves a vanity import path", async () => {
		const env = assets();
		const res = await send("https://moq.dev/moq?go-get=1", env);
		expect(await res.text()).toContain('content="moq.dev/moq git https://github.com/moq-dev/moq-go"');
		expect(env.seen).toEqual([]);
	});

	test("leaves de.moq.dev its own namespace", async () => {
		// The rewrite has to win over the vanity paths, or DEMOQED loses every URL
		// starting with /moq to a pkg.go.dev redirect.
		const env = assets();
		const res = await send("https://de.moq.dev/moq", env);
		expect(res.status).toBe(200);
		expect(env.seen).toEqual(["/de/moq"]);
	});

	test("passes anything else to the assets", async () => {
		const env = assets();
		await send("https://moq.dev/blog/", env);
		expect(env.seen).toEqual(["/blog/"]);
	});

	test("rejects a non-POST subscribe", async () => {
		const env = assets();
		expect((await send("https://moq.dev/api/subscribe", env)).status).toBe(405);
		expect(env.seen).toEqual([]);
	});
});
