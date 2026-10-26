import { describe, expect, test } from "bun:test";
import { CallLog } from "./call";

// Millisecond ticks, so media times read as written.
const arrival = (capture: number, arrive: number) => ({
	version: 2,
	type: "arrival",
	timescale: 1000,
	media_ticks: capture,
	arrival_ns: arrive * 1e6,
});

const publish = (track: string, start: number, end: number, at: number) => ({
	version: 2,
	type: "publish",
	track,
	timescale: 1000,
	start_ticks: start,
	end_ticks: end,
	at_ns: at * 1e6,
});

// The agent's clock is 1000 ms ahead of ours, with 10 ms of transit each way.
function synced(): CallLog {
	const log = new CallLog();
	log.agent(arrival(0, 1010));
	log.agent(publish("bot-audio", 0, 5000, 1100));
	log.received(0, 110, false);
	return log;
}

describe("clock", () => {
	test("places the agent's clock from the fastest transit each way", () => {
		const log = synced();
		expect(log.offset).toBe(1000);
		expect(log.error).toBe(10);
	});
});

describe("clock", () => {
	// The first downlink sample is 90 ms slow, so the estimate starts 45 ms off (error 55).
	function slow(): CallLog {
		const log = new CallLog();
		log.agent(arrival(0, 1010));
		log.agent(publish("bot-audio", 0, 1000, 1100));
		log.received(0, 200, false);
		expect(log.offset).toBe(955);
		return log;
	}

	test("a faster frame refines the estimate when its record comes first", () => {
		const log = slow();
		log.agent(publish("bot-audio", 1000, 2000, 1200));
		log.received(1000, 210, false);
		expect(log.offset).toBe(1000);
		expect(log.error).toBe(10);
	});

	test("a faster frame refines the estimate when it beats its record", () => {
		const log = slow();
		log.received(1000, 210, false);
		log.agent(publish("bot-audio", 1000, 2000, 1200));
		expect(log.offset).toBe(1000);
	});
});

describe("publish", () => {
	test("a barge-in's track claims the frames that beat its record", () => {
		const log = synced();
		// The new track resumes at media 2000. One frame of the old track arrived before it was sent,
		// and one of the new track arrived before its record did.
		log.received(2020, 2500, false);
		log.received(2000, 3050, false);
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));

		const [old, claimed] = [log.reply.find((f) => f.media === 2020), log.reply.find((f) => f.media === 2000)];
		expect(old?.track).toBe("bot-audio");
		expect(claimed?.track).toBe("bot-audio-1");
		expect(claimed && log.downLateness(claimed)).toBe(40);
	});

	test("a claimed frame sheds the retired track's discard", () => {
		const log = synced();
		log.received(2020, 2500, false);
		log.received(2000, 3050, false);
		log.agent({
			version: 2,
			type: "retire",
			track: "bot-audio",
			timescale: 1000,
			unplayed_ticks: 3000,
			at_ns: 3900 * 1e6,
		});
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));

		const [old, claimed] = [log.reply.find((f) => f.media === 2020), log.reply.find((f) => f.media === 2000)];
		expect(old?.discarded).toBe(true);
		expect(claimed?.track).toBe("bot-audio-1");
		expect(claimed?.discarded).toBeFalsy();
		expect(claimed?.play).toBeUndefined();
	});

	test("a frame of a track retired before it arrived never plays", () => {
		const log = synced();
		log.agent({
			version: 2,
			type: "retire",
			track: "bot-audio",
			timescale: 1000,
			unplayed_ticks: 3000,
			at_ns: 3900 * 1e6,
		});
		log.received(3000, 3000, false);

		const late = log.reply.find((f) => f.media === 3000);
		expect(late?.track).toBe("bot-audio");
		expect(late?.discarded).toBe(true);
		expect(late?.play).toBeDefined();
	});

	test("an older publish still holds media past a newer, shorter one", () => {
		const log = synced();
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));
		log.received(4500, 4100, false);

		expect(log.reply.find((f) => f.media === 4500)?.track).toBe("bot-audio");
	});
});

describe("exchange", () => {
	test("starts with the earlier of your latest statement and the agent's latest reply", () => {
		const log = synced();
		const record = (type: string, at: number, fields: object) => ({
			version: 2,
			type,
			timescale: 1000,
			at_ns: at * 1e6,
			...fields,
		});
		// The agent starts replying at 3000 local, then you interrupt: speech from 5000, confirmed at 5200.
		log.agent(record("llm", 4000, { event: "request" }));
		log.agent(record("vad", 6210, { speaking: true, media_ticks: 5200, confirm_ticks: 200 }));
		expect(log.exchange()).toBe(3000);
		log.agent(record("turn", 6250, { speaking: true, media_ticks: 5240 }));
		expect(log.exchange()).toBe(3000);
		// Its next reply is to your interruption, so the exchange now starts where you did.
		log.agent(record("llm", 7000, { event: "request" }));
		expect(log.exchange()).toBe(5000);
	});
});
