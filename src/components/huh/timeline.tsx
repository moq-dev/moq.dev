// Section 3: an encoder's keyframes and deltas trickling out one QUIC stream per group, into the viewer's video and
// audio ribbons. Squeeze the bandwidth, and choose whether stale group tails are reset or delivered late.
import { createMemo, createSignal, createUniqueId, Index, onCleanup, onMount, Show } from "solid-js";
import { advance, animate } from "./clock";
import { BEHIND, FPS, type Frame, GOP, I_SIZE, type Kind, RATE, Sim } from "./groups";
import { Button, COLOR, Figure, MONO, Slider, Swatch } from "./ui";

const SPEED = 0.7; // slowed down so each frame can be followed
const PRESEED = 6;
const SETTLE = 3; // seconds to jump ahead after a control while motion is paused
const BANDWIDTH = { min: 0.7, max: 1.5, initial: 0.8 }; // of what the broadcast averages; it starts a little short

const W = 600;
const LEFT = 104;
const RIGHT = 596; // the live edge
const WINDOW = 5; // seconds of media across the timeline
const PXS = (RIGHT - LEFT) / WINDOW;
const FRAME_W = PXS / FPS;

const VIDEO_Y = 8; // the encoder's bars hang from their baseline, VIDEO_H below this
const VIDEO_H = 34;
const GROUP_Y = VIDEO_Y + VIDEO_H + 4;
const GROUP_H = 24;
const AUDIO_Y = GROUP_Y + GROUP_H + 8;
const AUDIO_H = 8;
const NET_Y = AUDIO_Y + AUDIO_H + 24;
const RIBBON_H = 16;
const RX_VIDEO_Y = NET_Y + 16;
const RX_AUDIO_Y = RX_VIDEO_Y + RIBBON_H + 22;
const H = RX_AUDIO_Y + RIBBON_H + 18;

interface Group {
	group: number;
	x0: number;
	x1: number;
	state: "open" | "done" | "reset";
}

