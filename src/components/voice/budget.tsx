// Two latency budgets: one upstream from your mic, fanned out to two subscribers that wait different amounts for lost audio.
import { Diagram, type Panel } from "./diagram";
import { arrival, FLIGHT, FRAME, frames, has, type Segment, transmit } from "./sim";
import { WORDS } from "./stt";

const AXIS = 4.4;
const SPEECH = 3.4; // seconds of audio; the rest of the axis leaves room for the lane labels

// The kraken eats "of France?" and keeps chewing well after you finish talking.
const LOSS = { start: 2.1, end: 6.0 };

// How much faster than real-time a model chews through buffered audio.
const CATCHUP = 4;

const TS = frames(SPEECH);
const SPOKEN: Segment[] = TS.map((ts) => ({ ts, start: ts, done: ts + FRAME }));

// Both subscribers share the one upstream, so every packet (and retransmit) crosses the network once.
const PACKETS = transmit(TS, (ts) => ts + FRAME, LOSS, true);

// A subscriber consumes audio in order, waiting up to `budget` past a frame's usual arrival before giving up on it.
function listen(budget: number): Segment[] {
	let prev = 0;
	return PACKETS.map((p) => {
		const due = p.sent + FLIGHT;
		const arrive = arrival(p);
		const missing = p.lost ? due : undefined;
		if (arrive === undefined || arrive > due + budget) {
			prev = Math.max(prev, due + budget);
			return { ts: p.ts, missing, lost: due + budget };
		}
		const start = Math.max(arrive, prev);
		prev = start + FRAME / CATCHUP;
		return { ts: p.ts, have: arrive, start, done: prev, missing };
	});
}

const STS = listen(1);
const STT = listen(10);

const finished = (segments: Segment[]) => Math.max(...segments.map((s) => s.done ?? s.lost ?? 0));

const note = (t: number) => {
	if (STS.some((s) => has(s.missing, t) && !has(s.have, t) && !has(s.lost, t))) return "waiting, for up to 1s";
	if (STS.some((s) => has(s.lost, t)) && t < finished(STS) + 0.5) return "gave up, guessing";
	return undefined;
};

const PANEL: Panel = {
	title: "MoQ",
	subtitle: "one upstream, two subscribers with different latency budgets",
	top: [{ who: "you", words: WORDS, segments: SPOKEN }],
	bottom: [
		{ who: "ai", words: WORDS, segments: STS, note, label: { text: "STS · 1s budget", align: "end" } },
		{ who: "ai", words: WORDS, segments: STT, label: { text: "STT · 10s budget", align: "end" } },
	],
	packets: PACKETS,
	loss: LOSS,
	replies: [
		{ at: finished(STS) + 0.3, text: "“Hmm, one sec.”" },
		{ at: finished(STT) + 0.3, text: "“Paris. Home of le croissant.”", good: true },
	],
};

export default function Budget() {
	return (
		<Diagram
			axis={AXIS}
			panel={PANEL}
			legend={{ done: "spoken / understood", have: "received, not yet understood" }}
			label="Two subscribers share one upstream. The 1s speech-to-speech subscriber gives up on the lost audio and stalls politely, while the 10s speech-to-text subscriber waits for retransmits and answers correctly."
		/>
	);
}
