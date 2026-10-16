// Interruptions: the AI has already sent its answer ahead into your buffer, then you tell it to stop.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, head, type Packet, type Segment, transmit, type Word } from "./sim";
import { WORDS } from "./tts";

const AXIS = 5.4;
const GENERATE = 10; // the model speaks 10x faster than real-time
const THROUGHPUT = 3; // MoQ sends as fast as the network allows
const DELAY = 0.5; // the player starts playback after a short delay
const NONE = { start: 0, end: 0 }; // no packet loss, the network is fine

const STOP = 1.7; // you say "stop", partway through "It's"
const HEARD = STOP + FLIGHT; // the AI hears you, drops the old track, and starts a new one
const CUT = 1.8; // the media timestamp the new track starts at, right after "been"
const OKAY: Word = { text: "Okay.", start: 1.9, end: 2.3, from: HEARD };

function panel(replace: boolean): Panel {
	const generated = (ts: number) => (ts + FRAME) / GENERATE;
	const old = transmit(frames(AXIS), (ts) => Math.max(generated(ts), ts / THROUGHPUT), NONE, false);
	const fresh = replace
		? transmit(
				frames(CUT + 0.6).filter((ts) => ts >= CUT),
				(ts) => HEARD + (ts - CUT + FRAME) / GENERATE,
				NONE,
				false,
			)
		: [];

	// The player notices the swap when the new track's first packet shows up.
	const swap = fresh.length ? (arrival(fresh[0]) ?? 0) : Number.POSITIVE_INFINITY;
	const dropped = (p: Packet) => replace && old.includes(p) && p.ts >= CUT;

	const spoken: Segment[] = [...old, ...fresh].map((p) => ({
		ts: p.ts,
		have: Math.min(p.sent, generated(p.ts)),
		start: p.sent,
		done: p.sent + FRAME / THROUGHPUT,
		flushed: dropped(p) ? HEARD : undefined,
	}));

	const heard: Segment[] = [...old, ...fresh].map((p) => {
		const have = arrival(p);
		if (dropped(p)) return { ts: p.ts, have, flushed: swap };
		const play = p.ts + DELAY;
		return { ts: p.ts, have, start: play, done: play + FRAME };
	});

	// Old words past the cut vanish along with their track.
	const words = (gone: number) => [
		...WORDS.map((w) => (replace && w.start >= CUT ? { ...w, until: gone } : w)),
		...(replace ? [OKAY] : []),
	];

	const note = (t: number) => {
		if (t < STOP) return undefined;
		if (replace) return t >= swap ? `dropped ${(AXIS - CUT).toFixed(1)}s of buffered audio` : undefined;
		return head(heard, t) < AXIS - 0.01 ? `still talking ${(t - STOP).toFixed(1)}s after “stop”` : undefined;
	};

	const finished = (replace ? CUT + 0.6 : AXIS) + DELAY;

	return {
		title: "MoQ",
		subtitle: replace
			? "replaces the track, the player drops the old buffer"
			: "one track, the player keeps its buffer",
		top: { who: "ai", words: words(HEARD), segments: spoken },
		bottom: { who: "you", words: words(swap), segments: heard, note },
		packets: [...old, ...fresh],
		loss: NONE,
		replies: [
			{ at: STOP, text: "“Stop!”" },
			replace
				? { at: finished + 0.2, text: "“Thanks.”", good: true }
				: { at: finished + 0.2, text: "“I said STOP.”", good: false },
		],
	};
}

const PANELS = { same: panel(false), new: panel(true) };

const LABELS = {
	same: "Interrupting over a single MoQ track: the answer is already buffered, so the AI keeps talking after you say stop.",
	new: "Interrupting by replacing the MoQ track: the player drops the old track's buffer and plays the new one.",
};

export default function Interrupt(props: { track: "same" | "new" }) {
	return (
		<Diagram
			axis={AXIS}
			panel={PANELS[props.track]}
			legend={{ done: "sent / played", have: "generated / buffered" }}
			label={LABELS[props.track]}
		/>
	);
}
