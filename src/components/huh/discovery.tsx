// Section 5: publishers announce paths to their relay, the relay mesh gossips them, and every session watching a
// matching prefix updates its roster the moment the message lands.
import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import { advance, animate } from "./clock";
import { type Client, Mesh, type Node, SETTLE, watchers } from "./gossip";
import { Button, COLOR, Figure, MONO, Swatch } from "./ui";

const RELAYS = [
	{ name: "sfo", x: 230, y: 125, above: false },
	{ name: "fra", x: 370, y: 58, above: true },
	{ name: "sin", x: 370, y: 192, above: false },
];
const CLIENTS: (Client & { x: number; y: number })[] = [
	{ name: "alice", relay: 0, publishes: "room/alice", watches: "room/", x: 70, y: 80 },
	{ name: "harbor", relay: 0, watches: "boat/", x: 70, y: 170 },
	{ name: "bob", relay: 1, publishes: "room/bob", watches: "room/", x: 530, y: 30 },
	{ name: "cam-1", relay: 1, publishes: "boat/cam-1", x: 530, y: 100 },
	{ name: "carol", relay: 2, publishes: "room/carol", watches: "room/", x: 530, y: 192 },
];
const ONLINE = ["alice", "bob", "cam-1"]; // carol starts offline, so there's someone to bring online

const W = 600;
const H = 236;
const RELAY_R = 24;
const BOX = { w: 76, h: 26 };
const FRESH = 1.2; // seconds a new roster entry stays highlighted

const pos = (n: Node) => ("relay" in n ? RELAYS[n.relay] : CLIENTS[n.client]);
const pattern = (prefix: string) => `${prefix}*`;

