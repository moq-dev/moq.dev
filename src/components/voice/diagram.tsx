import { type Accessor, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";
import { FLIGHT, FRAME, fill, has, head, type Loss, type Packet, reach, type Segment, type Word } from "./sim";

// Hand-drawn art lives in public/voice/; replace the files to restyle every diagram.
// An array cycles at FPS like hand-drawn animation, following the clock.
type Sprite = string | string[];
const ART = {
	you: "/voice/you.svg",
	ai: "/voice/ai.svg",
	kraken: ["/voice/kraken-1.svg", "/voice/kraken-2.svg"],
	garbled: "/voice/garbled.svg",
} satisfies Record<string, Sprite>;
const FPS = 4;

export interface Track {
	who: "you" | "ai";
	words: Word[];
	segments: Segment[];
	note?: (t: number) => string | undefined;
}

export interface Panel {
	title: string;
	subtitle: string;
	top: Track;
	bottom: Track;
	packets: Packet[];
	loss: Loss;
	reply: { at: number; text: string; good: boolean }; // what the bottom lane says back
}

export interface Props {
	axis: number; // media seconds shown on the x-axis
	panel: Panel;
	legend: { have: string; done: string };
	label: string; // accessible description of the whole animation
}

const HOLD = 2.5; // seconds to linger on the final frame before looping
const SPEED = 0.5; // half speed, so the packets are easy to follow
const STEP = 0.1; // seconds per arrow key

const W = 600;
const GUTTER = 64;
const TRACK_W = W - GUTTER - 4;
const TRACK_H = 32;
const AVATAR = 44;
const TOP_Y = 6;
const BOTTOM_Y = 116;
const BUBBLE_Y = BOTTOM_Y + TRACK_H + 16;
const BUBBLE_H = 30;
const H = BUBBLE_Y + BUBBLE_H + 4;

const COLOR = {
	done: "#22c55e",
	have: "rgba(34, 197, 94, 0.25)",
	missing: "#f59e0b",
	lost: "#ef4444",
	track: "#0f172a",
	ink: "#052e16", // words, drawn on top of the green fill
	text: "#f1f5f9",
	dim: "#475569",
};

export function Diagram(props: Props) {
	const end = props.panel.reply.at + 0.5;
	const [t, setT] = createSignal(0);
	const [playing, setPlaying] = createSignal(false);
	const now = () => Math.min(t(), end);
	const id = createUniqueId();

	let root!: HTMLElement;

	onMount(() => {
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setT(end);
			return;
		}

		let last = performance.now();
		let frame = 0;
		const tick = (time: number) => {
			const dt = (time - last) / 1000;
			last = time;
			if (playing()) {
				const next = t() + dt * SPEED;
				setT(next > end + HOLD ? 0 : next);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		// Only run while on screen, so the reader doesn't miss the start.
		const observer = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), { threshold: 0.5 });
		observer.observe(root);

		onCleanup(() => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		});
	});

	const x = (ts: number) => GUTTER + (ts / props.axis) * TRACK_W;

	// The keyboard path for seeking: arrows step, Home/End jump. Clicking a track is the mouse path.
	const key = (e: KeyboardEvent) => {
		const target = {
			ArrowLeft: now() - STEP,
			ArrowDown: now() - STEP,
			ArrowRight: now() + STEP,
			ArrowUp: now() + STEP,
			Home: 0,
			End: end,
		}[e.key];
		if (target === undefined) return;
		e.preventDefault();
		setPlaying(false);
		setT(Math.max(0, Math.min(end, target)));
	};

	const view: ViewProps = {
		t: now,
		x,
		id,
		seek: (frac, segments) => {
			const at = reach(segments, frac * props.axis);
			if (at !== undefined) setT(at);
		},
	};

	const p = props.panel;
	const retransmits = p.packets.some((p) => p.rtx !== undefined);
	const losses = [...p.top.segments, ...p.bottom.segments].some((s) => s.lost !== undefined);

	return (
		<figure ref={root} class="not-prose card my-8 select-none p-4 sm:p-5">
			<figcaption class="mb-3 flex flex-wrap items-baseline gap-x-3">
				<span class="font-mono text-sm font-medium uppercase tracking-wider text-white">{p.title}</span>
				<span class="text-sm text-slate-400">{p.subtitle}</span>
			</figcaption>

			<div
				class="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-500"
				role="slider"
				tabIndex={0}
				aria-label={props.label}
				aria-valuemin={0}
				aria-valuemax={end}
				aria-valuenow={Math.round(now() * 10) / 10}
				aria-valuetext={`${now().toFixed(1)} seconds`}
				onKeyDown={key}
			>
				<svg viewBox={`0 0 ${W} ${H}`} class="block w-full" font-size="14" aria-hidden="true">
					<defs>
						<pattern id={`${id}-lost`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<rect width="6" height="6" fill="rgba(239, 68, 68, 0.2)" />
							<rect width="2" height="6" fill={COLOR.lost} />
						</pattern>
					</defs>
					<Network {...view} packets={p.packets} loss={p.loss} />
					<TrackView {...view} track={p.top} y={TOP_Y} name="top" notes="below" />
					<TrackView {...view} track={p.bottom} y={BOTTOM_Y} name="bottom" notes="above" />
					<Bubble reply={p.reply} t={now} />
				</svg>
			</div>

			<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
				<button
					type="button"
					class="w-7 rounded bg-slate-700/60 py-0.5 text-slate-200 hover:bg-slate-600"
					onClick={() => {
						if (t() >= end) setT(0);
						setPlaying(!playing());
					}}
					aria-label={playing() ? "Pause" : "Play"}
				>
					{playing() ? "❚❚" : "▶"}
				</button>
				<Swatch fill={COLOR.done}>{props.legend.done}</Swatch>
				<Swatch fill={COLOR.have}>{props.legend.have}</Swatch>
				<Show when={retransmits}>
					<Swatch stroke={COLOR.missing}>waiting for retransmit</Swatch>
				</Show>
				<Show when={losses}>
					<Swatch fill={`url(#${id}-lost)`}>lost forever</Swatch>
				</Show>
			</div>
		</figure>
	);
}

