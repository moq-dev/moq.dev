// What building rind cost in AI: tokens, API-price dollars, and agent hours against the maintainer's.
import { createSignal, For, Show } from "solid-js";
import { Chart, createTip, Toggle } from "./chart";
import data from "./data/tally.json";

type Line = (typeof data.lines)[number];

const NAMES: Record<string, string> = { rind: "rind", migrations: "migrating MoQ and Bun" };
const TOKENS: Record<keyof Line["tokens"], string> = {
	input: "input",
	cache_write: "cache writes",
	cache_read: "cache reads",
	output: "output",
};

const count = (n: number) =>
	n >= 1e9 ? `${(n / 1e9).toPrecision(3)}B` : n >= 1e6 ? `${(n / 1e6).toPrecision(3)}M` : n.toLocaleString("en-US");
const total = (line: Line) => Object.values(line.tokens).reduce((a, b) => a + b, 0);

const W = 640;
const LABEL = 132;
const RIGHT = 80;
const ROW = 30;
const BAR = 16;
const H = 2 * ROW + 4;

export default function Tally() {
	const [name, setName] = createSignal(data.lines[0].name);
	const { tip, on } = createTip();
	const line = () => data.lines.find((l) => l.name === name()) ?? data.lines[0];
	const hours = () => [
		{ who: "agents", value: line().agent_hours, color: "var(--rind)" },
		{ who: "maintainer", value: line().maintainer_hours, color: "var(--other)" },
	];
	const width = (v: number) => (v / line().agent_hours) * (W - LABEL - RIGHT);

	const stats = () => [
		{
			label: "tokens",
			value: count(total(line())),
			detail: (Object.keys(TOKENS) as (keyof Line["tokens"])[])
				.map((k) => `${count(line().tokens[k])} ${TOKENS[k]}`)
				.join(", "),
		},
		{ label: "at API prices", value: `$${line().cost_usd.toLocaleString("en-US")}`, detail: "list price per model" },
		{ label: "agent hours", value: line().agent_hours.toLocaleString("en-US"), detail: "summed wall-clock" },
		{
			label: "maintainer hours",
			value: line().maintainer_hours.toLocaleString("en-US"),
			detail: "active at the keyboard",
		},
	];

	return (
		<Chart
			title="The AI tally"
			subtitle={`${NAMES[name()] ?? name()}, ${data.source.span.from} to ${data.source.span.to}`}
			controls={
				<>
					<Toggle
						label="Work"
						options={data.lines.map((l) => l.name)}
						names={NAMES}
						value={name()}
						onChange={setName}
					/>
					<Show when={data.placeholder}>
						<span class="rounded-sm bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-950">
							placeholder data
						</span>
					</Show>
				</>
			}
			stats={
				<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<For each={stats()}>
						{(s) => (
							<div class="rounded-lg border p-3" style={{ "border-color": "var(--grid)" }} title={s.detail}>
								<div class="text-2xl font-bold tabular-nums">{s.value}</div>
								<div class="text-xs" style={{ color: "var(--ink-2)" }}>
									{s.label}
								</div>
							</div>
						)}
					</For>
				</div>
			}
			width={W}
			height={H}
			tip={tip}
			label={`Agent hours against maintainer hours for ${NAMES[name()] ?? name()}.`}
			table={{
				head: ["Work", "Tokens", "API-price cost", "Agent hours", "Maintainer hours"],
				rows: data.lines.map((l) => [
					NAMES[l.name] ?? l.name,
					count(total(l)),
					`$${l.cost_usd.toLocaleString("en-US")}`,
					l.agent_hours,
					l.maintainer_hours,
				]),
			}}
			source={
				<>
					{data.placeholder ? `${data.todo} ` : ""}Method: {data.source.method}
				</>
			}
		>
			<For each={hours()}>
				{(h, i) => {
					const y = i() * ROW + 4;
					return (
						<g {...on(() => ({ x: LABEL + width(h.value), y, lines: [`${h.who}: ${h.value} hours`] }))}>
							<rect x={0} y={y} width={W} height={ROW} fill="transparent" />
							<text x={LABEL - 10} y={y + BAR - 2} text-anchor="end" fill="var(--ink)">
								{h.who === "agents" ? "agent hours" : "maintainer hours"}
							</text>
							<rect x={LABEL} y={y + 2} width={Math.max(2, width(h.value))} height={BAR} rx="4" fill={h.color} />
							<text x={LABEL + width(h.value) + 6} y={y + BAR - 1} fill="var(--ink-2)">
								{h.value.toLocaleString("en-US")}
							</text>
						</g>
					);
				}}
			</For>
			<text x={W - 4} y={ROW + 4} text-anchor="end" fill="var(--rind)" font-weight="700" font-size="14">
				{(line().agent_hours / line().maintainer_hours).toFixed(0)}×
			</text>
		</Chart>
	);
}
