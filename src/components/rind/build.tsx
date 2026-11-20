// What rustls costs to build from scratch on each crypto library: a race, in seconds averaged over every CPU.
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { commit, cpu, day, Figure, frames, geomean, midscreen, name, reduced } from "./chart";
import data from "./data/build.json";

const RACERS = ["rustls-rind", "rustls-ring", "rustls-aws-lc-rs"];
// Race seconds per real second.
const SPEED = 12;

const TOOLS: Record<string, string> = { cc: "C compiler", make: "make", perl: "perl", "pkg-config": "pkg-config" };
const needs = (tools: string[]) =>
	tools.length ? `needs ${tools.map((t) => TOOLS[t] ?? t).join(", ")}` : "rustc only";
const label = (build: string) =>
	build.startsWith("rustls-") ? `rustls + ${name(build.slice("rustls-".length))}` : name(build);

type Host = (typeof data.hosts)[number];
const seconds = (h: Host, build: string) => {
	const b = h.builds.find((b) => b.name === build);
	if (!b) throw new Error(`build.json's ${h.name} has no ${build}`);
	return b;
};

export default function Build() {
	// Each racer's build, its time the geometric mean over every CPU.
	const racers = RACERS.map((r) => {
		const builds = data.hosts.map((h) => seconds(h, r));
		const tools = builds[0].tools;
		if (builds.some((b) => b.tools.join() !== tools.join())) throw new Error(`${r} needs different tools per CPU`);
		return { name: r, seconds: geomean(builds.map((b) => b.seconds)), tools };
	});
	const max = Math.max(...racers.map((r) => r.seconds));
	const time = (r: string) => {
		const racer = racers.find((x) => x.name === r);
		if (!racer) throw new Error(`${r} isn't racing`);
		return racer.seconds;
	};
	const ratio = (x: Host) => seconds(x, "rustls-aws-lc-rs").seconds / seconds(x, "rustls-rind").seconds;

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
			kicker={`rustls, cold release build · averaged over ${data.hosts.length} CPUs`}
			number={`${(time("rustls-aws-lc-rs") / time("rustls-rind")).toFixed(1)}×`}
			headline={
				<>
					faster to
					<br />
					build
				</>
			}
			label={`Seconds to build rustls on rind, ring, and aws-lc-rs, averaged over ${data.hosts.length} CPUs, as a race.`}
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
					rind's admin/build-cost: the median of cold builds with an empty target directory and a warm download cache.{" "}
					{data.hosts.map((x, i) => (
						<>
							{i ? "; " : ""}
							{x.name}: {cpu(x.source.cpu)}, {x.source.jobs} jobs, {x.source.runs} runs, {day(x.source.date)}, at{" "}
							{commit(x.source.rind)}
						</>
					))}
					. A tool counts when the build fails without it.
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
					The geometric mean over CPUs. {data.hosts.map((x) => `${x.name}: ${ratio(x).toFixed(1)}×`).join(", ")}.
				</p>
				<button type="button" class="replay" onClick={race}>
					↻ Race again
				</button>
			</div>
		</Figure>
	);
}