function Swatch(props: { fill?: string; stroke?: string; children: string }) {
	return (
		<span class="flex items-center gap-1">
			<svg width="12" height="12" aria-hidden="true">
				<rect
					x="1"
					y="1"
					width="10"
					height="10"
					rx="2"
					fill={props.fill ?? "none"}
					stroke={props.stroke}
					stroke-dasharray={props.stroke ? "3 2" : undefined}
				/>
			</svg>
			{props.children}
		</span>
	);
}

interface ViewProps {
	t: Accessor<number>;
	x: (ts: number) => number;
	id: string; // prefix for clip paths and patterns, unique per diagram
	seek: (frac: number, segments: Segment[]) => void; // jump to when a track reaches `frac` of the way along
}

function SpriteView(props: {
	sprite: Sprite;
	t: Accessor<number>;
	x: number;
	y: number;
	w: number;
	h?: number;
	opacity?: number;
	stretch?: boolean;
}) {
	const href = () => {
		const s = props.sprite;
		return Array.isArray(s) ? s[Math.floor(props.t() * FPS) % s.length] : s;
	};
	const h = () => props.h ?? props.w;
	return (
		<image
			href={href()}
			x={props.x - props.w / 2}
			y={props.y - h() / 2}
			width={props.w}
			height={h()}
			opacity={props.opacity}
			preserveAspectRatio={props.stretch ? "none" : "xMidYMid meet"}
		/>
	);
}

