// Interruptions: the AI has already sent its answer ahead into your buffer, then you tell it to stop.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, head, type Packet, type Segment, transmit, type Word } from "./sim";
import { WORDS } from "./tts";

const AXIS = 4.8;
const ANSWER = 3.1; // seconds of the original answer: "Paris. Home of le croissant."
const GENERATE = 10; // the model speaks 10x faster than real-time
const THROUGHPUT = 3; // MoQ sends as fast as the network allows
const DELAY = 0.5; // the player starts playback after a short delay
const NONE = { start: 0, end: 0 }; // no packet loss, the network is fine

const STOP = 0.9; // you start saying "stop" partway through "Paris."
const SAYING = 0.4; // how long "stop" takes to say
const THINK = 0.3; // the AI decides it was interrupted before it starts a new track
const HEARD = STOP + SAYING + FLIGHT; // the last of "stop" reaches the AI
const NEW = HEARD + THINK; // the AI discards the old track and starts a new one
const CUT = 1.7; // the media timestamp the new track starts at, right before "le"
const REPLY: Word[] = [
	{ text: "Okay,", start: 1.8, end: 2.2 },
	{ text: "what", start: 2.35, end: 2.6 },
	{ text: "should", start: 2.75, end: 3.05 },
	{ text: "we", start: 3.2, end: 3.3 },
	{ text: "discuss", start: 3.45, end: 3.9 },
	{ text: "next?", start: 4.05, end: 4.4 },
];
const REPLY_END = 4.5;

// One track can only append, so the AI's reply to "stop" queues behind the rest of the answer.
const QUEUED: Word[] = [
	{ text: "What", start: 3.2, end: 3.45 },
	{ text: "next?", start: 3.55, end: 3.9 },
];
const QUEUED_END = 4.0;

const generated = (ts: number) => (ts + FRAME) / GENERATE;
const regenerated = (ts: number) => NEW + (ts - CUT + FRAME) / GENERATE;

// Your "stop", sent upstream a frame at a time, drawn above wherever you were listening.
const UP: Packet[] = frames(SAYING).map((i) => {
	const sent = STOP + i + FRAME;
	return { ts: sent - DELAY - FRAME, sent, lost: false, up: true };
});
const HEARING = STOP + FRAME + FLIGHT; // the first of "stop" reaches the AI

function spoken(packets: Packet[], made: (ts: number) => number, discard?: number): Segment[] {
	return packets.map((p) => ({
		ts: p.ts,
		have: made(p.ts),
		start: p.sent,
		done: p.sent + FRAME / THROUGHPUT,
		lost: discard !== undefined && p.ts >= CUT ? discard : undefined,
	}));
}

function heard(packets: Packet[], discard?: number): Segment[] {
	return packets.map((p) => {
		const have = arrival(p);
		if (discard !== undefined && p.ts >= CUT) return { ts: p.ts, have, lost: discard };
		const play = p.ts + DELAY;
		return { ts: p.ts, have, start: play, done: play + FRAME };
	});
}

const old = transmit(frames(ANSWER), (ts) => Math.max(generated(ts), ts / THROUGHPUT), NONE, false);

function same(): Panel {
	const queued = (ts: number) => NEW + (ts - ANSWER + FRAME) / GENERATE;
	const appended = transmit(
		frames(QUEUED_END).filter((ts) => ts >= ANSWER),
		queued,
		NONE,
		false,
	);
	const packets = [...old, ...appended];
	const words = [...WORDS, ...QUEUED];
	const played = heard(packets);
	const ai = (t: number) => {
		if (t >= HEARING && t < NEW) return "heard “stop”, but the answer is already sent";
		if (t >= NEW && t < NEW + 1.2) return "replies, after the buffered answer";
		return undefined;
	};
	const you = (t: number) =>
		t >= STOP && head(played, t) < QUEUED_END - 0.01
			? `still talking ${(t - STOP).toFixed(1)}s after “stop”`
			: undefined;

	return {
		title: "MoQ (naive)",
		subtitle: "one track, so the reply waits behind the buffered answer",
		top: [
			{ who: "ai", words, segments: spoken(packets, (ts) => (ts < ANSWER ? generated(ts) : queued(ts))), note: ai },
		],
		bottom: [{ who: "you", words, segments: played, note: you }],
		packets: [...packets, ...UP],
		loss: NONE,
		replies: [
			{ at: STOP, text: "“Stop!”" },
			{ at: QUEUED_END + DELAY + 0.1, text: "“I said STOP.”", good: false },
		],
	};
}

function replace(): Panel {
	const fresh = transmit(
		frames(REPLY_END).filter((ts) => ts >= CUT),
		regenerated,
		NONE,
		false,
	);

	// The player switches when the new track's first packet shows up, discarding the old track's buffer.
	const swap = arrival(fresh[0]) ?? NEW;
	const ai = (t: number) => {
		if (t >= HEARING && t < HEARD) return "hearing “stop”…";
		if (t >= HEARD && t < NEW) return "thinking…";
		return undefined;
	};
	const you = (t: number) => (t >= swap ? `discarded ${(ANSWER - CUT).toFixed(1)}s of buffered audio` : undefined);

	return {
		title: "MoQ",
		subtitle: "a new track replaces the old one, and its buffer is discarded",
		top: [
			{ who: "ai", words: WORDS, segments: spoken(old, generated, NEW) },
			{
				who: "ai",
				words: REPLY,
				segments: spoken(fresh, regenerated),
				note: ai,
				label: { text: "new track", at: NEW },
			},
		],
		bottom: [
			{ who: "you", words: WORDS, segments: heard(old, swap), note: you },
			{ who: "you", words: REPLY, segments: heard(fresh), label: { text: "new track", at: swap } },
		],
		packets: [...old, ...fresh, ...UP],
		loss: NONE,
		replies: [
			{ at: STOP, text: "“Stop!”" },
			{ at: REPLY_END + DELAY + 0.2, text: "“Croissants.”", good: true },
		],
	};
}

const PANELS = { same: same(), new: replace() };

const LABELS = {
	same: "A naive interruption over a single MoQ track: the answer is already buffered, so the AI keeps talking after you say stop, and its reply only plays once the buffer runs out.",
	new: "Interrupting by replacing the MoQ track: your stop reaches the AI, it starts a new track, and the old track's buffered audio is discarded.",
};

export default function Interrupt(props: { track: "same" | "new" }) {
	return (
		<Diagram
			axis={AXIS}
			panel={PANELS[props.track]}
			legend={{ done: "sent / played", have: "generated / buffered", lost: "discarded" }}
			label={LABELS[props.track]}
		/>
	);
}
