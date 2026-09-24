// Text-to-speech: the AI talks faster than real-time, the human listens at human speed.
import { type Art, Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, has, head, type Segment, transmit } from "./sim";

const WORDS = [
	{ text: "Paris.", start: 0.1, end: 0.6 },
	{ text: "Obviously.", start: 0.9, end: 1.6 },
	{ text: "Did", start: 2.0, end: 2.2 },
	{ text: "you", start: 2.3, end: 2.5 },
	{ text: "even", start: 2.6, end: 2.9 },
	{ text: "try", start: 3.0, end: 3.2 },
	{ text: "googling", start: 3.3, end: 3.8 },
	{ text: "it?", start: 3.9, end: 4.2 },
];

const AXIS = 4.3;
const LOSS = { start: 1.0, end: 1.8 };

const GENERATE = 10; // the model speaks 10x faster than real-time
const THROUGHPUT = 3; // MoQ sends as fast as the (congested) network allows
const DELAY = 0.5; // both players start playback after the same delay

const TS = frames(AXIS);
const generated = (ts: number) => (ts + FRAME) / GENERATE;

function panel(moq: boolean): Panel {
	// WebRTC is a real-time transport: audio goes out at human speed, no matter how fast it was made.
	const send = moq ? (ts: number) => Math.max(generated(ts), ts / THROUGHPUT) : (ts: number) => ts + FRAME;
	const packets = transmit(TS, send, LOSS, moq);
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
		loss: LOSS,
		result: moq
			? { at: finished + 0.2, text: "🧑 “Rude, but fair.”", good: true }
			: { at: finished + 0.2, text: "🧑 “Sorry, you broke up. Can you repeat that?”", good: false },
	};
}

const PANELS = [panel(false), panel(true)];
const END = AXIS + DELAY + 0.7;

export default function TextToSpeech(props: { art?: Art }) {
	return (
		<Diagram
			axis={AXIS}
			end={END}
			panels={PANELS}
			art={props.art}
			legend={{ done: "sent / played", have: "generated / buffered" }}
			label="Text-to-speech over WebRTC vs MoQ: WebRTC sends at human speed and packet loss erases a word, while MoQ sends ahead, buffers, and retransmits before playback needs it."
		/>
	);
}
