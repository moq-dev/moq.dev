// rind's speed over aws-lc-rs's per primitive and CPU tier, colored by proof status: proofs didn't cost speed.
import { createSignal, For, Show } from "solid-js";
import { Chart, commit, createTip, day, Toggle, times } from "./chart";
import { data, STATUS, type Status } from "./coverage";

const W = 640;
const LABEL = 196;
const RIGHT = 52;
const HEAD = 22;
const ROW = 24;
const H = HEAD + data.rows.length * ROW + 18;

// A log axis, so 2× faster and 2× slower sit the same distance from even.
const LO = 0.5;
const HI = 4;
const x = (v: number) => LABEL + ((Math.log(v) - Math.log(LO)) / (Math.log(HI) - Math.log(LO))) * (W - LABEL - RIGHT);
const TICKS = [0.5, 1, 2, 4];

const geomean = (xs: number[]) => Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length);

// Every timed cell's speedup, by proof status, across every tier.
const SUMMARY = (Object.keys(STATUS) as Status[]).map((status) => {
	const speedups = data.rows
		.flatMap((r) => r.cells)
		.flatMap((c) => (c.status === status && c.speedup ? [c.speedup.geomean] : []));
	return { status, speedup: geomean(speedups), n: speedups.length };
});

export default function Speed() {
	const [tier, setTier] = createSignal(data.tiers[0]);
	const { tip, on } = createTip();
	const column = () => data.tiers.indexOf(tier());

	return (
		<Chart
			title="Proofs didn't cost speed"
			subtitle="rind's speed over aws-lc-rs's; right of 1× is faster"
			controls={<Toggle label="CPU tier" options={data.tiers} value={tier()} onChange={setTier} />}
			legend={(Object.keys(STATUS) as Status[]).map((s) => ({ color: STATUS[s].color, label: STATUS[s].label }))}
			width={W}
			height={H}
			tip={tip}
			label={`rind's speedup over aws-lc-rs for each primitive on the ${tier()} tier, colored by how much of it is proven.`}
			table={{
				head: ["Primitive", "Proof", "Speedup (geomean)", "Range", "Benchmarks"],
				rows: data.rows.map((row) => {
					const c = row.cells[column()];
					return [
						row.name,
						STATUS[c.status].label,
						c.speedup ? times(c.speedup.geomean) : "not timed",
						c.speedup ? `${times(c.speedup.min)} to ${times(c.speedup.max)}` : "",
						c.speedup?.n ?? "",
					];
				}),
			}}
			source={
				<>
					Every tier: {SUMMARY.map((s) => `${STATUS[s.status].label} ${times(s.speedup)} (${s.n})`).join(", ")}. Each
					dot is the geomean of the primitive's benchmarks, the whisker their range. GitHub's runners in the nightly{" "}
					<a class="underline" href={data.source.nightly.run}>
						bench run
					</a>{" "}
					of {day(data.source.nightly.date)} at {commit(data.source.nightly.commit)}, on {data.source.cpus[tier()]} with
					features denied. Proofs at {commit(data.source.rind)}.
				</>
			}
		>
			<For each={TICKS}>
				{(t) => (
					<>
						<line
							x1={x(t)}
							x2={x(t)}
							y1={HEAD - 6}
							y2={H - 18}
							stroke={t === 1 ? "var(--ink-3)" : "var(--grid)"}
							stroke-dasharray={t === 1 ? undefined : "2 3"}
						/>
						<text x={x(t)} y={H - 4} text-anchor="middle" fill="var(--ink-3)">
							{t === 1 ? "even" : `${t}×`}
						</text>
					</>
				)}
			</For>
			<text x={x(1) - 6} y={12} text-anchor="end" fill="var(--ink-3)" font-size="10.5">
				← aws-lc-rs faster
			</text>
			<text x={x(1) + 6} y={12} fill="var(--ink-3)" font-size="10.5">
				rind faster →
			</text>
			<For each={data.rows}>
				{(row, r) => {
					const y = HEAD + r() * ROW + ROW / 2;
					const cell = () => row.cells[column()];
					return (
						<>
							<text x={LABEL - 8} y={y + 4} text-anchor="end" fill="var(--ink)">
								{row.name}
							</text>
							<Show
								when={cell().speedup}
								fallback={
									<text x={x(1) + 6} y={y + 4} fill="var(--ink-3)" font-size="10.5">
										same code as the tier to the left, not timed
									</text>
								}
							>
								{(s) => (
									<g
										{...on(() => ({
											x: x(s().geomean),
											y: y - 6,
											lines: [
												`${row.name}, ${tier()}: ${times(s().geomean)} aws-lc-rs's speed`,
												`${s().n} benchmarks, ${times(s().min)} to ${times(s().max)}`,
												STATUS[cell().status].label,
											],
										}))}
									>
										<rect x={LABEL} y={y - ROW / 2} width={W - LABEL} height={ROW} fill="transparent" />
										<line
											x1={x(s().min)}
											x2={x(s().max)}
											y1={y}
											y2={y}
											stroke="var(--ink-3)"
											stroke-width="2"
											stroke-linecap="round"
										/>
										<circle
											cx={x(s().geomean)}
											cy={y}
											r="6"
											fill={STATUS[cell().status].color}
											stroke="var(--surface)"
											stroke-width="2"
										/>
										<text x={W - RIGHT + 8} y={y + 4} fill="var(--ink-2)">
											{times(s().geomean)}
										</text>
									</g>
								)}
							</Show>
						</>
					);
				}}
			</For>
		</Chart>
	);
}
