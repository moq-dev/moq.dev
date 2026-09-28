import { type Accessor, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";
import { FLIGHT, FRAME, fill, has, head, type Loss, type Packet, type Segment, type Word } from "./sim";

// Every drawn element can be swapped for a hand-drawn image (PNG/SVG under /public).
// Sizes are in viewBox units, where the diagram is 600 wide; draw at 4x for crisp output.
// An array of images cycles at FPS, like hand-drawn animation. Frames follow the clock, so scrubbing works.
export type Sprite = string | string[];

export interface Art {
	kraken?: Sprite; // 28x28, chases the edge of the packet loss
	packet?: Sprite; // 8x8, a packet in flight
	retransmit?: Sprite; // 8x8, a retransmitted packet in flight
	lost?: Sprite; // 10x10, where a lost packet died
	you?: Sprite; // 36x36, replaces the "you" lane label
	ai?: Sprite; // 36x36, replaces the "AI" lane label
	backdrop?: string; // 600 x 176 per panel, drawn under everything
	overlay?: string; // 600 x 176 per panel, drawn over everything
	font?: string; // CSS font-family for all text; the page has to load it
	wobble?: boolean; // roughen the generated shapes so they sit next to hand-drawn art
}

const FPS = 8;

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
	result: { at: number; text: string; good: boolean };
}

export interface Props {
	axis: number; // media seconds shown on the x-axis
	end: number; // wall-clock seconds until the animation settles
	panels: Panel[];
	legend: { have: string; done: string };
	label: string; // accessible description of the whole animation
	art?: Art;
}

const HOLD = 2.5; // seconds to linger on the final frame before looping
const SPEEDS = [0.5, 1, 0.25];

const W = 600;
const GUTTER = 44;
const TRACK_W = W - GUTTER - 8;
const TRACK_H = 26;
const PANEL_H = 176;
const TOP_Y = 28;
const BOTTOM_Y = 118;

const COLOR = {
	done: "#22c55e",
	have: "rgba(34, 197, 94, 0.28)",
	missing: "#f59e0b",
	lost: "#ef4444",
	track: "#1e293b",
	text: "#f1f5f9",
	dim: "#64748b",
	title: "#cbd5e1",
};

