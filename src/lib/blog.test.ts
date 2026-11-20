import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "vite";

test("the voice archive includes the complete source and URL of every blog post", async () => {
	const vite = await createServer({
		server: { middlewareMode: true, watch: null },
		appType: "custom",
		optimizeDeps: { noDiscovery: true },
	});
	try {
		const { GET } = await vite.ssrLoadModule("/src/pages/blog.json.ts");
		const response: Response = GET();
		expect(response.headers.get("content-type")).toContain("application/json");
		const { posts } = await response.json();
		const directory = new URL("../pages/blog/", import.meta.url);
		const files = (await readdir(directory)).filter((file) => file.endsWith(".mdx")).sort();
		expect(files.length).toBeGreaterThan(0);
		expect(posts).toEqual(
			await Promise.all(
				files.map(async (file) => ({
					url: `https://moq.dev/blog/${file.slice(0, -4)}`,
					content: await readFile(new URL(file, directory), "utf8"),
				})),
			),
		);
	} finally {
		await vite.close();
	}
});
