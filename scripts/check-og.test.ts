import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { dimensions } from "./check-og";

describe("social card image headers", () => {
	test("reads every allowed raster format", () => {
		expect(dimensions("public/layout/og.png", ".png")).toEqual({ width: 1200, height: 675 });
		expect(dimensions("public/blog/you-dont-need-it/sponge.jpg", ".jpg")).toEqual({ width: 480, height: 360 });
		expect(dimensions("public/blog/to-wasm/duck.jpeg", ".jpeg")).toEqual({ width: 413, height: 255 });
		expect(dimensions("public/blog/replacing-hls-dash/buffering.gif", ".gif")).toEqual({ width: 498, height: 280 });
		expect(dimensions("public/blog/replacing-hls-dash/troll.webp", ".webp")).toEqual({ width: 217, height: 303 });
	});

	test("rejects non-image bytes with an image extension", () => {
		expect(dimensions("package.json", ".png")).toBeUndefined();
	});

	test("rejects an image whose extension doesn't match its bytes", () => {
		expect(dimensions("public/layout/og.png", ".jpg")).toBeUndefined();
	});
});

describe("blog OG cards", () => {
	test("every blog post has a 1200x675 OG card and no orphaned cards exist", () => {
		const posts = readdirSync("src/pages/blog")
			.filter((name) => name.endsWith(".mdx"))
			.map((name) => basename(name, ".mdx"))
			.sort();

		expect(posts.length).toBeGreaterThan(0);

		const missing: string[] = [];
		const badSize: string[] = [];

		for (const slug of posts) {
			const card = join("public/og/blog", `${slug}.png`);
			if (!existsSync(card)) {
				missing.push(card);
				continue;
			}
			const size = dimensions(card, ".png");
			if (size?.width !== 1200 || size?.height !== 675) {
				badSize.push(`${card} (${size ? `${size.width}x${size.height}` : "invalid PNG"})`);
			}
		}

		expect(missing, "Missing blog OG cards — run `just og` to generate them").toEqual([]);
		expect(badSize, "Invalid blog OG card dimensions — run `just og` to regenerate").toEqual([]);

		const cards = readdirSync("public/og/blog")
			.filter((name) => name.endsWith(".png"))
			.map((name) => basename(name, ".png"))
			.sort();
		const postSet = new Set(posts);
		const orphaned = cards.filter((slug) => !postSet.has(slug));
		expect(orphaned, "Orphaned blog OG cards in public/og/blog/ with no matching post").toEqual([]);
	});
});
