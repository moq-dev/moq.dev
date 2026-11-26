import { expect, test } from "bun:test";
import { Glob } from "bun";
import { createServer } from "vite";

test("sitemap.xml and llms.txt list every page file once, and no 404", async () => {
	const vite = await createServer({
		server: { middlewareMode: true, watch: null },
		appType: "custom",
		optimizeDeps: { noDiscovery: true },
	});
	try {
		const sitemap: string = await (await (await vite.ssrLoadModule("/src/pages/sitemap.xml.ts")).GET()).text();
		const llms: string = await (await (await vite.ssrLoadModule("/src/pages/llms.txt.ts")).GET()).text();

		const root = new URL("../pages/", import.meta.url).pathname;
		const expected = [...new Glob("**/*.{astro,mdx}").scanSync(root)]
			.map((file) =>
				file
					.replace(/\.(astro|mdx)$/, "")
					.replace(/(^|\/)index$/, "")
					.replace(/\/$/, ""),
			)
			.filter((path) => path !== "404")
			.map((path) => (path ? `https://moq.dev/${path}/` : "https://moq.dev/"))
			.sort();

		const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
		expect(locs).toEqual(expected);

		const links = [...llms.matchAll(/^- \[.+\]\((\S+)\)/gm)].map((match) => match[1]).sort();
		expect(links).toEqual(expected);
		expect(llms).toContain("https://doc.moq.dev/llms.txt");
	} finally {
		await vite.close();
	}
});
