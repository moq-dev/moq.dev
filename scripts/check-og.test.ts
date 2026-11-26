import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, LOCK, ogCards } from "../tools/cards/og.ts";
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

describe("committed OG cards", () => {
	const cards = ogCards();
	const lock: Record<string, string> = JSON.parse(readFileSync(LOCK, "utf8"));

	test("every card is rendered at 1200x675 from its current inputs", () => {
		const stale = cards.filter((card) => {
			if (!card.ogOut) return true;
			const size = existsSync(card.ogOut) ? dimensions(card.ogOut, ".png") : undefined;
			return size?.width !== 1200 || size?.height !== 675 || lock[card.ogOut] !== fingerprint(card);
		});
		expect(
			stale.map((card) => card.slug),
			"missing or stale OG cards; run `just og`",
		).toEqual([]);
	});

	test("no card is left over from a removed page or post", () => {
		const live = new Set(cards.map((card) => card.ogOut));
		const orphaned = ["public/og/blog", "public/og/page"]
			.flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))
			.filter((path) => !live.has(path));
		expect(orphaned).toEqual([]);
	});
});
