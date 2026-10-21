import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { centroid, follow, level, pick, SHAPES } from "./mouth";

describe("pick", () => {
	test("rests when quiet, whatever the width", () => {
		expect(pick(0, 0.8)).toBe("rest");
		expect(pick(0.05, 1.2)).toBe("rest");
	});

	test("opens a little: round when darker than usual, else a slit", () => {
		expect(pick(0.2, 0.8)).toBe("small-o");
		expect(pick(0.2, 1)).toBe("slit");
	});

	test("opens wide: round when darker than usual, else a D", () => {
		expect(pick(0.8, 0.8)).toBe("big-o");
		expect(pick(0.8, 1)).toBe("big-d");
	});
});

describe("follow", () => {
	test("opens faster than it closes", () => {
		const opened = follow(0, 1, 1000 / 60);
		const closed = 1 - follow(1, 0, 1000 / 60);
		expect(opened).toBeGreaterThan(closed);
	});

	test("lands in the same place at any frame rate", () => {
		let fast = 0;
		for (let i = 0; i < 4; i++) fast = follow(fast, 1, 1000 / 120);
		const slow = follow(follow(0, 1, 1000 / 60), 1, 1000 / 60);
		expect(fast).toBeCloseTo(slow, 6);
	});
});

describe("level", () => {
	test("is zero for silence and one for a loud tone", () => {
		expect(level(new Float32Array(1024))).toBe(0);
		const tone = Float32Array.from({ length: 1024 }, (_, i) => 0.5 * Math.sin(i / 4));
		expect(level(tone)).toBe(1);
	});
});

describe("centroid", () => {
	// 46.875 Hz bins: a 48 kHz context with a 1024-point FFT.
	const BIN = 46.875;
	const spectrum = (loud: (i: number) => boolean, floor: number) =>
		Float32Array.from({ length: 512 }, (_, i) => (loud(i) ? -20 : floor));

	test("finds a lone peak", () => {
		expect(
			centroid(
				spectrum((i) => i === 10, Number.NEGATIVE_INFINITY),
				BIN,
			),
		).toBeCloseTo(10 * BIN);
	});

	test("is not dragged bright by a quiet floor", () => {
		// Byte data would weigh this -80 dB floor at a quarter of the peak and land mid-band.
		expect(
			centroid(
				spectrum((i) => i < 12, -80),
				BIN,
			),
		).toBeLessThan(20 * BIN);
	});

	test("is zero for silence", () => {
		expect(
			centroid(
				spectrum(() => false, Number.NEGATIVE_INFINITY),
				BIN,
			),
		).toBe(0);
	});
});

test("every shape has a mouth file", () => {
	for (const shape of SHAPES) {
		expect(existsSync(new URL(`../../../public/voice/mouth/${shape}.svg`, import.meta.url))).toBe(true);
	}
});
