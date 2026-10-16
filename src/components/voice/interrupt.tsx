// Interruptions: the AI has already sent its answer ahead into your buffer, then you tell it to stop.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, head, type Packet, type Segment, transmit, type Word } from "./sim";
import { WORDS } from "./tts";

const AXIS = 4.6;
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
	const played = heard(old);
	const ai = (t: number) => (t >= HEARING && t < HEARD + 1.2 ? "heard “stop”, but it’s all sent already" : undefined);
	const you = (t: number) =>
		t >= STOP && head(played, t) < ANSWER - 0.01 ? `still talking ${(t - STOP).toFixed(1)}s after “stop”` : undefined;

	return {
		title: "MoQ",
		subtitle: "one track, the player keeps its buffer",
		top: [{ who: "ai", words: WORDS, segments: spoken(old, generated), note: ai }],
		bottom: [{ who: "you", words: WORDS, segments: played, note: you }],
		packets: [...old, ...UP],
		loss: NONE,
		replies: [
			{ at: STOP, text: "“Stop!”" },
			{ at: ANSWER + DELAY + 0.2, text: "“I said STOP.”", good: false },
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
	same: "Interrupting over a single MoQ track: the answer is already buffered, so the AI keeps talking after you say stop.",
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
