// Interruptions: the AI has already sent its answer ahead into your buffer, then you tell it to stop.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, head, type Packet, type Segment, transmit, type Word } from "./sim";
import { WORDS } from "./tts";

const AXIS = 3.6;
const GENERATE = 10; // the model speaks 10x faster than real-time
const THROUGHPUT = 3; // MoQ sends as fast as the network allows
const DELAY = 0.5; // the player starts playback after a short delay
const NONE = { start: 0, end: 0 }; // no packet loss, the network is fine

const STOP = 0.9; // you say "stop" partway through "Paris."
const HEARD = STOP + FLIGHT; // the AI hears you, discards the old track, and starts a new one
const CUT = 1.0; // the media timestamp the new track starts at, right before "Home"
const REPLY: Word[] = [
	{ text: "Okay,", start: 1.1, end: 1.5 },
	{ text: "what", start: 1.65, end: 1.85 },
	{ text: "should", start: 1.95, end: 2.2 },
	{ text: "we", start: 2.3, end: 2.4 },
	{ text: "discuss", start: 2.5, end: 2.95 },
	{ text: "next?", start: 3.05, end: 3.4 },
];
const REPLY_END = 3.5;

const generated = (ts: number) => (ts + FRAME) / GENERATE;
const regenerated = (ts: number) => HEARD + (ts - CUT + FRAME) / GENERATE;

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

const old = transmit(frames(AXIS), (ts) => Math.max(generated(ts), ts / THROUGHPUT), NONE, false);

function same(): Panel {
	const played = heard(old);
	const note = (t: number) =>
		t >= STOP && head(played, t) < AXIS - 0.01 ? `still talking ${(t - STOP).toFixed(1)}s after “stop”` : undefined;

	return {
		title: "MoQ",
		subtitle: "one track, the player keeps its buffer",
		top: [{ who: "ai", words: WORDS, segments: spoken(old, generated) }],
		bottom: [{ who: "you", words: WORDS, segments: played, note }],
		packets: old,
		loss: NONE,
		replies: [
			{ at: STOP, text: "“Stop!”" },
			{ at: AXIS + DELAY + 0.2, text: "“I said STOP.”", good: false },
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
	const swap = arrival(fresh[0]) ?? HEARD;
	const note = (t: number) => (t >= swap ? `discarded ${(AXIS - CUT).toFixed(1)}s of buffered audio` : undefined);

	return {
		title: "MoQ",
		subtitle: "a new track replaces the old one, and its buffer is discarded",
		top: [
			{ who: "ai", words: WORDS, segments: spoken(old, generated, HEARD) },
			{ who: "ai", words: REPLY, segments: spoken(fresh, regenerated), label: { text: "new track", at: HEARD } },
		],
		bottom: [
			{ who: "you", words: WORDS, segments: heard(old, swap), note },
			{ who: "you", words: REPLY, segments: heard(fresh), label: { text: "new track", at: swap } },
		],
		packets: [...old, ...fresh],
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
	new: "Interrupting by replacing the MoQ track: the old track's buffered audio is discarded and the new track plays instead.",
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
