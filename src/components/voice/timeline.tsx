// The call's two halves as buffers, each fitted to its latest utterance and replaced when the next
// starts: your statement filling in at the agent (STT), retransmissions included, and the agent's
// reply landing in your buffer (TTS), cached well ahead of the playhead.
// Canvas, not SVG: an utterance is hundreds of 20 ms frames, redrawn every animation frame.
import { createSignal, onCleanup, onMount } from "solid-js";
import { type CallLog, FRAME_MS, type Word } from "./call";
import { COLOR } from "./diagram";

const WORDS_H = 24;
const BAR_H = 22;
const AXIS_H = 16;
const BAR_Y = WORDS_H;
const AXIS_Y = BAR_Y + BAR_H;
const H = AXIS_Y + AXIS_H;
// The narrowest span drawn, so a short utterance's frames don't stretch into slabs.
const MIN_SPAN = 2000;

const PALETTE = {
	...COLOR,
	flight: "rgba(245, 158, 11, 0.35)",
	recovered: COLOR.missing,
	discarded: "rgba(148, 163, 184, 0.35)",
};

const FONT = "14px 'JetBrains Mono', ui-monospace, monospace";
const AXIS_FONT = "11px 'JetBrains Mono', ui-monospace, monospace";

type Draw = (ctx: CanvasRenderingContext2D, width: number, call: CallLog, now: number) => string;