export function Diagram(props: Props) {
	const [t, setT] = createSignal(0);
	const [playing, setPlaying] = createSignal(false);
	const [speed, setSpeed] = createSignal(SPEEDS[0]);
	const now = () => Math.min(t(), props.end);
	const id = createUniqueId();

	let root!: HTMLDivElement;

	onMount(() => {
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setT(props.end);
			return;
		}

		let last = performance.now();
		let frame = 0;
		const tick = (time: number) => {
			const dt = (time - last) / 1000;
			last = time;
			if (playing()) {
				const next = t() + dt * speed();
				setT(next > props.end + HOLD ? 0 : next);
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

	return (
		<div ref={root} class="not-prose my-8 select-none">
			<svg
				viewBox={`0 0 ${W} ${PANEL_H * props.panels.length}`}
				class="w-full"
				font-size="12"
				font-family={props.art?.font}
				role="img"
				aria-label={props.label}
			>
				<defs>
					<pattern id={`${id}-lost`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="6" height="6" fill="rgba(239, 68, 68, 0.25)" />
						<rect width="2" height="6" fill={COLOR.lost} />
					</pattern>
					<filter id={`${id}-wobble`}>
						<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" />
						<feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
					</filter>
				</defs>
				<For each={props.panels}>
					{(panel, i) => (
						<g transform={`translate(0 ${i() * PANEL_H})`}>
							<PanelView
								panel={panel}
								t={now}
								x={x}
								art={props.art ?? {}}
								hatch={`url(#${id}-lost)`}
								wobble={props.art?.wobble ? `url(#${id}-wobble)` : undefined}
							/>
						</g>
					)}
				</For>
			</svg>

			<div class="mt-2 flex items-center gap-3 text-sm text-slate-400">
				<button
					type="button"
					class="w-8 rounded bg-slate-800 py-1 text-slate-200 hover:bg-slate-700"
					onClick={() => {
						if (t() >= props.end) setT(0);
						setPlaying(!playing());
					}}
					aria-label={playing() ? "Pause" : "Play"}
				>
					{playing() ? "❚❚" : "▶"}
				</button>
				<input
					type="range"
					class="flex-1 accent-green-500"
					min="0"
					max={props.end}
					step="0.01"
					value={now()}
					onInput={(e) => {
						setPlaying(false);
						setT(e.currentTarget.valueAsNumber);
					}}
					aria-label="Time"
				/>
				<button
					type="button"
					class="w-12 rounded bg-slate-800 py-1 tabular-nums text-slate-200 hover:bg-slate-700"
					onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length])}
					aria-label="Playback speed"
				>
					{speed()}×
				</button>
				<span class="w-10 text-right tabular-nums">{now().toFixed(1)}s</span>
			</div>

			<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
				<Swatch fill={COLOR.done}>{props.legend.done}</Swatch>
				<Swatch fill={COLOR.have}>{props.legend.have}</Swatch>
				<Swatch stroke={COLOR.missing}>waiting for retransmit</Swatch>
				<Swatch fill={`url(#${id}-lost)`}>lost forever</Swatch>
			</div>
		</div>
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
	art: Art;
	hatch: string;
	wobble?: string;
}

function SpriteView(props: {
	sprite: Sprite;
	t: Accessor<number>;
	x: number;
	y: number;
	size: number;
	opacity?: number;
}) {
	const href = () => {
		const s = props.sprite;
		return Array.isArray(s) ? s[Math.floor(props.t() * FPS) % s.length] : s;
	};
	return (
		<image
			href={href()}
			x={props.x - props.size / 2}
			y={props.y - props.size / 2}
			width={props.size}
			height={props.size}
			opacity={props.opacity}
			preserveAspectRatio="xMidYMid meet"
		/>
	);
}

function PanelView(props: ViewProps & { panel: Panel }) {
	const p = props.panel;
	return (
		<>
			<Show when={props.art.backdrop}>{(href) => <image href={href()} width={W} height={PANEL_H} />}</Show>
			<text x={GUTTER} y="16" fill={COLOR.title} font-weight="bold" font-size="14">
				{p.title}
				<tspan fill={COLOR.dim} font-weight="normal" font-size="12" dx="8">
					{p.subtitle}
				</tspan>
			</text>

			<Network {...props} packets={p.packets} loss={p.loss} />
			<TrackView {...props} track={p.top} y={TOP_Y} notes="below" />
			<TrackView {...props} track={p.bottom} y={BOTTOM_Y} notes="above" />

			<text
				x={GUTTER}
				y={BOTTOM_Y + TRACK_H + 20}
				fill={p.result.good ? COLOR.done : COLOR.lost}
				font-size="13"
				opacity={props.t() >= p.result.at ? 1 : 0}
				style={{ transition: "opacity 0.3s" }}
			>
				{p.result.text}
			</text>

			<Show when={props.art.overlay}>{(href) => <image href={href()} width={W} height={PANEL_H} />}</Show>
		</>
	);
}

function TrackView(props: ViewProps & { track: Track; y: number; notes: "above" | "below" }) {
	const w = () => props.x(FRAME) - props.x(0);
	const pos = () => head(props.track.segments, props.t());
	const note = () => props.track.note?.(props.t());

	return (
		<g>
			<Show
				when={props.art[props.track.who]}
				fallback={
					<text x={GUTTER - 8} y={props.y + 17} fill={COLOR.dim} text-anchor="end">
						{props.track.who === "ai" ? "AI" : "you"}
					</text>
				}
			>
				{(sprite) => <SpriteView sprite={sprite()} t={props.t} x={GUTTER / 2} y={props.y + TRACK_H / 2} size={36} />}
			</Show>
			<g filter={props.wobble}>
				<rect x={GUTTER} y={props.y} width={TRACK_W} height={TRACK_H} rx="4" fill={COLOR.track} />
				<For each={props.track.segments}>
					{(s) => <SegmentView s={s} t={props.t} x={props.x(s.ts)} y={props.y} w={w()} hatch={props.hatch} />}
				</For>
			</g>

			<For each={props.track.words}>
				{(word) => <WordView word={word} segments={props.track.segments} t={props.t} x={props.x} y={props.y} />}
			</For>

			<Show when={pos() > 0}>
				<line
					x1={props.x(pos())}
					x2={props.x(pos())}
					y1={props.y - 3}
					y2={props.y + TRACK_H + 3}
					stroke={COLOR.text}
					stroke-width="2"
				/>
			</Show>
			<Show when={note()}>
				<text
					x={props.x(pos()) + 6}
					y={props.notes === "above" ? props.y - 6 : props.y + TRACK_H + 14}
					fill={COLOR.missing}
					font-size="11"
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
					y={props.y + 1}
					width={props.w - 2}
					height={TRACK_H - 2}
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

function WordView(props: {
	word: Word;
	segments: Segment[];
	t: Accessor<number>;
	x: (ts: number) => number;
	y: number;
}) {
	const overlap = props.segments.filter((s) => s.ts < props.word.end && s.ts + FRAME > props.word.start);
	const lost = () => overlap.some((s) => has(s.lost, props.t()));
	const done = () => overlap.every((s) => fill(s, props.t()) >= 1);

	const x1 = props.x(props.word.start);
	const x2 = props.x(props.word.end);
	const mid = props.y + TRACK_H / 2;

	return (
		<g>
			<text
				x={(x1 + x2) / 2}
				y={mid + 4}
				text-anchor="middle"
				font-weight="bold"
				fill={lost() ? "#fecaca" : done() ? "#0f172a" : COLOR.dim}
			>
				{props.word.text}
			</text>
			<Show when={lost()}>
				<line x1={x1} x2={x2} y1={mid} y2={mid} stroke={COLOR.lost} stroke-width="2" />
			</Show>
		</g>
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
			<Show when={kraken()}>
				<rect
					x={from()}
					y={y0 + 4}
					width={to() - from()}
					height={y1 - y0 - 8}
					rx="4"
					fill="rgba(239, 68, 68, 0.15)"
					opacity={props.t() < props.loss.end ? 1 : 0.4}
				/>
				{/* Chase the chewing edge, unless that would fall off the right side. */}
				<Show
					when={props.art.kraken}
					fallback={
						<text x={to() + 26 > W ? from() - 24 : to() + 4} y={mid + 6} font-size="18">
							🐙
						</text>
					}
				>
					{(sprite) => (
						<SpriteView sprite={sprite()} t={props.t} x={to() + 30 > W ? from() - 16 : to() + 16} y={mid} size={28} />
					)}
				</Show>
			</Show>
			<For each={props.packets}>
				{(p) => <PacketView p={p} t={props.t} art={props.art} x={props.x(p.ts + FRAME / 2)} y0={y0} y1={y1} />}
			</For>
		</g>
	);
}

function PacketView(props: { p: Packet; t: Accessor<number>; art: Art; x: number; y0: number; y1: number }) {
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
				<Show
					when={props.art.packet}
					fallback={<circle cx={props.x} cy={lerp(first())} r="3" fill={props.p.lost ? COLOR.lost : COLOR.done} />}
				>
					{(sprite) => <SpriteView sprite={sprite()} t={props.t} x={props.x} y={lerp(first())} size={8} />}
				</Show>
			</Show>
			<Show when={dead()}>
				<Show
					when={props.art.lost}
					fallback={
						<text
							x={props.x}
							y={lerp(0.5) + 4}
							text-anchor="middle"
							fill={COLOR.lost}
							font-weight="bold"
							opacity={fade()}
						>
							×
						</text>
					}
				>
					{(sprite) => (
						<SpriteView sprite={sprite()} t={props.t} x={props.x} y={lerp(0.5)} size={10} opacity={fade()} />
					)}
				</Show>
			</Show>
			<Show when={rtx() >= 0 && rtx() <= 1}>
				<Show
					when={props.art.retransmit}
					fallback={<circle cx={props.x} cy={lerp(rtx())} r="3" fill={COLOR.missing} />}
				>
					{(sprite) => <SpriteView sprite={sprite()} t={props.t} x={props.x} y={lerp(rtx())} size={8} />}
				</Show>
			</Show>
		</g>
	);
}
