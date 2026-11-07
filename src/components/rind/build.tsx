// What rustls costs to build from scratch on each crypto library: a race on the oldest CPU, in seconds.
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { commit, cpu, day, Figure, frames, midscreen, name, reduced } from "./chart";
import data from "./data/build.json";

// The race runs on the 9-year-old PC, where build time hurts most.
const HOST = "Coffee Lake";
const RACERS = ["rustls-rind", "rustls-ring", "rustls-aws-lc-rs"];
// Race seconds per real second.
const SPEED = 12;

const TOOLS: Record<string, string> = { cc: "C compiler", make: "make", perl: "perl", "pkg-config": "pkg-config" };
const needs = (tools: string[]) =>
	tools.length ? `needs ${tools.map((t) => TOOLS[t] ?? t).join(", ")}` : "rustc only";
const label = (build: string) =>
	build.startsWith("rustls-") ? `rustls + ${name(build.slice("rustls-".length))}` : name(build);

const host = (n: string) => {
	const h = data.hosts.find((h) => h.name === n);
	if (!h) throw new Error(`build.json has no ${n}`);
	return h;
};
const seconds = (h: ReturnType<typeof host>, build: string) => {
	const b = h.builds.find((b) => b.name === build);
	if (!b) throw new Error(`build.json's ${h.name} has no ${build}`);
	return b;
};

export default function Build() {
	const h = host(HOST);
	const racers = RACERS.map((r) => seconds(h, r));
	const max = Math.max(...racers.map((r) => r.seconds));
	const ratio = (x: ReturnType<typeof host>) =>
		seconds(x, "rustls-aws-lc-rs").seconds / seconds(x, "rustls-rind").seconds;
	const others = data.hosts.filter((x) => x.name !== HOST);

	// The race clock rests at the finish, so the figure reads complete before it plays.
	const [clock, setClock] = createSignal(max);
	let figure: HTMLElement | undefined;
	let cancel = () => {};
	const race = () => {
		cancel();
		setClock(0);
		cancel = frames((s) => {
			setClock(Math.min(max, s * SPEED));
			return s * SPEED < max;
		});
	};
	onMount(() => {
		if (figure && !reduced()) midscreen(figure, race);
	});
	onCleanup(() => cancel());

	return (
		<Figure
			ref={(el) => {
				figure = el;
			}}
			kicker="rustls, cold release build · the 9-year-old gaming PC"
			number={`${ratio(h).toFixed(1)}×`}
			headline={
				<>
					faster to
					<br />
					build
				</>
			}
			label={`Seconds to build rustls on rind, ring, and aws-lc-rs on ${HOST}, as a race.`}
			table={{
				head: ["CPU", "Build", "Time", "CPU time", "Binary", "Tools"],
				rows: data.hosts.flatMap((x) =>
					x.builds.map((b) => [
						x.name,
						label(b.name),
						`${b.seconds.toFixed(1)} s`,
						`${b.cpu_seconds.toFixed(1)} s`,
						`${(b.bytes / 1024 / 1024).toFixed(2)} MiB`,
						needs(b.tools),
					]),
				),
			}}
			source={
				<>
					rind's admin/build-cost: the median of {h.source.runs} cold builds with an empty target directory and a warm
					download cache.{" "}
					{data.hosts
						.map((x) => `${x.name}: ${cpu(x.source.cpu)}, ${x.source.jobs} jobs, ${day(x.source.date)}`)
						.join("; ")}
					. At {commit(h.source.rind)}. A tool counts when the build fails without it.
				</>
			}
		>
			<div class="race-head">
				<div />
				<div class="clock">
					<strong>{clock().toFixed(1)} s</strong>race clock, {SPEED}× speed
				</div>
			</div>
			<div class="bars race">
				<For each={racers}>
					{(r) => {
						const done = () => clock() >= r.seconds;
						return (
							<div class={`bar${r.name.endsWith("rind") ? " me" : ""}${done() ? " done" : ""}`}>
								<div class="name">
									{label(r.name)}
									<br />
									<span class={`chip${r.tools.length ? "" : " ok"}`}>{needs(r.tools)}</span>
								</div>
								<div class="track">
									<div class="go" style={{ width: `${(100 * Math.min(clock(), r.seconds)) / max}%` }} />
									<div class="time">{done() ? `${r.seconds.toFixed(1)} s ✓` : "compiling…"}</div>
								</div>
							</div>
						);
					}}
				</For>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="fine" style={{ margin: 0 }}>
					{others.map((x) => `${x.name}: ${ratio(x).toFixed(1)}×`).join(", ")}.
				</p>
				<button type="button" class="replay" onClick={race}>
					↻ Race again
				</button>
			</div>
		</Figure>
	);
}