export default function TimelineDiagram() {
	const sim = new Sim();
	const [bandwidth, setBandwidth] = createSignal(BANDWIDTH.initial * RATE);
	const [reset, setReset] = createSignal(true);
	const [frame, redraw] = createSignal(undefined, { equals: false });
	const id = createUniqueId();

	const tick = (dt: number) => {
		sim.step(dt * SPEED, { bandwidth: bandwidth(), reset: reset() });
		redraw();
	};
	advance(PRESEED / SPEED, tick);

	let root!: SVGSVGElement;
	let clock: ReturnType<typeof animate> | undefined;
	onMount(() => {
		clock = animate(root, tick);
		onCleanup(() => clock?.stop());
	});
	// What the diagram shows, as text for screen readers, written once a control's effect has played out rather
	// than on every frame.
	const [news, setNews] = createSignal("");
	let report: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(report));
	const describe = () => {
		const video = sim.latency("video").toFixed(1);
		const audio = sim.latency("audio").toFixed(1);
		const dropped = sim.frames.filter((f) => f.reset !== undefined && f.ts > sim.t - WINDOW).length;
		const policy = reset()
			? `${dropped} stale video frames reset in the last ${WINDOW} seconds.`
			: "Every video frame is sent, oldest first.";
		setNews(`Video is ${video} s behind live and audio ${audio} s. ${policy}`);
	};

	const changed = () => {
		clearTimeout(report);
		if (clock?.live()) {
			redraw();
			report = setTimeout(describe, (SETTLE / SPEED) * 1000);
		} else {
			advance(SETTLE / SPEED, tick);
			describe();
		}
	};

	const x = (ts: number) => RIGHT - (sim.t - ts) * PXS;

	const view = createMemo(() => {
		frame();
		const from = sim.t - WINDOW - 1 / FPS;
		// Copies, since the simulation mutates its frames in place and the drawing redraws on new values.
		const visible = sim.frames.filter((f) => f.ts > from).map((f) => ({ ...f }));
		const video = visible.filter((f) => f.kind === "video");
		const audio = visible.filter((f) => f.kind === "audio");

		const groups: Group[] = [];
		for (const f of video) {
			let g = groups.at(-1);
			if (g?.group !== f.group) {
				g = { group: f.group, x0: x(f.group * (GOP / FPS)), x1: 0, state: "done" };
				groups.push(g);
			}
			g.x1 = Math.min(RIGHT, x(f.ts) + FRAME_W);
			if (f.reset !== undefined) g.state = "reset";
			else if (f.arrived === undefined && g.state !== "reset") g.state = "open";
		}
		// The newest group is still being written, so its stream stays open even once it's caught up.
		const last = groups.at(-1);
		if (last && last.state === "done") last.state = "open";

		return {
			video,
			audio,
			groups,
			played: { video: sim.playable("video"), audio: sim.playable("audio") },
			behind: { video: sim.latency("video"), audio: sim.latency("audio") },
		};
	});

	const label =
		"A video encoder writes a keyframe and then small delta frames, starting a new group at each keyframe. Each group travels on its own QUIC stream, frame by frame as it is encoded, and audio is sent first. When bandwidth runs short, sending the newest group first and resetting the old group's unsent tail keeps the viewer near the live edge; sending every frame in order makes it fall further behind.";

	return (
		<Figure
			label={label}
			controls={
				<>
					<Slider
						label="bandwidth"
						min={BANDWIDTH.min * RATE}
						max={BANDWIDTH.max * RATE}
						step={5}
						value={bandwidth()}
						text={`${Math.round(bandwidth())} kb/s`}
						onInput={(v) => {
							setBandwidth(v);
							changed();
						}}
					/>
					<Button
						pressed={reset()}
						onClick={() => {
							setReset(!reset());
							changed();
						}}
					>
						Skip stale frames
					</Button>
					<span class="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
						<Swatch color={COLOR.green}>arrived</Swatch>
						<Swatch color={COLOR.neutral} outline>
							waiting
						</Swatch>
						<Swatch color={COLOR.red} hatch>
							reset
						</Swatch>
					</span>
				</>
			}
		>
			<svg ref={root} viewBox={`0 0 ${W} ${H}`} class="block w-full" aria-hidden="true">
				<defs>
					<pattern id={`${id}-reset`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="5" height="5" fill="rgba(239, 68, 68, 0.15)" />
						<rect width="1.5" height="5" fill={COLOR.red} />
					</pattern>
				</defs>

				<Gutter y={VIDEO_Y + VIDEO_H / 2} title="encoder" subtitle="video" />
				<Index each={view().video}>{(f) => <Bar f={f()} x={x(f().ts)} hatch={`url(#${id}-reset)`} />}</Index>

				<Gutter y={GROUP_Y + GROUP_H / 2} subtitle="1 stream / group" />
				<Index each={view().groups}>{(g) => <GroupView g={g()} />}</Index>

				<Gutter y={AUDIO_Y + AUDIO_H / 2} subtitle="audio" />
				<Index each={view().audio}>
					{(f) => (
						<rect
							x={x(f().ts) + 0.5}
							y={AUDIO_Y}
							width={FRAME_W - 1}
							height={AUDIO_H}
							rx="1.5"
							fill={f().arrived !== undefined ? COLOR.sky : "none"}
							stroke={f().arrived !== undefined ? "none" : COLOR.neutral}
							stroke-width="0.75"
						/>
					)}
				</Index>

				<line x1={LEFT} x2={RIGHT} y1={NET_Y} y2={NET_Y} stroke={COLOR.line} stroke-dasharray="2 4" />
				<text x={LEFT} y={NET_Y - 4} fill={COLOR.dim} font-size="10" font-family={MONO}>
					{reset() ? "QUIC · AUDIO FIRST, THEN THE NEWEST VIDEO GROUP" : "QUIC · AUDIO FIRST, THEN VIDEO OLDEST FIRST"}
				</text>
				<Show when={!reset()}>
					<text x={RIGHT} y={NET_Y - 4} text-anchor="end" fill={COLOR.dim} font-size="10" font-family={MONO}>
						{`SKIPS AHEAD PAST ${BEHIND} S BEHIND`}
					</text>
				</Show>

				<Ribbon
					kind="video"
					y={RX_VIDEO_Y}
					frames={view().video}
					played={view().played.video}
					behind={view().behind.video}
					x={x}
					hatch={`url(#${id}-reset)`}
				/>
				<Ribbon
					kind="audio"
					y={RX_AUDIO_Y}
					frames={view().audio}
					played={view().played.audio}
					behind={view().behind.audio}
					x={x}
					hatch={`url(#${id}-reset)`}
				/>
			</svg>
			<p class="mt-3 min-h-5 text-xs text-ink-3" aria-live="polite">
				{news()}
			</p>
		</Figure>
	);
}

function Gutter(props: { y: number; title?: string; subtitle: string }) {
	return (
		<g>
			<Show when={props.title}>
				<text x={0} y={props.y - 4} fill={COLOR.text} font-size="13" font-weight="600">
					{props.title}
				</text>
			</Show>
			<text x={0} y={props.y + (props.title ? 10 : 4)} fill={COLOR.neutral} font-size="11">
				{props.subtitle}
			</text>
		</g>
	);
}

