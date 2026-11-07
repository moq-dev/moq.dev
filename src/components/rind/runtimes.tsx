// WebCrypto in Node, Deno, Bun, and a prototype Bun that runs its asymmetric operations on rind: one bar
// per runtime, the geomean of its time over every operation timed.
import { createSignal, For, onMount } from "solid-js";
import { cpu, day, Figure, geomean, midscreen, reduced } from "./chart";
import json from "./data/runtimes.json";

interface Run {
	runtime: string;
	version: string;
	us: Record<string, number>; // microseconds per call, by operation
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
const OPS = Object.keys(run(RIND).us);
const mean = (r: Run) => geomean(OPS.map((op) => r.us[op]));
// Fastest first.
const RUNS = [...data.runs].sort((a, b) => mean(a) - mean(b));
const MAX = mean(RUNS[RUNS.length - 1]);
const label = (r: Run) => (r.runtime === RIND ? "Bun + rind" : r.runtime);
const us = (v: number) => (v < 1000 ? `${v.toPrecision(3)} µs` : `${(v / 1000).toPrecision(3)} ms`);

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
			kicker={`WebCrypto · geomean of ${OPS.length} signing and key-exchange calls`}
			number={`${(mean(run("Bun")) / rind).toFixed(1)}×`}
			headline={
				<>
					faster than
					<br />
					stock Bun
				</>
			}
			label={`Geomean time per WebCrypto call over ${OPS.length} operations in ${RUNS.map(label).join(", ")}.`}
			table={{
				head: ["Operation", ...RUNS.map(label)],
				rows: OPS.map((op) => [op, ...RUNS.map((r) => us(r.us[op]))]),
			}}
			source={
				<>
					{cpu(data.source.cpu)}, one pinned core, the median of {data.source.rounds} alternating rounds,{" "}
					{day(data.source.date)}. {RUNS.map((r) => `${label(r)}: ${r.version}`).join("; ")}. Bun and Bun + rind are
					release builds of the same Bun commit, without and with{" "}
					<a href={data.source.bun.prototype}>the rind prototype</a>, which moves Ed25519, X25519, and P-384 onto rind;
					P-256 still runs BoringSSL in both. {data.source.note}
				</>
			}
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
			<p class="fine">Shorter is faster. Same Bun commit, with rind swapped in.</p>
		</Figure>
	);
}
