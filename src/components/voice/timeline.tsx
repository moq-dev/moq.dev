// The live call on one scrolling clock, drawn like the post's diagrams come alive: your mic frames
// crossing to the agent, what it heard and did, and its reply crossing back into your buffer.
// Canvas, not SVG: a call is thousands of 20 ms frames, redrawn every animation frame.
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { type CallLog, FRAME_MS, WEBRTC_MS } from "./call";
import { COLOR } from "./diagram";

// The axis spans the latest exchange, at least this many milliseconds, with room either side.
const MIN_SPAN = 8000;
const PAD = 500;
// How quickly the axis eases to a new exchange, in milliseconds.
const EASE = 250;

const GUTTER = 64;
const LANE_H = 26;
const NET_H = 34;
const AGENT_H = 40;
const AXIS_H = 16;
const TOP = 4;

// Lane tops, top to bottom.
const MIC_Y = TOP;
const UP_Y = MIC_Y + LANE_H;
const AGENT_Y = UP_Y + NET_H;
const DOWN_Y = AGENT_Y + AGENT_H;
const SPEAKER_Y = DOWN_Y + NET_H;
const AXIS_Y = SPEAKER_Y + LANE_H;
const H = AXIS_Y + AXIS_H;

const PALETTE = {
	...COLOR,
	flight: "rgba(245, 158, 11, 0.45)",
	thinking: "rgba(245, 158, 11, 0.55)",
	speech: "rgba(148, 163, 184, 0.18)",
	discarded: "rgba(148, 163, 184, 0.35)",
	wire: "rgba(34, 197, 94, 0.22)",
	late: "#ef4444",
};

const FONT = "11px 'JetBrains Mono', ui-monospace, monospace";

export default function Timeline(props: { call: CallLog }) {
	const [summary, setSummary] = createSignal("");
	const [stats, setStats] = createSignal<{
		lateUp: number;
		up: number;
		lateDown: number;
		down: number;
		ahead?: number;
		error?: number;
	}>();
	let canvas!: HTMLCanvasElement;

	onMount(() => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let width = 0;
		let frame = 0;
		let view: { left: number; right: number; at: number } | undefined;
		const resize = () => {
			const dpr = window.devicePixelRatio || 1;
			width = canvas.clientWidth;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			// Resizing clears the canvas, so a finished call whose loop has stopped draws again.
			const call = props.call;
			if (frame === 0 && view && call.ended !== undefined) draw(ctx, call, call.ended, width, view.left, view.right);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		let pruned = 0;
		let summarized = 0;
		const tick = () => {
			const call = props.call;
			const now = call.ended ?? performance.now();
			if (now - pruned > 1000) {
				call.prune(now);
				pruned = now;
			}
			const [left, right] = span(call, now);
			const ease = view ? 1 - Math.exp(-(performance.now() - view.at) / EASE) : 1;
			view = {
				left: view ? view.left + (left - view.left) * ease : left,
				right: view ? view.right + (right - view.right) * ease : right,
				at: performance.now(),
			};
			draw(ctx, call, now, width, view.left, view.right);
			if (now - summarized > 500) {
				summarized = now;
				const s = measure(call, now);
				setStats(s);
				setSummary(describe(s));
			}
			frame = call.ended === undefined || performance.now() - call.ended < 2000 ? requestAnimationFrame(tick) : 0;
		};
		frame = requestAnimationFrame(tick);
		onCleanup(() => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		});
	});

	return (
		<figure class="m-0 mt-4">
			<canvas ref={canvas} class="block w-full" style={{ height: `${H}px` }} role="img" aria-label={summary()} />
			<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
				<Swatch color={PALETTE.done}>arrived</Swatch>
				<Swatch color={PALETTE.have}>buffered</Swatch>
				<Swatch color={PALETTE.flight}>in flight</Swatch>
				<Swatch color={PALETTE.late}>late for WebRTC (+{WEBRTC_MS} ms)</Swatch>
				<Swatch color={PALETTE.discarded}>interrupted</Swatch>
			</div>
			<Show when={stats()}>
				{(s) => (
					<p class="mt-1 mb-0 font-mono text-xs text-slate-500">
						you → agent: {s().lateUp} of {s().up} frames late for WebRTC · agent → you: {s().lateDown} of {s().down}
						<Show when={s().ahead !== undefined}> · reply buffered {((s().ahead ?? 0) / 1000).toFixed(1)}s ahead</Show>
						<Show when={s().error !== undefined}> · clocks synced ±{Math.round(s().error ?? 0)} ms</Show>
					</p>
				)}
			</Show>
		</figure>
	);
}

