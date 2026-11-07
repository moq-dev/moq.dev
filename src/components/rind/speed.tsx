// rind's speed over aws-lc-rs's for every primitive on every CPU tier, one dot each, grouped by how much
// of it is proven: the proven code is still faster.
import { For } from "solid-js";
import { commit, day, Figure, geomean, times } from "./chart";
import json from "./data/proofs.json";

type Status = "e2e" | "routine" | "none";
const data = json as unknown as {
	source: { rind: string; nightly: { run: string; commit: string; date: string } };
	tiers: string[];
	rows: { name: string; cells: { status: Status; speedup?: { geomean: number } }[] }[];
};

const ROWS: { status: Status; label: string }[] = [
	{ status: "e2e", label: "fully proven" },
	{ status: "routine", label: "proven core" },
	{ status: "none", label: "unproven" },
];

const W = 680;
const L = 120;
const R = 560;
const ROW = 104;
const TOP = 62;
const H = TOP + ROWS.length * ROW - 10;
const LO = 0.9;
const HI = 2.7;
// A log axis, so 2× faster and 2× slower sit the same distance from even.
const x = (v: number) => L + ((Math.log(v) - Math.log(LO)) / (Math.log(HI) - Math.log(LO))) * (R - L);
const TICKS = [1, 1.5, 2, 2.5];
const DOT = 4.5;

const cells = data.rows.flatMap((row) => row.cells.flatMap((c) => (c.speedup ? [{ ...c, row: row.name }] : [])));

// A simple beeswarm: each dot steps above and below its row until it overlaps none placed before it.
const swarm = (vals: number[], cy: number) => {
	const placed: { x: number; y: number }[] = [];
	const gap = DOT * 2 + 1.5;
	for (const v of [...vals].sort((a, b) => a - b)) {
		for (let n = 0; ; n++) {
			const p = { x: x(v), y: cy + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * gap };
			if (placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= gap)) {
				placed.push(p);
				break;
			}
		}
	}
	return placed;
};

export default function Speed() {
	const faster = cells.filter((c) => (c.speedup?.geomean ?? 0) >= 1).length;

	return (
		<Figure
			kicker="rind vs aws-lc-rs · every primitive on every CPU tier"
			headline={
				<>
					<span style={{ color: "var(--rind)" }}>
						{faster} of {cells.length}
					</span>{" "}
					benchmarks faster.
					<br />
					Proven ones too.
				</>
			}
			label="rind's speedup over aws-lc-rs for each primitive and CPU tier, grouped by how much of it is proven."
			table={{
				head: ["Primitive", ...data.tiers],
				rows: data.rows.map((row) => [
					row.name,
					...row.cells.map((c) => (c.speedup ? `${times(c.speedup.geomean)} (${c.status})` : "")),
				]),
			}}
			source={
				<>
					Each dot is one primitive on one CPU tier, the geomean of its benchmarks against aws-lc-rs. GitHub's runners
					in the nightly <a href={data.source.nightly.run}>bench run</a> of {day(data.source.nightly.date)} at{" "}
					{commit(data.source.nightly.commit)}, with CPU features denied per tier. Proofs at {commit(data.source.rind)}.
				</>
			}
		>
			<svg class="plot" viewBox={`0 0 ${W} ${H + 40}`} aria-hidden="true">
				<defs>
					<pattern id="rind-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="4" height="4" fill="var(--rind-deep)" />
						<rect width="2" height="4" fill="var(--rind)" />
					</pattern>
				</defs>
				<rect x={x(LO)} y={8} width={x(1) - x(LO)} height={H - 8} fill="rgb(148 163 184 / 6%)" />
				<For each={TICKS}>
					{(t) => (
						<>
							<line
								x1={x(t)}
								x2={x(t)}
								y1={8}
								y2={H}
								stroke={t === 1 ? "var(--ink-2)" : "var(--line)"}
								stroke-width={t === 1 ? 2 : 1}
								stroke-dasharray={t === 1 ? undefined : "3 4"}
							/>
							<text x={x(t)} y={H + 24} text-anchor="middle" fill="var(--ink-3)" font-size="12">
								{t === 1 ? "even" : `${t}×`}
							</text>
						</>
					)}
				</For>
				<text x={x(1) + 8} y={22} fill="var(--ink-3)" font-size="11">
					rind faster →
				</text>
				<For each={ROWS}>
					{(row, i) => {
						const cy = TOP + i() * ROW;
						const vals = cells.filter((c) => c.status === row.status).map((c) => c.speedup?.geomean ?? 1);
						const fill =
							row.status === "e2e" ? "var(--rind)" : row.status === "routine" ? "url(#rind-hatch)" : "var(--rival)";
						return (
							<>
								<text x={L - 14} y={cy + 4} text-anchor="end" fill="var(--ink-2)" font-size="11.5">
									{row.label}
								</text>
								<For each={swarm(vals, cy)}>
									{(p) => (
										<circle
											cx={p.x}
											cy={p.y}
											r={DOT}
											fill={fill}
											stroke={row.status === "none" ? "var(--ink-3)" : "var(--rind)"}
											stroke-width="1.2"
										/>
									)}
								</For>
								<text
									class="big"
									x={W - 4}
									y={cy + 16}
									text-anchor="end"
									fill={row.status === "none" ? "var(--ink-2)" : "var(--rind)"}
									font-weight="900"
									font-size="48"
								>
									{times(geomean(vals))}
								</text>
							</>
						);
					}}
				</For>
			</svg>
		</Figure>
	);
}
