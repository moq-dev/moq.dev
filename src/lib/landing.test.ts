import { afterAll, beforeAll, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dev } from "astro";

let server: Awaited<ReturnType<typeof dev>>;
const url = (path: string) => `http://127.0.0.1:${server.address.port}${path}`;

beforeAll(async () => {
	server = await dev({
		root: fileURLToPath(new URL("../../", import.meta.url)),
		server: { host: "127.0.0.1", port: 0 },
		logLevel: "silent",
	});
}, 30_000);

afterAll(async () => {
	await server?.stop();
});

test("the landing page preserves spaces around inline links and emphasis", async () => {
	const response = await fetch(url("/"));
	expect(response.status).toBe(200);
	const paragraphs: string[] = [];
	await new HTMLRewriter()
		.on("main p", {
			element() {
				paragraphs.push("");
			},
			text({ text }) {
				paragraphs[paragraphs.length - 1] += text;
			},
		})
		.transform(response)
		.text();
	expect(paragraphs.map((text) => text.replace(/\s+/g, " ").trim())).toContain(
		"Build first, argue later. MoQ is being standardized by the IETF as a new RFC. We ship moq-lite today: a forwards-compatible subset of moq-transport that works with any MoQ CDN.",
	);
}, 30_000);

// Each diagram renders on the server, pre-seeded, so a crash in one shows up here rather than as a blank card.
test("/huh renders every section with its diagram", async () => {
	const response = await fetch(url("/huh"));
	expect(response.status).toBe(200);
	const html = await response.text();
	for (const id of ["quic", "congestion", "groups"]) expect(html).toContain(`id="${id}"`);
	for (const drawn of ["over TCP", "SENT", "behind live"]) expect(html).toContain(drawn);
}, 30_000);