// One encoded video frame, as tall as it is big, filling up as its bytes go out.
function Bar(props: { f: Frame; x: number; hatch: string }) {
	const h = () => (props.f.size / I_SIZE) * VIDEO_H;
	const y = () => VIDEO_Y + VIDEO_H - h();
	const sent = () => (props.f.sent / props.f.size) * h();
	const key = () => props.f.index === 0;
	return (
		<g>
			<rect
				x={props.x + 0.5}
				y={y()}
				width={FRAME_W - 1}
				height={h()}
				rx="1.5"
				fill={props.f.reset !== undefined ? props.hatch : "none"}
				stroke={props.f.reset !== undefined ? "none" : COLOR.neutral}
				stroke-width="0.75"
			/>
			<Show when={props.f.reset === undefined && sent() > 0}>
				<rect
					x={props.x + 0.5}
					y={y() + h() - sent()}
					width={FRAME_W - 1}
					height={sent()}
					rx="1.5"
					fill={key() ? "#16a34a" : COLOR.green}
				/>
			</Show>
			<Show when={key()}>
				<text
					x={props.x + FRAME_W / 2}
					y={y() + 11}
					text-anchor="middle"
					fill={props.f.sent > props.f.size * 0.3 ? "#052e16" : COLOR.text}
					font-size="10"
					font-weight="bold"
					font-family={MONO}
				>
					I
				</text>
			</Show>
		</g>
	);
}

function GroupView(props: { g: Group }) {
	const color = () => (props.g.state === "reset" ? COLOR.red : props.g.state === "open" ? COLOR.green : COLOR.neutral);
	const text = () => (props.g.state === "reset" ? "RESET" : props.g.state === "open" ? "open" : "FIN");
	return (
		<Show when={props.g.x1 > LEFT}>
			<g>
				<rect
					x={Math.max(LEFT, props.g.x0) + 0.5}
					y={GROUP_Y}
					width={Math.max(0, props.g.x1 - Math.max(LEFT, props.g.x0) - 1)}
					height={GROUP_H}
					rx="3"
					fill={COLOR.track}
					stroke={color()}
					stroke-opacity="0.6"
				/>
				<Show when={props.g.x1 - Math.max(LEFT, props.g.x0) > 60}>
					<text x={Math.max(LEFT, props.g.x0) + 5} y={GROUP_Y + 10} fill={COLOR.text} font-size="10" font-family={MONO}>
						group {props.g.group}
					</text>
					<text x={Math.max(LEFT, props.g.x0) + 5} y={GROUP_Y + 20} fill={color()} font-size="10" font-family={MONO}>
						stream {text()}
					</text>
				</Show>
			</g>
		</Show>
	);
}

// What the viewer has: a contiguous strip of frames by media time, and the newest one it can play.
function Ribbon(props: {
	kind: Kind;
	y: number;
	frames: Frame[];
	played?: Frame;
	behind: number;
	x: (ts: number) => number;
	hatch: string;
}) {
	const color = props.kind === "video" ? COLOR.green : COLOR.sky;
	const head = () => (props.played ? props.x(props.played.ts) + FRAME_W : undefined);
	return (
		<g>
			<Gutter y={props.y + RIBBON_H / 2} title={props.kind === "video" ? "viewer" : undefined} subtitle={props.kind} />
			<rect x={LEFT} y={props.y} width={RIGHT - LEFT} height={RIBBON_H} rx="4" fill={COLOR.track} />
			<g shape-rendering="crispEdges">
				<Index each={props.frames}>
					{(f) => (
						<rect
							x={Math.max(LEFT, props.x(f().ts))}
							y={props.y}
							width={FRAME_W}
							height={RIBBON_H}
							fill={f().reset !== undefined ? props.hatch : f().arrived !== undefined ? color : "none"}
							opacity={f().index === 0 || props.kind === "audio" ? 1 : 0.75}
						/>
					)}
				</Index>
				{/* Group boundaries, butted together with no gap between them. */}
				<Index each={props.kind === "video" ? props.frames.filter((f) => f.index === 0) : []}>
					{(f) => (
						<line
							x1={props.x(f().ts)}
							x2={props.x(f().ts)}
							y1={props.y}
							y2={props.y + RIBBON_H}
							stroke={COLOR.track}
							stroke-width="1.5"
						/>
					)}
				</Index>
			</g>
			<rect x={LEFT} y={props.y} width={RIGHT - LEFT} height={RIBBON_H} rx="4" fill="none" stroke={COLOR.line} />
			<Show when={head() !== undefined && (head() as number) > LEFT}>
				<line
					x1={head()}
					x2={head()}
					y1={props.y - 3}
					y2={props.y + RIBBON_H + 3}
					stroke={COLOR.text}
					stroke-width="2"
					stroke-linecap="round"
				/>
			</Show>
			<text
				x={RIGHT}
				y={props.y + RIBBON_H + 12}
				text-anchor="end"
				fill={props.behind > 1.5 ? COLOR.amber : COLOR.neutral}
				font-size="11"
				font-family={MONO}
			>
				{props.behind >= WINDOW ? `${WINDOW}+ s behind` : `${props.behind.toFixed(1)} s behind live`}
			</text>
		</g>
	);
}
