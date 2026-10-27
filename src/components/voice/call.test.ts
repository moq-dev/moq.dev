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

	test("a frame either of two overlapping publishes could have sent leaves the estimate alone", () => {
		const log = slow();
		// The barge-in's publish was sent at 215 local, after this frame arrived, but the loose estimate
		// can't rule it out. Measuring transit from it would claim 1007.5 ± 2.5, excluding the truth.
		log.agent(publish("bot-audio-1", 500, 1500, 1215));
		log.received(600, 210, false);
		expect(log.offset).toBe(955);
		expect(log.error).toBe(55);
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
		expect(claimed?.published).toBe(4000);
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

	test("a frame of a track retired before any reply arrived is placed at the retirement", () => {
		const log = new CallLog();
		log.agent(arrival(0, 1010));
		log.agent(publish("bot-audio", 0, 5000, 1100));
		log.agent({
			version: 2,
			type: "retire",
			track: "bot-audio",
			timescale: 1000,
			unplayed_ticks: 5000,
			at_ns: 1200 * 1e6,
		});
		log.received(0, 300, false);

		const frame = log.reply.find((f) => f.media === 0);
		expect(frame?.discarded).toBe(true);
		expect(frame?.play).toBeDefined();
	});

	test("an older publish still holds media past a newer, shorter one", () => {
		const log = synced();
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));
		log.received(4500, 4100, false);

		expect(log.reply.find((f) => f.media === 4500)?.track).toBe("bot-audio");
	});
});

const record = (type: string, at: number, fields: object) => ({
	version: 2,
	type,
	timescale: 1000,
	at_ns: at * 1e6,
	...fields,
});

describe("statement", () => {
	test("runs from your speech until you stop", () => {
		const log = synced();
		log.agent(record("vad", 6210, { speaking: true, media_ticks: 5200, confirm_ticks: 200 }));
		log.agent(record("turn", 6250, { speaking: true, media_ticks: 5240 }));
		expect(log.statement(5500)).toEqual({ start: 5000, end: 5500 });
		log.agent(record("vad", 7210, { speaking: false, media_ticks: 6200, confirm_ticks: 200 }));
		log.agent(record("turn", 7300, { speaking: false, media_ticks: 6290 }));
		expect(log.statement(9000)).toEqual({ start: 5000, end: 6000 });
	});

	test("a reply to words the VAD missed starts a statement of its own", () => {
		const log = synced();
		log.agent(record("vad", 6210, { speaking: true, media_ticks: 5200, confirm_ticks: 200 }));
		log.agent(record("turn", 6250, { speaking: true, media_ticks: 5240 }));
		log.agent(record("vad", 7210, { speaking: false, media_ticks: 6200, confirm_ticks: 200 }));
		log.agent(record("turn", 7300, { speaking: false, media_ticks: 6290 }));
		// A short "okay" after the agent's reply: STT hears it, the VAD does not.
		const word = { speaker: "user", track: "mic", text: "okay", start_ticks: 12_000, end_ticks: 12_300 };
		log.agent(record("word", 13_350, word));
		log.agent(record("turn", 13_400, { speaking: true, media_ticks: 12_390 }));
		expect(log.statement(12_500)).toEqual({ start: 12_000, end: 12_300 });
	});

	test("speech after the agent's turn is the next statement", () => {
		const log = synced();
		log.agent(record("vad", 6210, { speaking: true, media_ticks: 5200, confirm_ticks: 200 }));
		log.agent(record("turn", 6250, { speaking: true, media_ticks: 5240 }));
		log.agent(record("vad", 7210, { speaking: false, media_ticks: 6200, confirm_ticks: 200 }));
		log.agent(record("turn", 7300, { speaking: false, media_ticks: 6290 }));
		log.agent(record("vad", 9210, { speaking: true, media_ticks: 8200, confirm_ticks: 200 }));
		expect(log.statement(8500)).toEqual({ start: 8000, end: 8500 });
	});
});

describe("answer", () => {
	test("spans the newest track's publishes since the request that led to them", () => {
		const log = synced();
		// The first reply rides bot-audio from 0. The next, on the same track, starts at 5000.
		log.agent(record("llm", 7000, { event: "request" }));
		log.agent(publish("bot-audio", 5000, 6000, 7100));
		log.agent(publish("bot-audio", 6000, 8000, 7200));
		expect(log.answer()).toEqual({ track: "bot-audio", start: 5000, end: 8000 });
	});

	test("a barge-in's track replaces the interrupted reply", () => {
		const log = synced();
		log.agent(record("llm", 7000, { event: "request" }));
		log.agent(publish("bot-audio-1", 2000, 3000, 7100));
		expect(log.answer()).toEqual({ track: "bot-audio-1", start: 2000, end: 3000 });
	});
});
