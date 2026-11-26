import { describe, expect, test } from "bun:test";
import { DETECT, FLIGHT, GAP, HISTORY, type Order, STREAMS, send } from "./hol";

const LOST = new Set([10]);
const lostAt = 10 * GAP;

describe("send", () => {
	test("TCP holds every later packet until the retransmit arrives", () => {
		const packets = send(0, 4, LOST, "connection");
		const repaired = lostAt + DETECT + FLIGHT;
		for (const p of packets) {
			if (p.seq < 10) expect(p.deliver).toBe(p.arrive);
			else if (p.sent + FLIGHT < repaired) expect(p.deliver).toBe(repaired);
			else expect(p.deliver).toBe(p.arrive);
		}
	});

	test("QUIC holds back only the lost packet's own stream", () => {
		const packets = send(0, 4, LOST, "stream");
		const blocked = 10 % STREAMS;
		const late = packets.filter((p) => p.deliver > p.arrive);
		expect(late.length).toBeGreaterThan(0);
		for (const p of late) expect(p.stream).toBe(blocked);
		// The other streams never wait at all.
		for (const p of packets) if (p.stream !== blocked) expect(p.deliver).toBe(p.arrive);
	});

	test("never delivers before arrival, or out of order within its order", () => {
		const lost = new Set([3, 4, 9, 17, 18, 19, 30]);
		for (const order of ["connection", "stream"] as Order[]) {
			const last = new Map<number, number>();
			for (const p of send(0, 8, lost, order)) {
				expect(p.deliver).toBeGreaterThanOrEqual(p.arrive);
				const key = order === "connection" ? 0 : p.stream;
				expect(p.deliver).toBeGreaterThanOrEqual(last.get(key) ?? 0);
				last.set(key, p.deliver);
			}
		}
	});

	// The diagram only simulates a recent window; it must agree with simulating everything from the start.
	test("a window starting HISTORY back delivers like the full history", () => {
		const lost = new Set([5, 20, 21, 22, 40, 41, 60]);
		for (const order of ["connection", "stream"] as Order[]) {
			const full = new Map(send(0, 12, lost, order).map((p) => [p.seq, p.deliver]));
			for (let from = 0; from < 10; from += 0.37) {
				for (const p of send(from - HISTORY, 12, lost, order)) {
					if (p.sent >= from) expect(p.deliver).toBe(full.get(p.seq) as number);
				}
			}
		}
	});
});