function Swatch(props: { color: string; children: unknown }) {
	return (
		<span class="flex items-center gap-1">
			<span class="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: props.color }} />
			{props.children as string}
		</span>
	);
}

function measure(call: CallLog, now: number) {
	let lateUp = 0;
	for (const f of call.mic) if (call.upLateness(f) > WEBRTC_MS) lateUp++;
	let lateDown = 0;
	let down = 0;
	for (const f of call.reply) {
		const late = call.downLateness(f);
		if (late === undefined) continue;
		down++;
		if (late > WEBRTC_MS) lateDown++;
	}
	const head = call.mediaNow(now);
	// A retired track's frames can sit past the replacement in media time, but never play.
	const last = call.reply.findLast((f) => f.play === undefined && !f.discarded);
	// A frame the extrapolated head already passed is due, not owed.
	const ahead = head !== undefined && last ? Math.max(0, last.media + FRAME_MS - head) : undefined;
	return { lateUp, up: call.mic.length, lateDown, down, ahead, error: call.error };
}

function describe(s: ReturnType<typeof measure>): string {
	const parts = [
		`Live call timeline. Your audio: ${s.lateUp} of ${s.up} frames reached the agent too late for a WebRTC jitter buffer.`,
		`The reply: ${s.lateDown} of ${s.down} frames late.`,
	];
	if (s.ahead !== undefined) parts.push(`${(s.ahead / 1000).toFixed(1)} seconds of reply buffered ahead.`);
	return parts.join(" ");
}

// The latest exchange, through the end of the reply buffered so far, with now always in view.
function span(call: CallLog, now: number): [number, number] {
	let end = now;
	const last = call.reply.findLast((f) => !f.discarded);
	const played = last && call.playAt(last, now);
	if (played !== undefined) end = Math.max(end, played + FRAME_MS);
	const right = end + PAD;
	const start = call.exchange();
	const left = start === undefined ? right - MIN_SPAN : Math.min(start - PAD, right - MIN_SPAN);
	return [left, right];
}

