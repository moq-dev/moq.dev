// Section 1: the same three streams over HTTP/2 (one TCP byte stream) and over QUIC, losing the same packet.
import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import { advance, animate } from "./clock";
import { DETECT, FLIGHT, GAP, HISTORY, type Order, STREAMS, send } from "./hol";
import { Button, COLOR, Figure, MONO, STREAM_COLORS, Swatch } from "./ui";

const KRAKEN = ["/voice/kraken-1.svg", "/voice/kraken-2.svg"];
const KRAKEN_FPS = 4;

const SPEED = 0.6; // slowed down so each packet can be followed
const START = 3.5; // pre-seeded so the first paint shows packets waiting on a retransmit

// Until the first click, the network eats one packet every AUTO packets on its own.
const AUTO = 40;
const AUTO_AT = 14;

const W = 600;
const X0 = 104; // the network, from sender to receiver
const X1 = 420;
const APP0 = 434; // the application, reading what the receiver released
const APP1 = 596;
const HEAD = 18;
const ROW_H = 78;
const ROW_GAP = 22;
const LANE = 20;
const DOT = 4;
const PX = (X1 - X0) / FLIGHT; // pixels per second, in the network and after it

type Transport = "webtransport" | "quic" | "websocket";

interface Row {
	title: string;
	subtitle: string;
	order: Order;
}

const HTTP2: Row = { title: "HTTP/2", subtitle: "over TCP", order: "connection" };

// The transports MoQ runs on, each drawn as the second row when picked.
const TRANSPORTS: Record<Transport, Row & { name: string; detail: string; badge: string }> = {
	webtransport: {
		name: "WebTransport",
		detail: "HTTP/3 over QUIC, in browsers",
		badge: "RFC 9000",
		title: "HTTP/3",
		subtitle: "over QUIC",
		order: "stream",
	},
	quic: {
		name: "Raw QUIC",
		detail: "native apps, no HTTP/3",
		badge: "RFC 9000",
		title: "Raw QUIC",
		subtitle: "RFC 9000",
		order: "stream",
	},
	websocket: {
		name: "WebSocket fallback",
		detail: "qmux over TCP",
		badge: "Project draft",
		title: "WebSocket",
		subtitle: "qmux over TCP",
		order: "connection",
	},
};

interface Dot {
	x: number;
	y: number;
	color: string;
	state: "flying" | "retransmit" | "waiting" | "delivered";
}

export default function TransportDiagram() {
	const [t, setT] = createSignal(START);
	const [transport, setTransport] = createSignal<Transport>("webtransport");
	const manual = new Set<number>();
	const [drops, setDrops] = createSignal(0); // bumped on every click, to redraw
	const [news, setNews] = createSignal("");
	let auto = Number.POSITIVE_INFINITY; // sequence numbers from here on are only lost by a click

	const lost = (from: number, to: number) => {
		drops();
		const set = new Set(manual);
		for (let seq = Math.max(0, Math.floor(from / GAP)); seq * GAP < to && seq < auto; seq++) {
			if (seq % AUTO === AUTO_AT) set.add(seq);
		}
		return set;
	};

	let root!: SVGSVGElement;
	let clock: ReturnType<typeof animate> | undefined;
	const step = (dt: number) => setT((t) => t + dt * SPEED);

	onMount(() => {
		clock = animate(root, step);
		onCleanup(() => clock?.stop());
	});

	const drop = () => {
		const next = Math.ceil(t() / GAP);
		if (auto === Number.POSITIVE_INFINITY) auto = next;
		manual.add(next);
		setDrops((n) => n + 1);

		const stream = (next % STREAMS) + 1;
		const row = TRANSPORTS[transport()];
		const other =
			row.order === "connection"
				? `over ${row.title}, which also runs on TCP, every stream waits too.`
				: `over ${row.title}, only stream ${stream} waits.`;
		setNews(
			`Dropped packet ${next + 1}, from stream ${stream}. Over HTTP/2, every stream waits for the retransmit; ${other}`,
		);

		// With motion paused, jump to after the packets behind the loss arrive and before its retransmit does.
		if (!clock?.live()) advance((next * GAP - t() + (GAP + FLIGHT + DETECT + FLIGHT) / 2) / SPEED, step);
	};

	// Everything still on screen was sent after this.
	const losses = createMemo(() => lost(t() - HISTORY - FLIGHT - DETECT - 1, t() + GAP));

	const rows = (): Row[] => [HTTP2, TRANSPORTS[transport()]];

	// The krakens chew on the lost packet's first copy halfway across.
	const kraken = createMemo(() => {
		const now = t();
		for (const seq of losses()) {
			const age = now - seq * GAP;
			if (age > FLIGHT * 0.25 && age < FLIGHT * 0.5 + 0.5) return true;
		}
		return false;
	});

	const label =
		"Two connections carry the same three streams, and the network loses the same packet on both. Over HTTP/2 on TCP, every stream waits for the retransmit. Over QUIC, only the stream that lost the packet waits.";

	return (
		<Figure
			label={label}
			controls={
				<>
					<Button onClick={drop}>
						<img src={KRAKEN[0]} class="h-4 w-4" alt="" />
						Drop a packet
					</Button>
					<div class="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
						<For each={Array.from({ length: STREAMS }, (_, i) => i)}>
							{(i) => <Swatch color={STREAM_COLORS[i]}>stream {i + 1}</Swatch>}
						</For>
						<Swatch color={COLOR.amber} outline>
							waiting on a lost packet
						</Swatch>
					</div>
					<p class="min-h-5 w-full text-xs text-ink-3" aria-live="polite">
						{news()}
					</p>
					<Strip value={transport()} onChange={setTransport} />
				</>
			}
		>
			<svg ref={root} viewBox={`0 0 ${W} ${HEAD + 2 * ROW_H + ROW_GAP}`} class="block w-full" aria-hidden="true">
				<text x={(X0 + X1) / 2} y={11} text-anchor="middle" fill={COLOR.dim} font-size="11" font-family={MONO}>
					NETWORK
				</text>
				<text x={(APP0 + APP1) / 2} y={11} text-anchor="middle" fill={COLOR.dim} font-size="11" font-family={MONO}>
					APP
				</text>
				<Index each={rows()}>
					{(row, i) => (
						<RowView row={row()} y={HEAD + i * (ROW_H + ROW_GAP)} t={t()} lost={losses()} kraken={kraken()} />
					)}
				</Index>
			</svg>
		</Figure>
	);
}

