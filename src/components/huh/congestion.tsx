// Section 2: ranked QUIC streams pouring into one congestion window. Squeeze it, rerank, open, and reset streams.
import { createMemo, createSignal, Index, onCleanup, onMount, Show } from "solid-js";
import { advance, animate } from "./clock";
import { MAX_QUEUE, move, STARVED, type Stream, step } from "./priority";
import { Button, COLOR, Figure, MONO, Slider, STREAM_COLORS, Swatch } from "./ui";

const START = [
	{ name: "audio", rate: 0.3 },
	{ name: "video", rate: 2 },
	{ name: "chat", rate: 0.2 },
	{ name: "upload", rate: 0.8 },
];
const OPENED_RATE = 0.5;
const CWND = { min: 0.8, max: 4, initial: 2.6 }; // slightly short of the 3.3 Mb/s everything wants
const PRESEED = 5; // seconds, so the bottom stream is visibly starving on first paint
const SETTLE = 2; // seconds to jump ahead after a control while motion is paused

const W = 600;
const TOP = 26;
const SCALE = 36; // px per Mb/s
const LX = 118; // what the streams want
const RX = 430; // what the window lets out
const BAR = 14;

export default function CongestionDiagram() {
	const colors = new Map<number, string>();
	let nextId = 0;
	const open = (name: string, rate: number): Stream => {
		const id = nextId++;
		const used = new Set(colors.values());
		colors.set(id, STREAM_COLORS.find((c) => !used.has(c)) ?? COLOR.neutral);
		return { id, name, rate, queued: 0, out: 0, starved: 0 };
	};

	const streams = START.map((s) => open(s.name, s.rate));
	const [cwnd, setCwnd] = createSignal(CWND.initial);
	const [news, setNews] = createSignal("");
	// The streams are mutated in place; this tells the drawing to catch up.
	const [frame, redraw] = createSignal(undefined, { equals: false });
	let time = 0;

	const tick = (dt: number) => {
		step(streams, cwnd(), dt);
		time += dt;
		redraw();
	};
	advance(PRESEED, tick);

	let root!: SVGSVGElement;
	let clock: ReturnType<typeof animate> | undefined;
	onMount(() => {
		clock = animate(root, tick);
		onCleanup(() => clock?.stop());
	});
	const changed = (message?: string) => {
		if (message) setNews(message);
		if (clock?.live()) redraw();
		else advance(SETTLE, tick);
	};

	// A fresh copy each frame, so the rows below redraw.
	const view = createMemo(() => {
		frame();
		return { t: time, streams: streams.map((s) => ({ ...s, color: colors.get(s.id) ?? COLOR.neutral })) };
	});

	const rank = (i: number, by: -1 | 1) => {
		move(streams, i, by);
		changed();
	};
	const reset = (i: number) => {
		const [s] = streams.splice(i, 1);
		colors.delete(s.id);
		changed(`Reset ${s.name} mid-flight: ${s.queued.toFixed(1)} Mb dropped, the rest untouched.`);
	};
	const add = () => {
		const s = open(`stream ${nextId + 1}`, OPENED_RATE);
		streams.unshift(s);
		changed(`Opened ${s.name} at the top rank: no handshake, it sends on its first packet.`);
	};

	// Tall enough for the wider end of the funnel and the cwnd label under its neck.
	const height = () =>
		TOP +
		Math.max(
			view().streams.reduce((n, s) => n + s.rate, 0),
			cwnd(),
		) *
			SCALE +
		22;

	const label =
		"Streams ranked from top to bottom share one congestion window. Each takes all the bandwidth it needs before the next one gets any, so when the window is too small, the lowest-ranked streams starve until they are moved up or reset.";

	return (
		<Figure
			label={label}
			controls={
				<>
					<Slider
						label="cwnd"
						min={CWND.min}
						max={CWND.max}
						step={0.1}
						value={cwnd()}
						text={`${cwnd().toFixed(1)} Mb/s`}
						onInput={(v) => {
							setCwnd(v);
							changed();
						}}
					/>
					<Button onClick={add} disabled={view().streams.length >= STREAM_COLORS.length}>
						+ Open a stream
					</Button>
					<span class="ml-auto">
						<Swatch color={COLOR.amber}>queued, waiting for the window</Swatch>
					</span>
				</>
			}
		>
			<svg ref={root} viewBox={`0 0 ${W} ${height()}`} class="block w-full" aria-hidden="true">
				<Funnel streams={view().streams} cwnd={cwnd()} t={view().t} />
			</svg>

			<ol class="mt-3 flex flex-col gap-1.5" aria-label="Streams, highest priority first">
				<Index each={view().streams}>
					{(s, i) => (
						<li class="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm sm:grid-cols-[1.25rem_7rem_1fr_auto]">
							<span class="font-mono text-xs text-ink-3">{i + 1}</span>
							<span class="flex items-center gap-2">
								<span class="inline-block size-2.5 rounded-full" style={{ background: s().color }} />
								<span class="text-ink">{s().name}</span>
							</span>
							<span class="col-span-3 col-start-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
								<span class="h-1.5 w-20 overflow-hidden rounded-full sm:w-28" style={{ background: COLOR.track }}>
									<span
										class="block h-full rounded-full"
										style={{ width: `${(s().queued / MAX_QUEUE) * 100}%`, background: COLOR.amber }}
									/>
								</span>
								<span class="font-mono text-xs" style={{ color: s().starved > 0.5 ? COLOR.amber : COLOR.neutral }}>
									{s().starved > 0.5
										? `starving ${s().starved.toFixed(0)} s`
										: `${s().out.toFixed(1)} of ${s().rate.toFixed(1)} Mb/s`}
								</span>
							</span>
							<span class="flex items-center gap-1">
								<Button label={`Move ${s().name} up`} disabled={i === 0} onClick={() => rank(i, -1)} class="px-2!">
									▲
								</Button>
								<Button
									label={`Move ${s().name} down`}
									disabled={i === view().streams.length - 1}
									onClick={() => rank(i, 1)}
									class="px-2!"
								>
									▼
								</Button>
								<Button
									label={`Reset ${s().name}`}
									onClick={() => reset(i)}
									pressed={s().starved > 0.5}
									class="font-mono text-xs!"
								>
									RESET
								</Button>
							</span>
						</li>
					)}
				</Index>
			</ol>
			<p class="mt-2 min-h-5 text-xs text-ink-3" aria-live="polite">
				{news()}
			</p>
		</Figure>
	);
}

