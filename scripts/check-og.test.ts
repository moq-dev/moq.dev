import { describe, expect, test } from "bun:test";
import { dimensions } from "./check-og";

describe("social card image headers", () => {
	test("reads every allowed raster format", () => {
		expect(dimensions("public/layout/icon.png", ".png")).toEqual({ width: 325, height: 300 });
		expect(dimensions("public/blog/you-dont-need-it/sponge.jpg", ".jpg")).toEqual({ width: 480, height: 360 });
		expect(dimensions("public/blog/to-wasm/duck.jpeg", ".jpeg")).toEqual({ width: 413, height: 255 });
		expect(dimensions("public/blog/replacing-hls-dash/buffering.gif", ".gif")).toEqual({ width: 498, height: 280 });
		expect(dimensions("public/blog/replacing-hls-dash/troll.webp", ".webp")).toEqual({ width: 217, height: 303 });
	});

	test("rejects non-image bytes with an image extension", () => {
		expect(dimensions("package.json", ".png")).toBeUndefined();
	});

	test("rejects an image whose extension doesn't match its bytes", () => {
		expect(dimensions("public/layout/icon.png", ".jpg")).toBeUndefined();
	});
});
