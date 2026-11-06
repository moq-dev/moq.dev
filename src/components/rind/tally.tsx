// What building rind cost in AI: total tokens and API-price dollars by model, and agent hours against the maintainer's.
import { For } from "solid-js";
import { Chart, createTip } from "./chart";
import data from "./data/tally.json";

type Model = keyof typeof data.tokens_by_model;

const MODELS = (Object.keys(data.cost_usd_by_model) as Model[]).sort(
	(a, b) => data.cost_usd_by_model[b] - data.cost_usd_by_model[a],
);
const TOKENS: Record<keyof (typeof data.tokens_by_model)[Model], string> = {
	input: "input",
	cache_write_5m: "5m cache writes",
	cache_write_1h: "1h cache writes",
	cache_read: "cache reads",
	output: "output",
};
const TYPES = Object.keys(TOKENS) as (keyof typeof TOKENS)[];

const count = (n: number) =>
	n >= 1e9 ? `${(n / 1e9).toPrecision(3)}B` : n >= 1e6 ? `${(n / 1e6).toPrecision(3)}M` : n.toLocaleString("en-US");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const W = 640;
const LABEL = 196;
const RIGHT = 64;
const ROW = 28;
const BAR = 16;

const reads = MODELS.reduce((a, m) => a + data.tokens_by_model[m].cache_read, 0) / data.tokens_total;

export default function Tally() {
	const { tip, on } = createTip();
	const costMax = data.cost_usd_by_model[MODELS[0]];

	const stats = [
		{ label: "at API list prices", value: usd(data.cost_usd_total) },
		{ label: `tokens, ${(reads * 100).toFixed(0)}% cache reads`, value: count(data.tokens_total) },
		{
			label: `agent hours (Claude Code ${data.agent_hours["Claude Code"]}, Codex ${data.agent_hours.Codex})`,
			value: data.agent_hours.total.toLocaleString("en-US"),
		},
		{ label: "maintainer hours, a lower bound", value: data.maintainer_hours.toLocaleString("en-US") },
	];
	const bots = data.bots_rough_estimate;

	return (
		<Chart
			title="The AI tally"
			subtitle={`rind, ${data.calendar_span.first} to ${data.calendar_span.last} (${data.calendar_span.count} days)`}
			stats={
				<>
					<div class="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
						<For each={stats}>
							{(s) => (
								<div class="rounded-lg border p-3" style={{ "border-color": "var(--grid)" }}>
									<div class="text-2xl font-bold tabular-nums">{s.value}</div>
									<div class="text-xs" style={{ color: "var(--ink-2)" }}>
										{s.label}
									</div>
								</div>
							)}
						</For>
					</div>
					<p class="mb-4 text-xs" style={{ color: "var(--ink-2)" }}>
						Not in these totals: moving MoQ and Bun onto rind, {usd(data.migrations.cost_usd)},{" "}
						{count(data.migrations.tokens_total)} tokens, and {data.migrations.agent_hours} agent hours; and third-party
						review bots, roughly {usd(bots.cost_usd_total)} (
						{Object.entries(bots.cost_usd_by_bot)
							.map(([bot, cost]) => `${bot} ${usd(cost)}`)
							.join(", ")}
						), a rough estimate.
					</p>
				</>
			}
			width={W}
			height={MODELS.length * ROW + 4}
			tip={tip}
			label="rind's API-price cost by model."
			table={{
				head: ["Model", ...TYPES.map((t) => TOKENS[t]), "Cost"],
				rows: MODELS.map((m) => [
					m,
					...TYPES.map((t) => count(data.tokens_by_model[m][t])),
					usd(data.cost_usd_by_model[m]),
				]),
			}}
			source={
				<>
					From the tally in{" "}
					<a class="underline" href={data.source.pr}>
						moq-dev/rind#400
					</a>
					, as of {data.as_of.slice(0, 10)}; it reruns just before this post goes out. {data.scope}. Claude Code and
					Codex logs, each API message counted once, priced at each model's standard API rate; maintainer hours are
					their own prompts, with gaps over 15 minutes counted as away.
				</>
			}
		>
			<For each={MODELS}>
				{(model, i) => {
					const cost = data.cost_usd_by_model[model];
					const w = (cost / costMax) * (W - LABEL - RIGHT);
					const top = i() * ROW + 4;
					return (
						<g
							{...on(() => ({
								x: LABEL + w / 2,
								y: top,
								lines: [
									`${model}: ${usd(cost)}`,
									...TYPES.map((t) => `${count(data.tokens_by_model[model][t])} ${TOKENS[t]}`),
								],
							}))}
						>
							<rect x={0} y={top} width={W} height={ROW} fill="transparent" />
							<text x={LABEL - 10} y={top + BAR - 2} text-anchor="end" fill="var(--ink)">
								{model}
							</text>
							<rect x={LABEL} y={top + 2} width={Math.max(2, w)} height={BAR} rx="4" fill="var(--rind)" />
							<text x={LABEL + w + 6} y={top + BAR - 1} fill="var(--ink-2)">
								{usd(cost)}
							</text>
						</g>
					);
				}}
			</For>
		</Chart>
	);
}
