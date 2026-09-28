// Speech-to-text: a human talks at human speed, the AI listens over a lossy network.
import { type Art, Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, has, head, type Segment, transmit } from "./sim";

const WORDS = [
	{ text: "What", start: 0.1, end: 0.5 },
	{ text: "is", start: 0.6, end: 0.8 },
	{ text: "le", start: 0.9, end: 1.1 },
	{ text: "capital", start: 1.3, end: 2.0 },
	{ text: "of", start: 2.1, end: 2.3 },
	{ text: "France?", start: 2.5, end: 3.3 },
];

const AXIS = 3.4;
const LOSS = { start: 1.3, end: 2.1 };

// How much faster than real-time the model can chew through buffered audio.
// Real models are much faster; 4x keeps the catch-up visible.
const CATCHUP = 4;

const TS = frames(AXIS);
const SPOKEN: Segment[] = TS.map((ts) => ({ ts, start: ts, done: ts + FRAME }));

// A packet leaves once its frame has been spoken.
const send = (ts: number) => ts + FRAME;

function panel(retransmit: boolean): Panel {
	const packets = transmit(TS, send, LOSS, retransmit);

	// The model consumes audio in order, as soon as it's available.
	let prev = 0;
	const heard: Segment[] = packets.map((p) => {
		const arrive = arrival(p);
		// WebRTC skips the hole once the next packet shows up.
		if (arrive === undefined) return { ts: p.ts, lost: p.sent + FRAME + FLIGHT };

		const start = Math.max(arrive, prev);
		prev = start + FRAME / CATCHUP;
		const missing = p.lost ? p.sent + FRAME + FLIGHT : undefined;
		return { ts: p.ts, have: arrive, start, done: prev, missing };
	});

	const finished = Math.max(...heard.map((s) => s.done ?? s.lost ?? 0));

	// How far behind the speaker the model is, ignoring the usual network delay.
	const note = (t: number) => {
		const behind = head(SPOKEN, t) - head(heard, t) - FLIGHT - FRAME;
		if (behind < 0.1) return undefined;
		const waiting = heard.some((s) => has(s.missing, t) && !has(s.have, t));
		return `${waiting ? "waiting" : `catching up at ${CATCHUP}×`} · ${behind.toFixed(1)}s behind`;
	};

	return {
		title: retransmit ? "MoQ" : "WebRTC",
		subtitle: retransmit ? "retransmits for up to 5s" : "gives up on late audio",
		top: { who: "you", words: WORDS, segments: SPOKEN },
		bottom: { who: "ai", words: WORDS, segments: heard, note },
		packets,
		loss: LOSS,
		result: retransmit
			? { at: finished + 0.3, text: "🤖 “Paris.”", good: true }
			: { at: finished + 0.3, text: "🤖 “Sorry, you broke up. Can you repeat that?”", good: false },
	};
}

const PANELS = [panel(false), panel(true)];
const END = Math.max(...PANELS.map((p) => p.result.at)) + 0.5;

export default function SpeechToText(props: { art?: Art }) {
	return (
		<Diagram
			axis={AXIS}
			end={END}
			panels={PANELS}
			art={props.art}
			legend={{ done: "spoken / understood", have: "received, not yet understood" }}
			label="Speech-to-text over WebRTC vs MoQ: packet loss erases a word over WebRTC, while MoQ retransmits it and the AI catches up before you finish talking."
		/>
	);
}
