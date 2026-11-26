// Section 4: one broadcast's tracks, pulled one by one. An unpulled track's encoder sleeps, and with E2EE on the relay
// routes names and payloads it cannot read.
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { animate } from "./clock";
import { BROADCAST, catalog, type Kind, opaque, PRESETS, PUSH_ALL, REAR, TRACKS, uplink } from "./rack";
import { Button, COLOR, Figure } from "./ui";

const KIND: Record<Kind, string> = {
	video: COLOR.green,
	camera: COLOR.violet,
	audio: COLOR.sky,
	text: "#f472b6",
	data: "#2dd4bf",
};

const SPEED = 40; // px per second the packets drift along a wire
const START = ["video/1080p", "audio", "captions"]; // the TV preset, so a few encoders sleep on first paint

const rate = (kbps: number) => (kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`);

// The broadcast each track lives in, as the relay sees it.
const broadcast = (name: string) => (name === "rear" ? BROADCAST.replace(/[^/]+$/, REAR) : BROADCAST);

export default function TracksDiagram() {
	const [pulled, setPulled] = createSignal<ReadonlySet<string>>(new Set(START));
	const [e2ee, setE2ee] = createSignal(false);
	const [t, setT] = createSignal(0);
	const [news, setNews] = createSignal("");
	const lines = catalog();

	let root!: HTMLDivElement;
	onMount(() => {
		const clock = animate(root, (dt) => setT((t) => t + dt));
		onCleanup(() => clock.stop());
	});

	const toggle = (name: string) => {
		const next = new Set(pulled());
		const on = !next.has(name);
		if (on) next.add(name);
		else next.delete(name);
		setPulled(next);
		setNews(
			on
				? `Subscribed to ${name}: its encoder wakes and the relay starts forwarding it.`
				: `Unsubscribed from ${name}: nobody else wants it, so its encoder goes idle at 0 kbps.`,
		);
	};
	const preset = (p: (typeof PRESETS)[number]) => {
		setPulled(new Set(p.pulls));
		setNews(
			p.pulls.length
				? `${p.name}: only ${p.pulls.join(", ")} ${p.pulls.length === 1 ? "is" : "are"} encoded and sent.`
				: "Nobody is watching: every encoder sleeps and the uplink is idle.",
		);
	};
	const same = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every((n) => a.has(n));

	const seen = (name: string) => (e2ee() ? opaque(name) : name);

	const label =
		"A publisher offers six tracks: two video renditions, a second camera, audio, captions, and an app data track, all listed in its catalog. Only the tracks a viewer subscribes to are encoded and sent; the rest sit idle at zero bandwidth. With end-to-end encryption on, the relay forwards track names and payloads it cannot read.";

	return (
		<Figure
			label={label}
			controls={
				<>
					<span class="label">viewer</span>
					<For each={PRESETS}>
						{(p) => (
							<Button onClick={() => preset(p)} pressed={same(pulled(), p.pulls)}>
								{p.name}
							</Button>
						)}
					</For>
					<span class="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
						<Button onClick={() => setE2ee(!e2ee())} pressed={e2ee()}>
							E2EE
						</Button>
						<span class="text-xs text-ink-3">
							<code class="font-mono">moq-e2ee</code> project draft, not part of hang or{" "}
							<code class="font-mono">moq-transport</code>
						</span>
					</span>
					<p class="min-h-5 w-full text-xs text-ink-3" aria-live="polite">
						{news()}
					</p>
					<div class="mt-2 w-full">
						<p class="label mb-1">
							catalog.json
							<span class="normal-case tracking-normal">
								{e2ee()
									? ` · decrypted by the viewer; the relay carries ${opaque("catalog.json")}`
									: " · always pulled first"}
							</span>
						</p>
						<pre
							class="overflow-x-auto rounded-lg p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap"
							style={{ background: COLOR.track }}
						>
							<For each={lines}>
								{(line) => (
									<span
										class="block pl-[2ch] -indent-[2ch]"
										style={{
											color:
												line.track === undefined ? COLOR.neutral : pulled().has(line.track) ? COLOR.text : COLOR.dim,
										}}
									>
										{line.text}
									</span>
								)}
							</For>
						</pre>
					</div>
				</>
			}
		>
			<div ref={root}>
				<div class="mb-1 flex flex-wrap items-center gap-x-3 font-mono text-[0.68rem] uppercase tracking-wider text-ink-3">
					<span class="w-[14.5rem] shrink-0">publisher · encoder</span>
					<span class="flex flex-1 items-center gap-2 sm:justify-center">
						<span>relay sees</span>
						<span class="normal-case" style={{ color: e2ee() ? COLOR.violet : COLOR.neutral }}>
							{e2ee() ? opaque(BROADCAST) : BROADCAST}
						</span>
					</span>
					<span class="hidden sm:inline">viewer</span>
				</div>

				<ul class="flex flex-col gap-1.5" aria-label="Tracks in the broadcast">
					<For each={TRACKS}>
						{(track) => {
							const on = () => pulled().has(track.name);
							const color = KIND[track.kind];
							const gap = Math.round(34 - 6 * Math.log10(track.kbps));
							const wire = () => ({
								"background-image": on()
									? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px ${4 + gap}px)`
									: "none",
								"background-position-x": `${t() * SPEED}px`,
								"background-color": COLOR.track,
							});
							return (
								<li
									class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm transition-opacity"
									classList={{ "opacity-60": !on() }}
								>
									<span class="flex w-[14.5rem] shrink-0 items-center gap-2">
										<Button
											onClick={() => toggle(track.name)}
											pressed={on()}
											label={`Subscribe to ${track.name}`}
											class="w-[7.5rem] justify-start px-2! font-mono text-xs!"
										>
											<span class="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />
											{track.name}
										</Button>
										<span class="whitespace-nowrap font-mono text-xs" style={{ color: on() ? color : COLOR.dim }}>
											{on() ? rate(track.kbps) : "idle · 0 kbps"}
										</span>
									</span>
									<span class="flex min-w-[15rem] flex-1 items-center gap-2">
										<span class="h-1 flex-1 rounded-full" style={wire()} />
										<span
											class="w-[6.5rem] truncate text-center font-mono text-xs"
											style={{ color: e2ee() ? COLOR.violet : COLOR.neutral }}
											title={on() ? `${broadcast(track.name)} / ${track.name}` : undefined}
										>
											<Show when={on()} fallback={<span style={{ color: COLOR.dim }}>·</span>}>
												{seen(track.name)}
											</Show>
										</span>
										<span class="h-1 flex-1 rounded-full" style={wire()} />
									</span>
									<span class="w-full pl-0.5 text-xs text-ink-3 sm:hidden">{track.detail}</span>
								</li>
							);
						}}
					</For>
				</ul>

				<div class="mt-5 grid items-start gap-x-6 gap-y-3 md:grid-cols-2">
					<Meter kbps={uplink(pulled())} />
					<p class="text-xs leading-relaxed text-ink-3">
						<Show
							when={e2ee()}
							fallback={
								<>
									The relay routes by broadcast and track name and never parses a payload. The second camera is its own
									broadcast, <code class="font-mono">{broadcast("rear")}</code>, listed under{" "}
									<code class="font-mono">contributions</code>.
								</>
							}
						>
							With E2EE, paths, track names, and every group are ciphertext. The relay still routes each subscription by
							its opaque name; only the viewer holds the key.
						</Show>
					</p>
				</div>
			</div>
		</Figure>
	);
}

// The publisher's uplink against what pushing every track would cost.
function Meter(props: { kbps: number }) {
	return (
		<div>
			<div class="mb-1 flex items-baseline justify-between gap-2">
				<span class="label">uplink</span>
				<span class="font-mono text-sm" style={{ color: props.kbps > 0 ? COLOR.green : COLOR.dim }}>
					{rate(props.kbps)}
				</span>
			</div>
			<div
				class="h-2.5 overflow-hidden rounded-full"
				style={{ background: COLOR.track }}
				// The rate above already reads it out.
				aria-hidden="true"
			>
				<div
					class="h-full rounded-full transition-[width] duration-300"
					style={{ width: `${(props.kbps / PUSH_ALL) * 100}%`, background: COLOR.green }}
				/>
			</div>
			<p class="mt-1 font-mono text-xs text-ink-3">pushing every track: {rate(PUSH_ALL)}</p>
		</div>
	);
}
