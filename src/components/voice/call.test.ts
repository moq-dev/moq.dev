import { describe, expect, test } from "bun:test";
import { align, CallLog } from "./call";

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
		expect(claimed?.played).toBeFalsy();
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
	});

	test("a frame of a track retired before any reply arrived never plays", () => {
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
	});

	test("an older publish still holds media past a newer, shorter one", () => {
		const log = synced();
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));
		log.received(4500, 4100, false);

		expect(log.reply.find((f) => f.media === 4500)?.track).toBe("bot-audio");
	});
});

const word = (speaker: string, text: string, start: number, end: number, track = "mic") => ({
	version: 2,
	type: "word",
	speaker,
	track,
	text,
	timescale: 1000,
	start_ticks: start,
	end_ticks: end,
});

describe("sent", () => {
	test("marks a frame that reached the agent after a later one", () => {
		const log = new CallLog();
		log.agent(arrival(0, 1010));
		log.agent(arrival(40, 1050));
		// Retransmitted: captured before the frame that beat it.
		log.agent(arrival(20, 1200));

		expect(log.sent({ text: "hi", start: 0, end: 60 })).toEqual(["delivered", "reordered", "delivered"]);
	});

	test("a frame the agent has not heard yet is in flight", () => {
		const log = new CallLog();
		log.agent(arrival(0, 1010));
		log.agent(arrival(40, 1050));

		expect(log.sent({ text: "hi", start: 0, end: 60 })).toEqual(["delivered", "flight", "delivered"]);
	});
});

describe("heard", () => {
	test("buffered ahead of the playhead, delivered once played", () => {
		const log = synced();
		log.received(20, 120, false);
		log.buffer([{ start: 40, end: 80 }]);
		log.playhead(0);

		expect(log.heard({ text: "hi", start: 0, end: 100, track: "bot-audio" })).toEqual([
			"delivered",
			"buffered",
			"buffered",
			"buffered",
			"flight",
		]);
	});

	test("a retired track's word is interrupted, arrived or not", () => {
		const log = synced();
		log.received(20, 120, false);
		log.agent({
			version: 2,
			type: "retire",
			track: "bot-audio",
			timescale: 1000,
			unplayed_ticks: 5000,
			at_ns: 1200 * 1e6,
		});

		expect(log.heard({ text: "hi", start: 20, end: 60, track: "bot-audio" })).toEqual(["interrupted", "interrupted"]);
	});

	test("ignores another track's frame at the same media time", () => {
		const log = synced();
		log.received(2000, 2500, false);
		log.agent(publish("bot-audio-1", 2000, 3000, 4000));

		expect(log.heard({ text: "hi", start: 2000, end: 2020, track: "bot-audio-1" })).toEqual(["flight"]);
	});
});

describe("align", () => {
	test("matches across case and punctuation, and skips words either side left out", () => {
		const log = new CallLog();
		for (const [i, text] of ["hello", "there", "how", "are", "you"].entries()) {
			log.agent(word("user", text, i * 100, i * 100 + 80));
		}
		// The transcript has "um", which was never timed; `voice.json` has "there", which the transcript lost.
		const matched = align(["Hello,", "um", "how", "are", "you?"], log.userWords);

		expect(matched.map((w) => w?.text)).toEqual(["hello", undefined, "how", "are", "you"]);
	});

	test("a restated window does not repeat a word", () => {
		const log = new CallLog();
		log.agent(word("user", "hello", 0, 80));
		log.agent(word("user", "hello", 0, 80));

		expect(log.userWords).toHaveLength(1);
	});
});
