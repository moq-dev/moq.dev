// Text-to-speech: the AI talks faster than real-time, the human listens at human speed.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, has, head, type Segment, transmit } from "./sim";

const WORDS = [
	{ text: "Paris.", start: 0.1, end: 0.6 },
	{ text: "Bring", start: 0.85, end: 1.15 },
	{ text: "lots", start: 1.2, end: 1.45 },
	{ text: "of", start: 1.5, end: 1.6 },
	{ text: "le", start: 1.65, end: 1.8 },
	{ text: "capital", start: 1.85, end: 2.35 },
	{ text: "though,", start: 2.4, end: 2.8 },
	{ text: "it's", start: 3.0, end: 3.2 },
	{ text: "très", start: 3.25, end: 3.5 },
	{ text: "expensive.", start: 3.55, end: 4.2 },
];

const AXIS = 4.3;
// The same stretch of audio is lost on both transports, by media timestamp, so they lose the same words:
// "lots of le capital though", leaving "Bring … it's très expensive."
const LOST = { start: 1.2, end: 2.85 };

const GENERATE = 10; // the model speaks 10x faster than real-time
const THROUGHPUT = 3; // MoQ sends as fast as the (congested) network allows
const DELAY = 0.5; // both players start playback after the same delay

const TS = frames(AXIS);
const generated = (ts: number) => (ts + FRAME) / GENERATE;

function panel(moq: boolean): Panel {
	// WebRTC is a real-time transport: audio goes out at human speed, no matter how fast it was made.
	const send = moq ? (ts: number) => Math.max(generated(ts), ts / THROUGHPUT) : (ts: number) => ts + FRAME;
	// Sending is monotonic, so the outage is the wall-clock window those timestamps went out in.
	const loss = { start: send(LOST.start), end: send(LOST.end) };
	const packets = transmit(TS, send, loss, moq);
	const pace = moq ? FRAME / THROUGHPUT : FRAME;

	const spoken: Segment[] = packets.map((p) => ({
		ts: p.ts,
		have: generated(p.ts),
		start: p.sent,
		done: p.sent + pace,
	}));

	// The player plays each frame at its timestamp, if it showed up in time.
	const heard: Segment[] = packets.map((p) => {
		const arrive = arrival(p);
		const play = p.ts + DELAY;
		if (arrive === undefined || arrive > play) return { ts: p.ts, lost: play };
		const missing = p.lost ? p.sent + FRAME + FLIGHT : undefined;
		return { ts: p.ts, have: arrive, start: play, done: play + FRAME, missing };
	});

	const queued = (t: number) => {
		const ahead = Math.min(t * GENERATE, AXIS) - head(spoken, t);
		return ahead > 0.3 ? `${ahead.toFixed(1)}s generated, waiting for real-time` : undefined;
	};

	const buffered = (t: number) => {
		const playhead = head(heard, t);
		if (playhead <= 0 || playhead >= AXIS) return undefined;
		let edge = playhead;
		for (const s of heard) {
			if (s.ts + FRAME <= playhead) continue;
			if (!has(s.have, t)) break;
			edge = s.ts + FRAME;
		}
		return `${(edge - playhead).toFixed(1)}s buffered`;
	};

	const finished = AXIS + DELAY;

	return {
		title: moq ? "MoQ" : "WebRTC",
		subtitle: moq ? "sends everything ASAP, the player buffers" : "sends at human speed, gives up on late audio",
		top: { who: "ai", words: WORDS, segments: spoken, note: moq ? undefined : queued },
		bottom: { who: "you", words: WORDS, segments: heard, note: buffered },
		packets,
		loss,
		reply: moq
			? { at: finished + 0.2, text: "“Ha, le pun.”", good: true }
			: { at: finished + 0.2, text: "“Bring what?!”", good: false },
	};
}

const PANELS = { webrtc: panel(false), moq: panel(true) };

const LABELS = {
	webrtc: "Text-to-speech over WebRTC: audio is sent at human speed, and packet loss erases “lots of le capital”.",
	moq: "Text-to-speech over MoQ: audio is sent ahead and buffered, so retransmits arrive before playback needs them.",
};

export default function TextToSpeech(props: { transport: "webrtc" | "moq" }) {
	return (
		<Diagram
			axis={AXIS}
			panel={PANELS[props.transport]}
			legend={{ done: "sent / played", have: "generated / buffered" }}
			label={LABELS[props.transport]}
		/>
	);
}
