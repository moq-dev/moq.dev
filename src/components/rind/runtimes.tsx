// Asymmetric crypto in Node, Deno, Bun, and a prototype Bun that runs it on rind: one bar per runtime,
// the geomean of its time over every operation they all run, then every operation as a heatmap.
import { createSignal, For, onMount, Show } from "solid-js";
import { Bands, band, cpu, day, Figure, geomean, midscreen, reduced } from "./chart";
import json from "./data/runtimes.json";

interface Run {
	runtime: string;
	version: string;
	us: Record<string, number>; // microseconds per call, by `<api>/<algorithm>/<operation>`
}
const data = json as {
	source: { cpu: string; date: string; rounds: number; bun: { base: string; prototype: string }; note: string };
	runs: Run[];
};

const RIND = "Bun on rind";
const run = (name: string) => {
	const r = data.runs.find((r) => r.runtime === name);
	if (!r) throw new Error(`runtimes.json has no ${name}`);
	return r;
};
// Every operation timed, in the order timed, and those every runtime runs, for the geomean.
const ALL = [...new Set(data.runs.flatMap((r) => Object.keys(r.us)))];
const OPS = ALL.filter((op) => data.runs.every((r) => op in r.us));
const mean = (r: Run) => geomean(OPS.map((op) => r.us[op]));
// Fastest first.
const RUNS = [...data.runs].sort((a, b) => mean(a) - mean(b));
const MAX = mean(RUNS[RUNS.length - 1]);
const label = (r: Run) => (r.runtime === RIND ? "Bun + rind" : r.runtime);
const us = (v: number) => (v < 1000 ? `${v.toPrecision(3)} µs` : `${(v / 1000).toPrecision(3)} ms`);
const SOURCE = (
	<>
		{cpu(data.source.cpu)}, one pinned core, the median of {data.source.rounds} alternating rounds,{" "}
		{day(data.source.date)}. {RUNS.map((r) => `${label(r)}: ${r.version}`).join("; ")}. Bun and Bun + rind are release
		builds of the same Bun commit, without and with <a href={data.source.bun.prototype}>the rind prototype</a>, which
		moves Ed25519, X25519, P-256, P-384, and P-521 onto rind. {data.source.note}
	</>
);
const TABLE = {
	head: ["Operation", ...RUNS.map(label)],
	rows: ALL.map((op) => [op.replaceAll("/", " "), ...RUNS.map((r) => (op in r.us ? us(r.us[op]) : "-"))]),
};

export default function Runtimes() {
	const rind = mean(run(RIND));
	// Bun + rind's bar starts at stock Bun's length and shrinks once seen.
	const [shrunk, setShrunk] = createSignal(false);
	let figure: HTMLElement | undefined;
	onMount(() => {
		if (reduced()) setShrunk(true);
		else if (figure) midscreen(figure, () => requestAnimationFrame(() => setShrunk(true)));
	});

	return (
		<Figure
			ref={(el) => {
				figure = el;
			}}
			kicker={`WebCrypto and node:crypto · geomean of ${OPS.length} calls`}
			number={`${(mean(run("Bun")) / rind).toFixed(1)}×`}
			headline={
				<>
					faster than
					<br />
					stock Bun
				</>
			}
			label={`Geomean time per call over ${OPS.length} asymmetric crypto operations in ${RUNS.map(label).join(", ")}.`}
			table={TABLE}
			source={SOURCE}
		>
			<div class="bars">
				<For each={RUNS}>
					{(r) => {
						const me = r.runtime === RIND;
						const width = () => (100 * (me && !shrunk() ? mean(run("Bun")) : mean(r))) / MAX;
						return (
							<div class={`bar${me ? " me" : ""}`}>
								<div class="name">{label(r)}</div>
								<div class="track">
									<div class="fill" style={{ width: `${width()}%` }} />
								</div>
								<div class="val">{me ? "fastest" : `${(mean(r) / rind).toFixed(1)}× slower`}</div>
							</div>
						);
					}}
				</For>
			</div>
			<p class="fine">
				Shorter is faster. Same Bun commit, with rind swapped in. Bun + rind times key generation without the public
				point, which it derives when first read.
			</p>
		</Figure>
	);
}

// Every operation timed, one row each under its API and algorithm, colored by its time over the fastest
// runtime's.
export function RuntimeHeat() {
	const sections = [...new Set(ALL.map((op) => op.split("/", 2).join(" · ")))].map((section) => ({
		section,
		ops: ALL.filter((op) => op.split("/", 2).join(" · ") === section),
	}));
	const fastest = (op: string) => Math.min(...RUNS.filter((r) => op in r.us).map((r) => r.us[op]));
	const wins = ALL.filter((op) => band(run(RIND).us[op] / fastest(op)) === 0).length;

	return (
		<Figure
			kicker="Every call · one row each"
			number={`${wins}/${ALL.length}`}
			headline={
				<>
					calls where Bun + rind is fastest,
					<br />
					or within 10%
				</>
			}
			label={`Time per call for ${ALL.length} asymmetric crypto operations in ${RUNS.map(label).join(", ")}, colored by time over the fastest runtime's.`}
			table={TABLE}
			source={SOURCE}
		>
			<div class="scroll">
				<div class="heat runtimes">
					<div />
					<For each={RUNS}>{(r) => <div class={`lib${r.runtime === RIND ? " me" : ""}`}>{label(r)}</div>}</For>
					<For each={sections}>
						{(s) => (
							<>
								<div class="section">{s.section}</div>
								<For each={s.ops}>
									{(op) => (
										<>
											<div class="row">{op.split("/")[2]}</div>
											<For each={RUNS}>
												{(r) => (
													<div class={`cell${r.runtime === RIND ? " me" : ""}`}>
														<Show when={op in r.us}>
															<span class={`tile s${band(r.us[op] / fastest(op))}`}>{us(r.us[op])}</span>
														</Show>
													</div>
												)}
											</For>
										</>
									)}
								</For>
							</>
						)}
					</For>
				</div>
			</div>
			<Bands />
			<p class="fine">
				Blank: the runtime refuses it. Bun + rind times key generation without the public point, which it derives when
				first read.
			</p>
		</Figure>
	);
}