export default function Timeline(props: { call: CallLog }) {
	const [heard, setHeard] = createSignal("");
	const [cached, setCached] = createSignal("");
	let stt!: HTMLCanvasElement;
	let tts!: HTMLCanvasElement;

	onMount(() => {
		let frame = 0;
		const charts: { canvas: HTMLCanvasElement; draw: Draw; caption: (s: string) => void }[] = [
			{ canvas: stt, draw: drawStatement, caption: setHeard },
			{ canvas: tts, draw: drawReply, caption: setCached },
		];
		const render = () => {
			const call = props.call;
			const now = call.ended ?? performance.now();
			for (const chart of charts) {
				const ctx = chart.canvas.getContext("2d");
				if (ctx) chart.caption(chart.draw(ctx, chart.canvas.clientWidth, call, now));
			}
		};
		const resize = () => {
			const dpr = window.devicePixelRatio || 1;
			for (const { canvas } of charts) {
				canvas.width = Math.round(canvas.clientWidth * dpr);
				canvas.height = Math.round(H * dpr);
				canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
			}
			// Resizing clears the canvas, so a finished call whose loop has stopped draws again.
			if (frame === 0) render();
		};
		const observer = new ResizeObserver(resize);
		for (const { canvas } of charts) observer.observe(canvas);
		resize();

		let pruned = 0;
		const tick = () => {
			const call = props.call;
			const now = call.ended ?? performance.now();
			if (now - pruned > 1000) {
				call.prune(now);
				pruned = now;
			}
			render();
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
			<Heading title="You → agent" detail={heard()} />
			<canvas ref={stt} class="block w-full" style={{ height: `${H}px` }} role="img" aria-label={heard()} />
			<Heading title="Agent → you" detail={cached()} />
			<canvas ref={tts} class="block w-full" style={{ height: `${H}px` }} role="img" aria-label={cached()} />
			<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
				<Swatch color={PALETTE.done}>arrived</Swatch>
				<Swatch color={PALETTE.recovered}>arrived out of order</Swatch>
				<Swatch color={PALETTE.flight}>in flight</Swatch>
				<Swatch color={PALETTE.have}>cached</Swatch>
				<Swatch color={PALETTE.discarded}>interrupted</Swatch>
				<Swatch color={PALETTE.lost}>missed playout</Swatch>
			</div>
		</figure>
	);
}

function Heading(props: { title: string; detail: string }) {
	return (
		<p class="mt-3 mb-1 flex flex-wrap gap-x-3 text-sm">
			<span class="font-semibold text-slate-200">{props.title}</span>
			<span class="font-mono text-xs leading-5 text-slate-400">{props.detail}</span>
		</p>
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

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// Your statement in capture time, growing while you speak: every frame turns green as the agent
// receives it, and the slider marks how far it has heard without a gap.
const drawStatement: Draw = (ctx, width, call, now) => {
	ctx.clearRect(0, 0, width, H);
	const said = call.statement(now);
	if (!said) return "waiting for you to speak";
	const edge = Math.min(now, said.end);
	const bar = scale(width, said.start, edge);

	// Captured but not at the agent yet: in flight, or lost and being retransmitted.
	ctx.fillStyle = PALETTE.track;
	ctx.fillRect(0, BAR_Y, width, BAR_H);
	ctx.fillStyle = PALETTE.flight;
	ctx.fillRect(bar.x(said.start), BAR_Y, bar.x(edge) - bar.x(said.start), BAR_H);

	const frames = call.mic.filter((f) => f.capture + FRAME_MS > said.start && f.capture < edge);
	// A frame that reached the agent after one captured later was retransmitted or reordered.
	let later = Number.POSITIVE_INFINITY;
	const recovered = new Set<number>();
	for (let i = frames.length - 1; i >= 0; i--) {
		if (frames[i].arrive > later) recovered.add(i);
		later = Math.min(later, frames[i].arrive);
	}
	const frameW = Math.max(1, FRAME_MS * bar.pxPerMs);
	frames.forEach((f, i) => {
		ctx.fillStyle = recovered.has(i) ? PALETTE.recovered : PALETTE.done;
		ctx.fillRect(bar.x(f.capture), BAR_Y, frameW, BAR_H);
	});

	// Heard without a gap: the first frame missing after the statement started.
	let contiguous = said.start;
	for (const f of frames) {
		// Half a frame absorbs timestamp jitter; a whole missing frame stops it.
		if (f.capture > contiguous + FRAME_MS / 2) break;
		contiguous = Math.max(contiguous, f.capture + FRAME_MS);
	}
	slider(ctx, bar.x(Math.min(contiguous, edge)));

	words(ctx, call.interims, bar, PALETTE.faint, (w) => w.start);
	words(ctx, call.userWords, bar, PALETTE.text, (w) => w.start);
	axis(ctx, bar, said.start);

	const parts = [`${seconds(Math.max(0, contiguous - said.start))} of ${seconds(edge - said.start)} heard`];
	if (recovered.size > 0) parts.push(`${recovered.size} frames out of order`);
	return parts.join(" · ");
};

// The reply in media time, as far as the agent has published it: frames land in your buffer long
// before the playhead reaches them, so the cache runs ahead of the slider.
const drawReply: Draw = (ctx, width, call, now) => {
	ctx.clearRect(0, 0, width, H);
	const reply = call.answer();
	if (!reply) return "waiting for a reply";
	const bar = scale(width, reply.start, reply.end);

	// Published, not here yet.
	ctx.fillStyle = PALETTE.track;
	ctx.fillRect(0, BAR_Y, width, BAR_H);
	ctx.fillStyle = PALETTE.flight;
	ctx.fillRect(bar.x(reply.start), BAR_Y, bar.x(reply.end) - bar.x(reply.start), BAR_H);
	ctx.fillStyle = PALETTE.lost;
	for (const g of call.gaps) {
		if (g.media + g.duration > reply.start && g.media < reply.end) {
			ctx.fillRect(bar.x(g.media), BAR_Y, g.duration * bar.pxPerMs, BAR_H);
		}
	}

	const head = call.mediaNow(now);
	const frameW = Math.max(1, FRAME_MS * bar.pxPerMs);
	let arrived = 0;
	for (const f of call.reply) {
		// A frame can beat the record of the track that carries it.
		if (f.media < reply.start || f.media >= reply.end || (f.track !== undefined && f.track !== reply.track)) continue;
		arrived += FRAME_MS;
		const played = f.play !== undefined || (head !== undefined && f.media <= head);
		ctx.fillStyle = f.discarded ? PALETTE.discarded : f.late ? PALETTE.lost : played ? PALETTE.done : PALETTE.have;
		ctx.fillRect(bar.x(f.media), BAR_Y, frameW, BAR_H);
	}

	const position = head === undefined ? reply.start : Math.min(Math.max(head, reply.start), reply.end);
	slider(ctx, bar.x(position));
	words(
		ctx,
		call.agentWords.filter((w) => w.track === undefined || w.track === reply.track),
		bar,
		PALETTE.text,
		(w) => w.start,
	);
	axis(ctx, bar, reply.start);

	const total = reply.end - reply.start;
	return `${seconds(Math.min(arrived, total))} of ${seconds(total)} cached · ${seconds(position - reply.start)} played`;
};

interface Scale {
	x: (t: number) => number;
	pxPerMs: number;
	left: number;
	right: number;
}

// Fit `[start, end]` to the width, at least MIN_SPAN wide so the bar grows into its space.
function scale(width: number, start: number, end: number): Scale {
	const right = Math.max(end, start + MIN_SPAN);
	const pxPerMs = width / (right - start);
	return { x: (t) => (t - start) * pxPerMs, pxPerMs, left: start, right };
}

function slider(ctx: CanvasRenderingContext2D, px: number) {
	ctx.fillStyle = PALETTE.text;
	ctx.fillRect(px - 1, BAR_Y - 4, 2, BAR_H + 8);
	ctx.beginPath();
	ctx.arc(px, BAR_Y - 4, 4, 0, Math.PI * 2);
	ctx.fill();
}

// Seconds from the utterance's start, as many as fit.
function axis(ctx: CanvasRenderingContext2D, bar: Scale, origin: number) {
	ctx.font = AXIS_FONT;
	ctx.fillStyle = PALETTE.dim;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	const step = [0.5, 1, 2, 5, 10, 30].find((s) => s * 1000 * bar.pxPerMs >= 48) ?? 60;
	for (let s = 0; origin + s * 1000 <= bar.right; s += step) {
		const tx = bar.x(origin + s * 1000);
		if (tx < 12) continue;
		ctx.fillRect(tx, AXIS_Y, 1, 3);
		ctx.fillText(`${s}s`, tx, AXIS_Y + 10);
	}
}

// Words above the bar at their media time, skipping one that would overprint the previous.
function words(ctx: CanvasRenderingContext2D, list: Word[], bar: Scale, color: string, at: (w: Word) => number) {
	ctx.font = FONT;
	ctx.fillStyle = color;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	let edge = Number.NEGATIVE_INFINITY;
	for (const w of list) {
		const t = at(w);
		if (t + (w.end - w.start) < bar.left || t > bar.right) continue;
		const px = Math.max(0, bar.x(t));
		if (px < edge) continue;
		ctx.fillText(w.text, px, WORDS_H / 2);
		edge = px + ctx.measureText(w.text).width + 6;
	}
}
