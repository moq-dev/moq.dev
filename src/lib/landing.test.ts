import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dev } from "astro";

test("the landing page preserves spaces around inline links and emphasis", async () => {
	const server = await dev({
		root: fileURLToPath(new URL("../../", import.meta.url)),
		server: { host: "127.0.0.1", port: 0 },
		logLevel: "silent",
	});
	try {
		const response = await fetch(`http://127.0.0.1:${server.address.port}/`);
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
	} finally {
		await server.stop();
	}
}, 30_000);