function draw(ctx: CanvasRenderingContext2D, call: CallLog, now: number, width: number, left: number, right: number) {
	ctx.clearRect(0, 0, width, H);
	if (width <= GUTTER) return;

	const trackW = width - GUTTER;
	const pxPerMs = trackW / (right - left);
	const x = (t: number) => GUTTER + (t - left) * pxPerMs;
	const visible = (start: number, end: number) => end >= left && start <= right;

	ctx.font = FONT;
	ctx.textBaseline = "middle";

	// Lane backgrounds and labels.
	const lane = (y: number, h: number, label: string) => {
		ctx.fillStyle = PALETTE.track;
		ctx.fillRect(GUTTER, y, trackW, h);
		ctx.fillStyle = PALETTE.neutral;
		ctx.textAlign = "right";
		ctx.fillText(label, GUTTER - 6, y + h / 2);
	};
	lane(MIC_Y, LANE_H, "you");
	lane(AGENT_Y, AGENT_H, "agent");
	lane(SPEAKER_Y, LANE_H, "you hear");

	ctx.save();
	ctx.beginPath();
	ctx.rect(GUTTER, 0, trackW, H);
	ctx.clip();

	// Your speech as the agent's VAD heard it.
	ctx.fillStyle = PALETTE.speech;
	for (const s of call.speech) {
		const end = s.end ?? now;
		if (visible(s.start, end)) ctx.fillRect(x(s.start), MIC_Y, (end - s.start) * pxPerMs, LANE_H);
	}

	// Mic frames: green once the agent has them, red if too late for WebRTC.
	const frameW = Math.max(1, FRAME_MS * pxPerMs);
	let lastCapture = left;
	for (const f of call.mic) {
		if (f.capture + FRAME_MS < left || f.capture > right) continue;
		const late = call.upLateness(f) > WEBRTC_MS;
		ctx.fillStyle = late ? PALETTE.late : PALETTE.done;
		ctx.fillRect(x(f.capture), MIC_Y + (late ? 2 : 6), frameW, LANE_H - (late ? 4 : 12));
		lastCapture = Math.max(lastCapture, f.capture + FRAME_MS);
	}
	// Captured but not yet at the agent: the agent's arrivals stop short of now.
	if (call.ended === undefined && call.mic.length > 0 && lastCapture < now) {
		ctx.fillStyle = PALETTE.flight;
		ctx.fillRect(x(lastCapture), MIC_Y + 6, (now - lastCapture) * pxPerMs, LANE_H - 12);
	}

	// Your words over their audio; interim guesses fainter.
	words(ctx, call.interims, x, MIC_Y + LANE_H / 2, PALETTE.faint, left, right, (w) => w.start);
	words(ctx, call.userWords, x, MIC_Y + LANE_H / 2, PALETTE.text, left, right, (w) => w.start);

	// Request frames crossing to the agent, once its clock is placed on ours.
	const offset = call.offset;
	if (offset !== undefined) {
		ctx.lineWidth = 1;
		for (const f of call.mic) {
			const arrive = f.arrive - offset;
			if (!visible(f.capture, arrive)) continue;
			const late = call.upLateness(f) > WEBRTC_MS;
			// Every fifth frame, or the stream is a solid wall.
			if (!late && Math.round(f.capture / FRAME_MS) % 5 !== 0) continue;
			ctx.strokeStyle = late ? PALETTE.late : PALETTE.wire;
			ctx.beginPath();
			ctx.moveTo(x(f.capture + FRAME_MS / 2), UP_Y);
			ctx.lineTo(x(arrive), AGENT_Y);
			ctx.stroke();
		}
	}

	// The agent: hearing on top, thinking and speaking below.
	if (offset !== undefined) {
		const hearY = AGENT_Y + AGENT_H / 4;
		const doY = AGENT_Y + (AGENT_H * 3) / 4;
		// Where each row's last label ends, so a quick retry's label does not overprint the last one.
		const labeled = { llm: Number.NEGATIVE_INFINITY, tts: Number.NEGATIVE_INFINITY };
		for (const s of call.spans) {
			const start = s.start - offset;
			const end = (s.end ?? now + offset) - offset;
			if (!visible(start, end)) continue;
			const first = s.first !== undefined ? s.first - offset : end;
			const y = s.kind === "llm" ? doY - 8 : doY + 1;
			ctx.fillStyle = PALETTE.thinking;
			ctx.fillRect(x(start), y, (first - start) * pxPerMs, 7);
			ctx.fillStyle = PALETTE.done;
			ctx.fillRect(x(first), y, Math.max(0, (end - first) * pxPerMs), 7);
			const label = Math.max(GUTTER + 2, x(start)) + 2;
			if (label < labeled[s.kind]) continue;
			ctx.fillStyle = PALETTE.text;
			ctx.textAlign = "left";
			ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
			ctx.fillText(s.kind.toUpperCase(), label, y + 4);
			labeled[s.kind] = label + ctx.measureText(s.kind.toUpperCase()).width + 4;
			ctx.font = FONT;
		}
		// A barge-in lands right on the turn that caused it, so its label goes first and a turn label
		// that would overprint a placed one is left off.
		const placed: [number, number][] = [];
		ctx.textAlign = "left";
		for (const kind of ["retire", "turn", "vad"] as const) {
			for (const m of call.marks) {
				const at = m.at - offset;
				if (m.kind !== kind || at < left || at > right) continue;
				const px = x(at);
				if (kind === "vad") {
					ctx.fillStyle = PALETTE.neutral;
					ctx.fillRect(px - 0.5, AGENT_Y + 2, 1, AGENT_H / 2 - 4);
					continue;
				}
				ctx.fillStyle = kind === "retire" ? PALETTE.late : PALETTE.text;
				if (kind === "retire") ctx.fillRect(px - 1, AGENT_Y, 2, AGENT_H);
				else ctx.fillRect(px - 1, AGENT_Y + 2, 2, AGENT_H / 2 - 4);
				const end = px + 4 + ctx.measureText(m.label).width;
				if (placed.some(([a, b]) => px < b + 4 && end > a)) continue;
				placed.push([px, end]);
				ctx.fillText(m.label, px + 4, hearY);
			}
		}
		// When STT settled on each of your words.
		ctx.fillStyle = PALETTE.text;
		for (const w of call.userWords) {
			if (w.at === undefined) continue;
			const at = w.at - offset;
			if (at < left || at > right) continue;
			ctx.beginPath();
			ctx.arc(x(at), hearY, 2, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Reply frames: crossing from the agent, then waiting in your buffer until they play.
	const head = call.mediaNow(now);
	for (const f of call.reply) {
		const play = call.playAt(f, now);
		const downLate = call.downLateness(f);
		const late = f.late || (downLate !== undefined && downLate > WEBRTC_MS);
		if (offset !== undefined && f.published !== undefined) {
			const sent = f.published - offset;
			if (visible(sent, f.arrive) && (late || Math.round(f.media / FRAME_MS) % 5 === 0)) {
				ctx.strokeStyle = late ? PALETTE.late : PALETTE.wire;
				ctx.beginPath();
				ctx.moveTo(x(sent), AGENT_Y + AGENT_H);
				ctx.lineTo(x(f.arrive), SPEAKER_Y);
				ctx.stroke();
			}
		}
		if (play === undefined || play + FRAME_MS < left || play > right) continue;
		const played = f.play !== undefined || (head !== undefined && f.media <= head);
		ctx.fillStyle = f.discarded ? PALETTE.discarded : late ? PALETTE.late : played ? PALETTE.done : PALETTE.have;
		ctx.fillRect(x(play), SPEAKER_Y + (late ? 2 : 6), frameW, LANE_H - (late ? 4 : 12));
	}

	// The agent's words over the audio that says them.
	if (head !== undefined) {
		words(ctx, call.agentWords, x, SPEAKER_Y + LANE_H / 2, PALETTE.ink, left, right, (w) => {
			const frame = call.reply.find((f) => f.media >= w.start && (w.track === undefined || f.track === w.track));
			return frame ? call.playAt(frame, now) : undefined;
		});
	}

	ctx.restore();

	// The playhead: everything left of it has happened, the buffer sits right of it.
	ctx.fillStyle = PALETTE.text;
	ctx.fillRect(x(now) - 1, MIC_Y - 2, 2, AXIS_Y - MIC_Y + 2);

	// Seconds from now, as many as fit.
	ctx.fillStyle = PALETTE.dim;
	ctx.textAlign = "center";
	const step = [1, 2, 5, 10, 30].find((s) => s * 1000 * pxPerMs >= 40) ?? 60;
	for (let s = Math.ceil((left - now) / 1000 / step) * step; now + s * 1000 <= right; s += step) {
		const tx = x(now + s * 1000);
		if (tx < GUTTER + 8 || tx > width - 8) continue;
		ctx.fillRect(tx, AXIS_Y, 1, 3);
		ctx.fillText(s === 0 ? "now" : `${s > 0 ? "+" : ""}${s}s`, tx, AXIS_Y + 10);
	}
}

function words<T extends { text: string; start: number; end: number }>(
	ctx: CanvasRenderingContext2D,
	list: T[],
	x: (t: number) => number,
	y: number,
	color: string,
	left: number,
	right: number,
	at: (w: T) => number | undefined,
) {
	ctx.fillStyle = color;
	ctx.textAlign = "left";
	let edge = Number.NEGATIVE_INFINITY;
	for (const w of list) {
		const t = at(w);
		if (t === undefined || t > right || t + (w.end - w.start) < left) continue;
		const px = x(t);
		// Skip a word that would overprint the previous one.
		if (px < edge) continue;
		ctx.fillText(w.text, px + 1, y);
		edge = px + ctx.measureText(w.text).width + 4;
	}
}