type View = Stream & { color: string };

// What each stream wants on the left, narrowing through the congestion window to what it gets on the right.
function Funnel(props: { streams: View[]; cwnd: number; t: number }) {
	const layout = createMemo(() => {
		let want = TOP;
		let got = TOP;
		return props.streams.map((s) => {
			const band = { s, l0: want, l1: want + s.rate * SCALE, r0: got, r1: got + s.out * SCALE };
			want = band.l1;
			got = band.r1;
			return band;
		});
	});
	const demand = () => props.streams.reduce((n, s) => n + s.rate, 0);
	const neck = () => TOP + props.cwnd * SCALE;
	const mx = (LX + RX) / 2;

	return (
		<g>
			{/* The funnel: everything wanted on the left, the window's width on the right. */}
			<path
				d={`M${LX + BAR} ${TOP - 4} L${RX} ${TOP - 4} L${RX} ${neck() + 4} L${LX + BAR} ${TOP + demand() * SCALE + 4}`}
				fill="none"
				stroke={COLOR.line}
				stroke-width="1.5"
				stroke-linejoin="round"
			/>
			<Index each={layout()}>
				{(b) => (
					<g>
						<path
							d={`M${LX + BAR} ${b().l0} C${mx} ${b().l0} ${mx} ${b().r0} ${RX} ${b().r0} L${RX} ${b().r1} C${mx} ${b().r1} ${mx} ${b().l1} ${LX + BAR} ${b().l1} Z`}
							fill={b().s.color}
							fill-opacity="0.22"
						/>
						<Show when={b().s.out > 0.05}>
							{/* Packets flowing down the middle of the band, thinned out to what actually gets through. */}
							<path
								d={`M${LX + BAR} ${(b().l0 + b().l1) / 2} C${mx} ${(b().l0 + b().l1) / 2} ${mx} ${(b().r0 + b().r1) / 2} ${RX} ${(b().r0 + b().r1) / 2}`}
								fill="none"
								stroke={b().s.color}
								stroke-width={Math.max(1.5, Math.min(5, (b().r1 - b().r0) * 0.4))}
								stroke-dasharray="3 9"
								stroke-dashoffset={-props.t * 40}
								stroke-linecap="round"
							/>
						</Show>
						<rect x={LX} y={b().l0} width={BAR} height={Math.max(0, b().l1 - b().l0 - 1)} fill={b().s.color} />
						<rect
							x={RX}
							y={b().r0}
							width={BAR}
							height={Math.max(0, b().r1 - b().r0 - 1)}
							fill={b().s.color}
							opacity={b().s.out < b().s.rate * STARVED ? 0.4 : 1}
						/>
						<Show when={b().l1 - b().l0 >= 9}>
							<text x={LX - 6} y={(b().l0 + b().l1) / 2 + 4} text-anchor="end" fill={COLOR.text} font-size="12">
								{b().s.name}
							</text>
						</Show>
						<Show when={b().r1 - b().r0 >= 9}>
							<text
								x={RX + BAR + 6}
								y={(b().r0 + b().r1) / 2 + 4}
								fill={COLOR.neutral}
								font-size="11"
								font-family={MONO}
							>
								{b().s.out.toFixed(1)}
							</text>
						</Show>
					</g>
				)}
			</Index>
			<text x={RX + BAR + 6} y={neck() + 14} fill={COLOR.green} font-size="11" font-family={MONO}>
				cwnd {props.cwnd.toFixed(1)}
			</text>
			<text x={LX + BAR / 2} y={10} text-anchor="middle" fill={COLOR.dim} font-size="11" font-family={MONO}>
				WANTS {demand().toFixed(1)} Mb/s
			</text>
			<text x={RX + BAR / 2} y={10} text-anchor="middle" fill={COLOR.dim} font-size="11" font-family={MONO}>
				SENT
			</text>
		</g>
	);
}