function TrackView(props: ViewProps & { track: Track; y: number; name: string; notes: "above" | "below" }) {
	const w = props.x(FRAME) - props.x(0);
	const pos = () => head(props.track.segments, props.t());
	const note = () => props.track.note?.(props.t());
	const bar = `${props.id}-${props.name}-bar`;
	const said = `${props.id}-${props.name}-said`;

	// Keep the note on the track: hang it off the left of the playhead once it's past halfway.
	const right = () => props.x(pos()) > W * 0.55;

	return (
		<g>
			<SpriteView sprite={ART[props.track.who]} t={props.t} x={GUTTER / 2 - 4} y={props.y + TRACK_H / 2} w={AVATAR} />

			<clipPath id={bar}>
				<rect x={GUTTER} y={props.y} width={TRACK_W} height={TRACK_H} rx="8" />
			</clipPath>
			{/* Words only appear once they've been said (or heard), so the reader sees them arrive. */}
			<clipPath id={said}>
				<rect x={GUTTER} y={props.y} width={Math.max(0, props.x(pos()) - GUTTER)} height={TRACK_H} />
			</clipPath>

			{/* crispEdges, or the 100ms segments show seams between them. */}
			<g clip-path={`url(#${bar})`} shape-rendering="crispEdges">
				<rect x={GUTTER} y={props.y} width={TRACK_W} height={TRACK_H} fill={COLOR.track} />
				<For each={props.track.segments}>
					{(s) => (
						<SegmentView s={s} t={props.t} x={props.x(s.ts)} y={props.y} w={w} hatch={`url(#${props.id}-lost)`} />
					)}
				</For>
			</g>
			<rect
				x={GUTTER}
				y={props.y}
				width={TRACK_W}
				height={TRACK_H}
				rx="8"
				fill="none"
				stroke="#334155"
				stroke-width="1"
			/>

			<g clip-path={`url(#${said})`}>
				<For each={props.track.words}>
					{(word) => <WordView word={word} segments={props.track.segments} t={props.t} x={props.x} y={props.y} />}
				</For>
			</g>

			<Show when={pos() > 0}>
				<line
					x1={props.x(pos())}
					x2={props.x(pos())}
					y1={props.y - 4}
					y2={props.y + TRACK_H + 4}
					stroke={COLOR.text}
					stroke-width="2.5"
					stroke-linecap="round"
				/>
			</Show>

			{/* Click a track to jump to when it reaches that point. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the mouse path; the slider handles the keyboard. */}
			<rect
				x={GUTTER}
				y={props.y}
				width={TRACK_W}
				height={TRACK_H}
				fill="transparent"
				class="cursor-pointer"
				onClick={(e) => {
					const r = e.currentTarget.getBoundingClientRect();
					props.seek((e.clientX - r.left) / r.width, props.track.segments);
				}}
			/>

			<Show when={note()}>
				<text
					x={props.x(pos()) + (right() ? -8 : 8)}
					y={props.notes === "above" ? props.y - 9 : props.y + TRACK_H + 18}
					text-anchor={right() ? "end" : "start"}
					fill={COLOR.missing}
					font-size="12"
				>
					{note()}
				</text>
			</Show>
		</g>
	);
}

function SegmentView(props: { s: Segment; t: Accessor<number>; x: number; y: number; w: number; hatch: string }) {
	const lost = () => has(props.s.lost, props.t());
	const have = () => has(props.s.have, props.t());
	const f = () => fill(props.s, props.t());
	const missing = () => has(props.s.missing, props.t()) && !have() && !lost();

	return (
		<g>
			<Show when={have() && !lost()}>
				<rect x={props.x} y={props.y} width={props.w} height={TRACK_H} fill={COLOR.have} />
			</Show>
			<Show when={f() > 0 && !lost()}>
				<rect x={props.x} y={props.y} width={props.w * f()} height={TRACK_H} fill={COLOR.done} />
			</Show>
			<Show when={missing()}>
				<rect
					x={props.x + 1}
					y={props.y + 2}
					width={props.w - 2}
					height={TRACK_H - 4}
					fill="none"
					stroke={COLOR.missing}
					stroke-dasharray="3 2"
				/>
			</Show>
			<Show when={lost()}>
				<rect x={props.x} y={props.y} width={props.w} height={TRACK_H} fill={props.hatch} />
			</Show>
		</g>
	);
}

// A word is drawn in ink on the green fill, or scribbled out if any of it was lost.
function WordView(props: {
	word: Word;
	segments: Segment[];
	t: Accessor<number>;
	x: (ts: number) => number;
	y: number;
}) {
	const overlap = props.segments.filter((s) => s.ts < props.word.end && s.ts + FRAME > props.word.start);
	const lost = () => overlap.some((s) => has(s.lost, props.t()));

	const x1 = props.x(props.word.start);
	const x2 = props.x(props.word.end);
	const mid = props.y + TRACK_H / 2;

	return (
		<Show
			when={!lost()}
			fallback={<SpriteView sprite={ART.garbled} t={props.t} x={(x1 + x2) / 2} y={mid} w={x2 - x1} h={16} stretch />}
		>
			<text x={(x1 + x2) / 2} y={mid + 5} text-anchor="middle" font-weight="bold" fill={COLOR.ink}>
				{props.word.text}
			</text>
		</Show>
	);
}