export default function DiscoveryDiagram() {
	const mesh = new Mesh(RELAYS.length, CLIENTS);
	const [frame, redraw] = createSignal(undefined, { equals: false });
	const [news, setNews] = createSignal("");
	const tick = (dt: number) => {
		mesh.step(dt);
		redraw();
	};
	CLIENTS.forEach((c, i) => {
		if (ONLINE.includes(c.name)) mesh.set(i, true);
	});
	advance(SETTLE + FRESH, tick);

	// Covers the rosters too, so they keep updating while only they are on screen.
	let root!: HTMLDivElement;
	let clock: ReturnType<typeof animate> | undefined;
	onMount(() => {
		clock = animate(root, tick);
		onCleanup(() => clock?.stop());
	});

	const toggle = (i: number) => {
		const c = CLIENTS[i];
		const path = c.publishes as string;
		const online = !mesh.online[i];
		mesh.set(i, online);
		const who = watchers(CLIENTS, path, i).map((w) => CLIENTS[w].name);
		const heard = who.length ? `${who.join(" and ")} hear it as it crosses the mesh` : "nobody watches that prefix";
		setNews(`${c.name} ${online ? "announced" : "withdrew"} ${path}: ${heard}. Nothing polls.`);
		// With motion paused, jump straight to the settled rosters.
		if (clock?.live()) redraw();
		else advance(SETTLE + FRESH, tick);
	};

	const view = createMemo(() => {
		frame();
		return {
			t: mesh.t,
			online: [...mesh.online],
			known: mesh.known.map((k) => k.size),
			rosters: mesh.roster.map((r) => [...r].sort(([a], [b]) => a.localeCompare(b))),
			messages: mesh.inflight.map((m) => {
				const a = pos(m.from);
				const b = pos(m.to);
				const k = Math.max(0, Math.min(1, (mesh.t - m.sent) / (m.arrives - m.sent)));
				return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, kind: m.kind, path: m.path };
			}),
		};
	});

	const label =
		"Five sessions connect to three meshed relays. Alice, Bob, and Carol each publish a path under room and watch the room prefix; a boat camera publishes under boat, and a harbor screen watches the boat prefix. Bringing a publisher online or offline sends an announcement or withdrawal through the relays to every matching watcher, whose roster updates without polling.";

	return (
		<Figure
			label={label}
			controls={
				<>
					<Swatch color={COLOR.green}>announce</Swatch>
					<Swatch color={COLOR.red}>withdraw</Swatch>
					<span class="text-xs text-ink-3">Click a publisher to take it online or offline.</span>
					<p class="min-h-5 w-full text-xs text-ink-3" aria-live="polite">
						{news()}
					</p>
				</>
			}
		>
			<div ref={root}>
				<svg viewBox={`0 0 ${W} ${H}`} class="block w-full" aria-hidden="true">
					{/* The mesh: every relay peers with every other. */}
					<For each={RELAYS}>
						{(a, i) => (
							<For each={RELAYS.slice(i() + 1)}>
								{(b) => (
									<line
										x1={a.x}
										y1={a.y}
										x2={b.x}
										y2={b.y}
										stroke={COLOR.line}
										stroke-width="2"
										stroke-dasharray="5 4"
									/>
								)}
							</For>
						)}
					</For>
					<For each={CLIENTS}>
						{(c) => (
							<line
								x1={c.x}
								y1={c.y}
								x2={RELAYS[c.relay].x}
								y2={RELAYS[c.relay].y}
								stroke={COLOR.line}
								stroke-width="1.5"
							/>
						)}
					</For>

					<For each={RELAYS}>
						{(r, i) => (
							<g>
								<circle cx={r.x} cy={r.y} r={RELAY_R} fill={COLOR.track} stroke={COLOR.neutral} stroke-width="1.5" />
								<text x={r.x} y={r.y - 2} text-anchor="middle" fill={COLOR.text} font-size="12" font-weight="600">
									{r.name}
								</text>
								<text x={r.x} y={r.y + 11} text-anchor="middle" fill={COLOR.dim} font-size="9" font-family={MONO}>
									relay
								</text>
								<text
									x={r.x}
									y={r.above ? r.y - RELAY_R - 6 : r.y + RELAY_R + 13}
									text-anchor="middle"
									fill={COLOR.neutral}
									font-size="10"
									font-family={MONO}
								>
									{view().known[i()]} live
								</text>
							</g>
						)}
					</For>

					<For each={CLIENTS}>
						{(c, i) => {
							const on = () => c.publishes !== undefined && view().online[i()];
							return (
								<g>
									<rect
										x={c.x - BOX.w / 2}
										y={c.y - BOX.h / 2}
										width={BOX.w}
										height={BOX.h}
										rx="7"
										fill={COLOR.track}
										stroke={on() ? COLOR.green : COLOR.line}
										stroke-width="1.5"
									/>
									<circle
										cx={c.x - BOX.w / 2 + 11}
										cy={c.y}
										r="3.5"
										fill={c.publishes === undefined ? COLOR.neutral : on() ? COLOR.green : COLOR.dim}
									/>
									<text x={c.x + 6} y={c.y + 4} text-anchor="middle" fill={COLOR.text} font-size="12">
										{c.name}
									</text>
								</g>
							);
						}}
					</For>

					{/* Fresh objects every frame, so reuse the elements by position rather than rebuilding them. */}
					<Index each={view().messages}>
						{(m) => {
							const color = () => (m().kind === "announce" ? COLOR.green : COLOR.red);
							return (
								<g>
									<circle cx={m().x} cy={m().y} r="4.5" fill={color()} />
									<text x={m().x + 7} y={m().y - 6} fill={color()} font-size="10" font-family={MONO}>
										{m().kind === "announce" ? "+" : "−"}
										{m().path}
									</text>
								</g>
							);
						}}
					</Index>
				</svg>

				<ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Sessions">
					<For each={CLIENTS}>
						{(c, i) => {
							const on = () => view().online[i()];
							return (
								<li class="flex flex-col gap-1.5 rounded-lg bg-surface-2/60 px-2.5 py-2 text-sm">
									<span class="flex items-baseline justify-between gap-2">
										<span class="font-medium text-ink">{c.name}</span>
										<span class="font-mono text-xs text-ink-3">via {RELAYS[c.relay].name}</span>
									</span>
									<Show when={c.publishes}>
										{(path) => (
											<span class="flex items-center gap-2">
												<span class="label w-16">publishes</span>
												<Button
													onClick={() => toggle(i())}
													pressed={on()}
													label={`${c.name} publishes ${path()}`}
													class="px-2! font-mono text-xs!"
												>
													{path()} · {on() ? "online" : "offline"}
												</Button>
											</span>
										)}
									</Show>
									<Show when={c.watches}>
										{(prefix) => (
											<span class="flex items-start gap-2">
												<span class="label w-16 pt-0.5">watches</span>
												<span class="flex flex-col font-mono text-xs">
													<span class="text-ink-3">{pattern(prefix())}</span>
													<Show when={on() && c.publishes?.startsWith(prefix())}>
														<span class="text-ink-3">{c.publishes} (you)</span>
													</Show>
													<Index
														each={view().rosters[i()]}
														fallback={
															<Show when={!(on() && c.publishes?.startsWith(prefix()))}>
																<span class="text-ink-3">nobody yet</span>
															</Show>
														}
													>
														{(entry) => (
															<span style={{ color: view().t - entry()[1] < FRESH ? COLOR.green : COLOR.text }}>
																{entry()[0]}
															</span>
														)}
													</Index>
												</span>
											</span>
										)}
									</Show>
								</li>
							);
						}}
					</For>
				</ul>
			</div>
		</Figure>
	);
}