function RowView(props: { row: Row; y: number; t: number; lost: ReadonlySet<number>; kraken: boolean }) {
	const lane = (stream: number) => props.y + LANE * (stream + 1) - 1;
	const mid = () => props.y + ROW_H / 2;
	const single = () => props.row.order === "connection";

	const view = createMemo(() => {
		const t = props.t;
		const packets = send(t - HISTORY - FLIGHT - DETECT - 1, t, props.lost, props.row.order);
		const dots: Dot[] = [];
		const deaths: { age: number; y: number }[] = [];
		const waiting = new Map<number, number>(); // per lane, how many are already stacked
		const blocked = new Set<number>();

		for (const p of packets) {
			const color = STREAM_COLORS[p.stream];
			const y = single() ? mid() : lane(p.stream);
			const leave = p.lost ? p.sent + DETECT : p.sent;

			if (p.lost && t >= p.sent) {
				const k = (t - p.sent) / FLIGHT;
				if (k < 0.5) dots.push({ x: X0 + k * (X1 - X0), y, color: COLOR.red, state: "flying" });
				else if (t - p.sent - FLIGHT * 0.5 < 1.2) deaths.push({ age: t - p.sent - FLIGHT * 0.5, y });
			}
			if (t < leave) continue;
			if (t < p.arrive) {
				const k = (t - leave) / FLIGHT;
				dots.push({ x: X0 + k * (X1 - X0), y, color, state: p.lost ? "retransmit" : "flying" });
			} else if (t < p.deliver) {
				// Stack against the receiver in arrival order, the newest furthest back.
				const key = single() ? 0 : p.stream;
				const n = waiting.get(key) ?? 0;
				waiting.set(key, n + 1);
				blocked.add(p.stream);
				dots.push({ x: X1 - DOT - 2 - n * (DOT * 2 + 1.5), y, color, state: "waiting" });
			} else {
				const x = APP0 + (t - p.deliver) * PX;
				if (x > APP1) continue;
				// Fan out of TCP's one lane into each stream's own.
				const fan = Math.min(1, (x - APP0) / 24);
				dots.push({ x, y: y + (lane(p.stream) - y) * fan, color, state: "delivered" });
			}
		}
		return { dots, deaths, blocked };
	});

	const status = () => {
		const blocked = [...view().blocked];
		if (blocked.length === 0) return { text: "flowing", color: COLOR.green };
		// Over TCP the stream behind the hole holds back every other stream too.
		if (single() || blocked.length === STREAMS) return { text: "all blocked", color: COLOR.amber };
		return { text: `${blocked.length} blocked`, color: COLOR.amber };
	};

	return (
		<g>
			<text x={0} y={mid() - 6} fill={COLOR.text} font-size="15" font-weight="600">
				{props.row.title}
			</text>
			<text x={0} y={mid() + 10} fill={COLOR.neutral} font-size="11">
				{props.row.subtitle}
			</text>
			<text x={0} y={mid() + 26} fill={status().color} font-size="11" font-family={MONO}>
				{status().text}
			</text>

			<rect x={X0 - 6} y={props.y} width={X1 - X0 + 12} height={ROW_H} rx="10" fill={COLOR.track} stroke={COLOR.line} />
			<Show
				when={single()}
				fallback={
					<For each={[0, 1, 2]}>
						{(s) => <line x1={X0} x2={X1} y1={lane(s)} y2={lane(s)} stroke={COLOR.line} stroke-dasharray="2 4" />}
					</For>
				}
			>
				<line x1={X0} x2={X1} y1={mid()} y2={mid()} stroke={COLOR.line} stroke-dasharray="2 4" />
				<text x={X0 + 4} y={props.y + 12} fill={COLOR.dim} font-size="10" font-family={MONO}>
					one ordered byte stream
				</text>
			</Show>
			<line x1={X1 + 6} x2={X1 + 6} y1={props.y + 4} y2={props.y + ROW_H - 4} stroke={COLOR.line} />

			<For each={[0, 1, 2]}>
				{(s) => (
					<line
						x1={APP0}
						x2={APP1}
						y1={lane(s)}
						y2={lane(s)}
						stroke={STREAM_COLORS[s]}
						stroke-opacity={view().blocked.has(s) ? 0.15 : 0.35}
						stroke-width="2"
						stroke-linecap="round"
					/>
				)}
			</For>

			<Index each={view().deaths}>
				{(death) => (
					<text
						x={(X0 + X1) / 2}
						y={death().y + 4}
						text-anchor="middle"
						fill={COLOR.red}
						font-weight="bold"
						opacity={Math.max(0, 1 - death().age / 1.2)}
					>
						×
					</text>
				)}
			</Index>
			<Show when={props.kraken}>
				<image
					href={KRAKEN[Math.floor(props.t * KRAKEN_FPS) % KRAKEN.length]}
					x={(X0 + X1) / 2 - 2}
					y={props.y + ROW_H - 34}
					width="32"
					height="32"
				/>
			</Show>

			<Index each={view().dots}>
				{(d) => (
					<circle
						cx={d().x}
						cy={d().y}
						r={DOT}
						fill={d().state === "waiting" ? "none" : d().color}
						stroke={d().state === "waiting" ? COLOR.amber : d().state === "retransmit" ? COLOR.amber : "none"}
						stroke-width="1.5"
						stroke-dasharray={d().state === "waiting" ? "2 1.5" : undefined}
					/>
				)}
			</Index>
		</g>
	);
}