function Network(props: ViewProps & { packets: Packet[]; loss: Loss }) {
	const y0 = TOP_Y + TRACK_H;
	const y1 = BOTTOM_Y;
	const mid = (y0 + y1) / 2;

	// The kraken eats every packet sent while it's around; shade the slice it has chewed so far.
	const lost = props.packets.filter((p) => p.lost);
	const eaten = () => lost.filter((p) => p.sent <= props.t());
	const kraken = () => props.t() >= props.loss.start && props.t() < props.loss.end + 0.3 && eaten().length > 0;
	const from = () => props.x(lost[0]?.ts ?? 0);
	const to = () => props.x((eaten().at(-1)?.ts ?? 0) + FRAME);

	return (
		<g>
			<text
				x={GUTTER / 2 - 4}
				y={mid + 4}
				text-anchor="middle"
				fill={COLOR.dim}
				font-size="10"
				font-family="'JetBrains Mono', monospace"
				letter-spacing="1"
			>
				NET
			</text>
			<Show when={kraken()}>
				<rect
					x={from()}
					y={y0 + 8}
					width={to() - from()}
					height={y1 - y0 - 16}
					rx="6"
					fill="rgba(239, 68, 68, 0.12)"
					opacity={props.t() < props.loss.end ? 1 : 0.4}
				/>
				{/* Chase the chewing edge, unless that would fall off the right side. */}
				<SpriteView sprite={ART.kraken} t={props.t} x={to() + 40 > W ? from() - 22 : to() + 22} y={mid} w={40} />
			</Show>
			<For each={props.packets}>
				{(p) => <PacketView p={p} t={props.t} x={props.x(p.ts + FRAME / 2)} y0={y0 + 4} y1={y1 - 4} />}
			</For>
		</g>
	);
}

function PacketView(props: { p: Packet; t: Accessor<number>; x: number; y0: number; y1: number }) {
	const lerp = (k: number) => props.y0 + (props.y1 - props.y0) * k;
	const first = () => (props.t() - props.p.sent) / FLIGHT;
	const rtx = () => (props.p.rtx === undefined ? -1 : (props.t() - props.p.rtx) / FLIGHT);

	// Lost packets die halfway, where the kraken lives.
	const flying = () => first() >= 0 && first() <= (props.p.lost ? 0.5 : 1);
	const dead = () => props.p.lost && first() > 0.5 && first() < 3;
	const fade = () => 1 - (first() - 0.5) / 2.5;

	return (
		<g>
			<Show when={flying()}>
				<circle cx={props.x} cy={lerp(first())} r="3.5" fill={props.p.lost ? COLOR.lost : COLOR.done} />
			</Show>
			<Show when={dead()}>
				<text x={props.x} y={lerp(0.5) + 4} text-anchor="middle" fill={COLOR.lost} font-weight="bold" opacity={fade()}>
					×
				</text>
			</Show>
			<Show when={rtx() >= 0 && rtx() <= 1}>
				<circle cx={props.x} cy={lerp(rtx())} r="3.5" fill={COLOR.missing} />
			</Show>
		</g>
	);
}

// The bottom lane's reply, in a speech bubble pointing back at its avatar.
function Bubble(props: { reply: Panel["reply"]; t: Accessor<number> }) {
	const color = props.reply.good ? COLOR.done : COLOR.lost;
	// SVG text can't be measured before render; ~7.5 units per character at 13px is close enough.
	const w = props.reply.text.length * 7.5 + 28;
	const x = GUTTER;
	const y = BUBBLE_Y;

	return (
		<g opacity={props.t() >= props.reply.at ? 1 : 0} style={{ transition: "opacity 0.3s" }}>
			<path
				d={`M${x + 12} ${y} L${x - 8} ${y - 10} L${x + 26} ${y}`}
				fill={COLOR.track}
				stroke={color}
				stroke-width="1.5"
				stroke-linejoin="round"
			/>
			<rect x={x} y={y} width={w} height={BUBBLE_H} rx="12" fill={COLOR.track} stroke={color} stroke-width="1.5" />
			{/* Hide the tail's base where it meets the bubble. */}
			<line x1={x + 13} x2={x + 25} y1={y} y2={y} stroke={COLOR.track} stroke-width="2.5" />
			<text x={x + 14} y={y + BUBBLE_H / 2 + 5} fill={COLOR.text} font-size="13">
				{props.reply.text}
			</text>
		</g>
	);
}
