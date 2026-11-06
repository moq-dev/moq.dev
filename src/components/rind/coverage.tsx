// Which of rind's primitives are proven, per CPU tier: end to end in Lean, only the routine underneath, or not at all.
import { For } from "solid-js";
import { Chart, commit, createTip, day } from "./chart";
import json from "./data/proofs.json";

export const STATUS = {
	e2e: { label: "proven end to end", color: "var(--e2e)" },
	routine: { label: "proven routine, unproven glue", color: "var(--routine)" },
	none: { label: "unproven", color: "var(--none)" },
} as const;
export type Status = keyof typeof STATUS;

export interface Cell {
	status: Status;
	code: string; // README's Algorithms cell: whose code runs there
	proof?: string;
	note?: string;
	link?: string;
	speedup?: { geomean: number; min: number; max: number; n: number }; // aws-lc-rs's time over rind's
}

export const data = json as {
	source: {
		rind: string;
		nightly: { run: string; commit: string; date: string };
		cpus: Record<string, string>;
		generated: string;
	};
	tiers: string[];
	rows: { name: string; cells: Cell[] }[];
};

// Each tier's column group: the architecture it denies features on.
const GROUPS = [
	{ name: "x86_64", from: 0, to: 5 },
	{ name: "aarch64", from: 5, to: 7 },
	{ name: "armv7", from: 7, to: 8 },
];

// The first column of each group runs every feature, so it's named by what that means.
const FIRST: Record<number, string> = { 0: "all", 5: "all", 7: "NEON" };

const W = 640;
const LABEL = 196;
const HEAD = 44;
const ROW = 24;
const GAP = 2;
const COL = (W - LABEL) / data.tiers.length;
const H = HEAD + data.rows.length * ROW;

export default function Coverage() {
	const { tip, on } = createTip();

	return (
		<Chart
			title="Proof coverage"
			subtitle="per primitive and CPU tier; each tier to the right denies more CPU features"
			legend={[
				{ color: STATUS.e2e.color, label: `✓ ${STATUS.e2e.label} (Lean)` },
				{ color: STATUS.routine.color, label: STATUS.routine.label, pattern: true },
				{ color: STATUS.none.color, label: STATUS.none.label },
			]}
			width={W}
			height={H}
			tip={tip}
			label="A grid of rind's primitives by CPU tier, marking which are proven end to end in Lean, which run a proven routine under unproven glue, and which are unproven."
			table={{
				head: ["Primitive", ...data.tiers],
				rows: data.rows.map((row) => [
					row.name,
					...row.cells.map((c) => (c.link ? { text: STATUS[c.status].label, href: c.link } : STATUS[c.status].label)),
				]),
			}}
			source={
				<>
					✓* on Intel CPUs only. rind {commit(data.source.rind)}: README's Algorithms tables and
					benchmarks/verified.toml. Generated {day(data.source.generated)}.
				</>
			}
		>
			<For each={GROUPS}>
				{(g) => (
					<>
						<text
							x={LABEL + ((g.from + g.to) / 2) * COL}
							y={12}
							text-anchor="middle"
							fill="var(--ink-2)"
							font-weight="600"
						>
							{g.name}
						</text>
						<line x1={LABEL + g.from * COL + 4} x2={LABEL + g.to * COL - 4} y1={18} y2={18} stroke="var(--grid)" />
					</>
				)}
			</For>
			<For each={data.tiers}>
				{(tier, i) => (
					<text x={LABEL + (i() + 0.5) * COL} y={HEAD - 10} text-anchor="middle" fill="var(--ink-3)" font-size="10.5">
						{FIRST[i()] ?? tier}
					</text>
				)}
			</For>
			<For each={data.rows}>
				{(row, r) => {
					const y = HEAD + r() * ROW;
					return (
						<>
							<text x={LABEL - 8} y={y + ROW / 2 + 4} text-anchor="end" fill="var(--ink)">
								{row.name}
							</text>
							<For each={row.cells}>
								{(cell, c) => {
									const status = STATUS[cell.status];
									const x = LABEL + c() * COL;
									const lines = () => [
										`${row.name}, ${data.tiers[c()]}: ${status.label}`,
										`code: ${cell.code.replaceAll(" ✓", "").replaceAll(" ⚡", "")}`,
										...(cell.proof ? [`proofs: ${cell.proof}`] : []),
										...(cell.note ? [cell.note] : []),
									];
									return (
										<g {...on(() => ({ x: x + COL / 2, y, lines: lines() }))} aria-label={lines().join(". ")}>
											<rect
												x={x + GAP}
												y={y + GAP}
												width={COL - 2 * GAP}
												height={ROW - 2 * GAP}
												rx="4"
												fill={status.color}
											/>
											{cell.status === "routine" && (
												<rect
													x={x + GAP}
													y={y + GAP}
													width={COL - 2 * GAP}
													height={ROW - 2 * GAP}
													rx="4"
													fill="url(#rind-hatch)"
												/>
											)}
											{cell.status === "e2e" && (
												<text
													x={x + COL / 2}
													y={y + ROW / 2 + 4}
													text-anchor="middle"
													fill="var(--e2e-ink)"
													font-weight="700"
												>
													✓{cell.note ? "*" : ""}
												</text>
											)}
										</g>
									);
								}}
							</For>
						</>
					);
				}}
			</For>
		</Chart>
	);
}
