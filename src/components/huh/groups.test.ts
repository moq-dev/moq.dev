import { describe, expect, test } from "bun:test";
import { BEHIND, FPS, GOP, RATE, Sim } from "./groups";

const DT = 1 / 60;
const run = (sim: Sim, seconds: number, bandwidth: number, reset: boolean) => {
	for (let t = 0; t < seconds; t += DT) sim.step(DT, { bandwidth, reset });
};

describe("Sim", () => {
	test("frames trickle out as they're encoded, never before", () => {
		const sim = new Sim();
		for (let i = 0; i < 120; i++) {
			sim.step(DT, { bandwidth: RATE * 4, reset: true });
			for (const f of sim.frames) {
				expect(f.ts).toBeLessThanOrEqual(sim.t);
				if (f.arrived !== undefined) expect(f.arrived).toBeGreaterThanOrEqual(f.ts);
			}
		}
		// With room to spare, every frame encoded a frame ago has arrived.
		for (const f of sim.frames) if (f.ts < sim.t - 1 / FPS) expect(f.arrived).toBeDefined();
	});

	test("groups tile the timeline with no gaps", () => {
		const sim = new Sim();
		run(sim, 5, RATE * 2, true);
		const video = sim.frames.filter((f) => f.kind === "video");
		video.forEach((f, i) => {
			if (i === 0) return;
			const prev = video[i - 1];
			expect(f.ts - prev.ts).toBeCloseTo(1 / FPS);
			expect(f.index).toBe((prev.index + 1) % GOP);
			expect(f.group).toBe(prev.group + (f.index === 0 ? 1 : 0));
		});
	});

	test("audio keeps up when video can't", () => {
		const sim = new Sim();
		run(sim, 10, RATE * 0.6, false);
		expect(sim.latency("audio")).toBeLessThan(0.2);
		expect(sim.latency("video")).toBeGreaterThan(2);
	});

	test("resetting stale tails keeps video near the live edge", () => {
		const sim = new Sim();
		run(sim, 20, RATE * 0.8, true);
		expect(sim.latency("video")).toBeLessThan((GOP + 2) / FPS);
		expect(sim.frames.some((f) => f.reset !== undefined)).toBe(true);
		// Only an older group's tail is ever reset, never a keyframe the viewer played or the newest group.
		const newest = sim.frames.findLast((f) => f.kind === "video")?.group;
		for (const f of sim.frames) {
			if (f.reset === undefined) continue;
			expect(f.kind).toBe("video");
			expect(f.group).toBeLessThan(newest as number);
			expect(f.arrived).toBeUndefined();
		}
	});

	test("without resets, nothing is skipped and the delay grows", () => {
		const sim = new Sim();
		run(sim, 6, RATE * 0.8, false);
		const early = sim.latency("video");
		run(sim, 4, RATE * 0.8, false);
		expect(sim.latency("video")).toBeGreaterThan(early);
		expect(sim.frames.some((f) => f.reset !== undefined)).toBe(false);
	});

	test("a backlog deeper than BEHIND is skipped rather than held forever", () => {
		const sim = new Sim();
		for (let t = 0; t < BEHIND * 4; t += DT) {
			sim.step(DT, { bandwidth: RATE * 0.6, reset: false });
			expect(sim.frames.length).toBeLessThan((BEHIND + 3) * FPS * 2);
			if (sim.t > BEHIND) expect(sim.latency("video")).toBeLessThan(BEHIND + GOP / FPS + 0.1);
		}
	});
});
