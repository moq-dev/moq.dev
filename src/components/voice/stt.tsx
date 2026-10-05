// Speech-to-text: a human talks at human speed, the AI listens over a lossy network.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, has, head, type Segment, transmit } from "./sim";

const WORDS = [
	{ text: "Captain,", start: 0.1, end: 0.6 },
	{ text: "steer", start: 0.75, end: 1.05 },
	{ text: "away", start: 1.2, end: 1.55 },
	{ text: "from", start: 1.65, end: 1.9 },
	{ text: "the", start: 2.1, end: 2.3 },
	{ text: "kraken!", start: 2.4, end: 3.0 },
];

const AXIS = 3.1;
// The kraken eats exactly "away from", which flips the meaning.
const LOSS = { start: 1.3, end: 2.05 };

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
		reply: retransmit
			? { at: finished + 0.3, text: "“Aye, hard to starboard!”", good: true }
			: { at: finished + 0.3, text: "“Aye, steering into the kraken. 🫡”", good: false },
	};
}

const PANELS = { webrtc: panel(false), moq: panel(true) };

const LABELS = {
	webrtc: "Speech-to-text over WebRTC: packet loss eats “away from”, so the AI steers into the kraken.",
	moq: "Speech-to-text over MoQ: lost audio is retransmitted, and the AI catches up before you finish talking.",
};

export default function SpeechToText(props: { transport: "webrtc" | "moq" }) {
	return (
		<Diagram
			axis={AXIS}
			panel={PANELS[props.transport]}
			legend={{ done: "spoken / understood", have: "received, not yet understood" }}
			label={LABELS[props.transport]}
		/>
	);
}
