// WebCrypto's asymmetric operations in Node, Deno, and Bun, against a prototype Bun that runs them on rind.
import { createSignal, For } from "solid-js";
import { Chart, createTip, day, Toggle } from "./chart";
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
// Stock runtimes first, then the one that differs from stock Bun only by rind.
const RUNS = ["Node", "Deno", "Bun", RIND].map((name) => {
	const run = data.runs.find((r) => r.runtime === name);
	if (!run) throw new Error(`runtimes.json has no ${name}`);
	return run;
});
const OPS = Object.keys(RUNS[0].us);

const W = 640;
const LABEL = 104;
const RIGHT = 70;
const ROW = 26;
const BAR = 14;

const us = (v: number) => (v < 1000 ? `${v.toPrecision(3)} µs` : `${(v / 1000).toPrecision(3)} ms`);

export default function Runtimes() {
	const [op, setOp] = createSignal(OPS.includes("P-384 sign") ? "P-384 sign" : OPS[0]);
	const { tip, on } = createTip();

	const max = () => Math.max(...RUNS.map((r) => r.us[op()]));
	const width = (v: number) => (v / max()) * (W - LABEL - RIGHT);
	const value = (run: Run) => run.us[op()];
	// Bun on rind's speed over stock Bun's, the same Bun commit without rind.
	const gain = (run: Run) => {
		const bun = RUNS.find((r) => r.runtime === "Bun");
		return run.runtime === RIND && bun ? value(bun) / value(run) : undefined;
	};
	const H = RUNS.length * ROW + 4;

	return (
		<Chart
			title="JavaScript runtimes"
			subtitle="WebCrypto, one call at a time; shorter is faster"
			controls={<Toggle label="Operation" options={OPS} value={op()} onChange={setOp} />}
			width={W}
			height={H}
			tip={tip}
			label={`Time per WebCrypto ${op()} in Node, Deno, Bun, and Bun on rind.`}
			table={{
				head: ["Operation", ...RUNS.map((r) => r.runtime)],
				rows: OPS.map((o) => [o, ...RUNS.map((r) => us(r.us[o]))]),
			}}
			source={
				<>
					{data.source.cpu}, one pinned core, the median of {data.source.rounds} alternating rounds,{" "}
					{day(data.source.date)}. {RUNS.map((r) => `${r.runtime}: ${r.version}`).join("; ")}. Bun and Bun on rind are
					release builds of Bun{" "}
					<a class="underline" href={`https://github.com/oven-sh/bun/commit/${data.source.bun.base}`}>
						{data.source.bun.base.slice(0, 9)}
					</a>
					, without and with{" "}
					<a class="underline" href={data.source.bun.prototype}>
						the rind prototype
					</a>
					, which moves Ed25519 and P-384 onto rind; X25519, P-256, and key import still run BoringSSL.{" "}
					{data.source.note}
				</>
			}
		>
			<For each={RUNS}>
				{(run, i) => {
					const y = i() * ROW + 4;
					const rind = run.runtime === RIND;
					return (
						<g
							{...on(() => ({
								x: LABEL + width(value(run)),
								y: y + 2,
								lines: [
									`${run.runtime}: ${us(value(run))}`,
									run.version,
									...(gain(run) ? [`${gain(run)?.toFixed(2)}× stock Bun's speed`] : []),
								],
							}))}
						>
							<rect x={0} y={y} width={W} height={ROW} fill="transparent" />
							<text x={LABEL - 10} y={y + BAR - 1} text-anchor="end" fill="var(--ink)" font-weight={rind ? 700 : 400}>
								{run.runtime}
							</text>
							<rect
								x={LABEL}
								y={y + 2}
								width={Math.max(2, width(value(run)))}
								height={BAR}
								rx="4"
								fill={rind ? "var(--rind)" : "var(--other)"}
							/>
							<text x={LABEL + width(value(run)) + 6} y={y + BAR - 1} fill="var(--ink-2)">
								{us(value(run))}
							</text>
							{gain(run) && (
								<text x={W - 4} y={y + BAR} text-anchor="end" fill="var(--rind)" font-weight="700" font-size="14">
									{gain(run)?.toFixed(1)}×
								</text>
							)}
						</g>
					);
				}}
			</For>
		</Chart>
	);
}
