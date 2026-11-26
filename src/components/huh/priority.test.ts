import { describe, expect, test } from "bun:test";
import { allocate, MAX_QUEUE, move, type Stream, step } from "./priority";

const stream = (id: number, rate: number): Stream => ({ id, name: `s${id}`, rate, queued: 0, out: 0, starved: 0 });

describe("allocate", () => {
	test("serves strictly in rank order", () => {
		expect(allocate([1, 2, 3], 2.5)).toEqual([1, 1.5, 0]);
	});

	test("never hands out more than asked or more than there is", () => {
		expect(allocate([1, 2], 10)).toEqual([1, 2]);
		expect(allocate([1, 2], 0)).toEqual([0, 0]);
		expect(allocate([1, 2], -1)).toEqual([0, 0]);
	});
});

describe("step", () => {
	const run = (streams: Stream[], cwnd: number, seconds: number) => {
		for (let t = 0; t < seconds; t += 0.05) step(streams, cwnd, 0.05);
	};

	test("the lowest rank starves when the window is short", () => {
		const streams = [stream(0, 0.3), stream(1, 2), stream(2, 0.8)];
		run(streams, 2.4, 5);
		expect(streams[0].out).toBeCloseTo(0.3, 1);
		expect(streams[1].out).toBeCloseTo(2, 1);
		expect(streams[2].starved).toBeGreaterThan(3);
		expect(streams[2].queued).toBeCloseTo(MAX_QUEUE, 1);
	});

	test("moving a starved stream up feeds it at another's expense", () => {
		const streams = [stream(0, 0.3), stream(1, 2), stream(2, 0.8)];
		run(streams, 2.4, 5);
		move(streams, 2, -1);
		run(streams, 2.4, 5);
		expect(streams[1].id).toBe(2);
		expect(streams[1].starved).toBe(0);
		expect(streams[1].out).toBeCloseTo(0.8, 1);
		expect(streams[2].out).toBeCloseTo(2.4 - 0.3 - 0.8, 1);
	});

	test("sends exactly what the window allows", () => {
		const streams = [stream(0, 3), stream(1, 3)];
		const before = streams.reduce((n, s) => n + s.queued, 0);
		step(streams, 2, 0.5);
		const after = streams.reduce((n, s) => n + s.queued, 0);
		expect(before + 6 * 0.5 - after).toBeCloseTo(2 * 0.5);
	});

	test("a zero-length step changes nothing", () => {
		const streams = [stream(0, 1)];
		step(streams, 2, 0.1);
		const before = { ...streams[0] };
		step(streams, 2, 0);
		expect(streams[0]).toEqual(before);
	});
});

describe("move", () => {
	test("stops at the ends", () => {
		const streams = [stream(0, 1), stream(1, 1)];
		move(streams, 0, -1);
		move(streams, 1, 1);
		expect(streams.map((s) => s.id)).toEqual([0, 1]);
		move(streams, 1, -1);
		expect(streams.map((s) => s.id)).toEqual([1, 0]);
	});
});