// The transports MoQ runs on, and which of them keep QUIC's independent streams.
function Strip(props: { value: Transport; onChange: (t: Transport) => void }) {
	return (
		<div class="mt-2 w-full border-t border-line pt-4" role="radiogroup" aria-labelledby="huh-transport-label">
			<p id="huh-transport-label" class="label mb-2">
				Compare against
			</p>
			<div class="grid gap-2 sm:grid-cols-3">
				<For each={Object.entries(TRANSPORTS) as [Transport, (typeof TRANSPORTS)[Transport]][]}>
					{([key, info]) => (
						<label
							class={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-green-500 ${
								props.value === key ? "border-accent bg-accent-soft" : "border-line-strong hover:border-ink-3"
							}`}
						>
							<input
								type="radio"
								name="huh-transport"
								class="sr-only"
								checked={props.value === key}
								onChange={() => props.onChange(key)}
							/>
							<span class="flex items-center justify-between gap-2">
								<span class="font-medium text-ink">{info.name}</span>
								<span
									class={`whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${
										info.order === "stream" ? "bg-accent-soft text-accent-ink" : "bg-amber-500/15 text-amber-300"
									}`}
								>
									{info.badge}
								</span>
							</span>
							<span class="text-xs text-ink-3">{info.detail}</span>
						</label>
					)}
				</For>
			</div>
			<Show when={TRANSPORTS[props.value].order === "connection"}>
				<p class="mt-2 text-xs text-amber-300">
					Where UDP is blocked or WebTransport is missing, clients fall back to qmux over a WebSocket automatically. It
					runs on TCP, so a lost packet still holds back every stream.
				</p>
			</Show>
		</div>
	);
}
