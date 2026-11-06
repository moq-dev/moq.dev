// What building rind cost in AI: tokens and API-price dollars by model and by day, and agent hours against the maintainer's.
import { createSignal, For, Show } from "solid-js";
import { Chart, createTip, Toggle } from "./chart";
import data from "./data/tally.json";

type Model = keyof typeof data.tokens_by_model;
type Day = (typeof data.per_day)[number];

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

const VIEWS = ["per day", "by model"] as const;
const METRICS = ["cost", "tokens", "agent hours", "maintainer hours"] as const;
type Metric = (typeof METRICS)[number];

const count = (n: number) =>
	n >= 1e9 ? `${(n / 1e9).toPrecision(3)}B` : n >= 1e6 ? `${(n / 1e6).toPrecision(3)}M` : n.toLocaleString("en-US");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const hours = (n: number) => `${n.toLocaleString("en-US")} h`;

const METRIC: Record<Metric, { value: (d: Day) => number; text: (n: number) => string }> = {
	cost: { value: (d) => d.cost_usd, text: usd },
	tokens: { value: (d) => d.tokens, text: count },
	"agent hours": { value: (d) => d.agent_hours, text: hours },
	"maintainer hours": { value: (d) => d.maintainer_hours, text: hours },
};

// A round step that splits `max` into about four gridlines.
const step = (max: number) => {
	const raw = max / 4;
	const mag = 10 ** Math.floor(Math.log10(raw));
	return ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
};

const W = 640;
const AXIS = 48;
const PLOT = 180;
const FOOT = 18;
const LABEL = 196;
const RIGHT = 64;
const ROW = 28;
const BAR = 16;

const reads = MODELS.reduce((a, m) => a + data.tokens_by_model[m].cache_read, 0) / data.tokens_total;

export default function Tally() {
	const [view, setView] = createSignal<(typeof VIEWS)[number]>("per day");
	const [metric, setMetric] = createSignal<Metric>("cost");
	const { tip, on } = createTip();

	const days = data.per_day;
	const slot = (W - AXIS) / days.length;
	const max = () => Math.max(...days.map(METRIC[metric()].value));
	const ticks = () => {
		const s = step(max());
		return Array.from({ length: Math.ceil(max() / s) + 1 }, (_, i) => i * s);
	};
	const top = () => ticks().at(-1) ?? max();
	const y = (v: number) => PLOT - (v / top()) * (PLOT - 8);

	const costMax = data.cost_usd_by_model[MODELS[0]];
	const height = () => (view() === "per day" ? PLOT + FOOT : MODELS.length * ROW + 4);

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
			controls={
				<>
					<Toggle label="View" options={VIEWS} value={view()} onChange={setView} />
					<Show when={view() === "per day"}>
						<Toggle label="Metric" options={METRICS} value={metric()} onChange={setMetric} />
					</Show>
				</>
			}
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
			height={height()}
			tip={tip}
			label={
				view() === "per day"
					? `rind's ${metric()} per day, ${data.calendar_span.first} to ${data.calendar_span.last}.`
					: "rind's API-price cost by model."
			}
			table={
				view() === "per day"
					? {
							head: ["Date", "Cost", "Tokens", "Agent hours", "Maintainer hours"],
							rows: days.map((d) => [d.date, usd(d.cost_usd), count(d.tokens), d.agent_hours, d.maintainer_hours]),
						}
					: {
							head: ["Model", ...TYPES.map((t) => TOKENS[t]), "Cost"],
							rows: MODELS.map((m) => [
								m,
								...TYPES.map((t) => count(data.tokens_by_model[m][t])),
								usd(data.cost_usd_by_model[m]),
							]),
						}
			}
			source={
				<>
					From the tally in{" "}
					<a class="underline" href={data.source.pr}>
						moq-dev/rind#400
					</a>
					, as of {data.as_of.slice(0, 10)}; it reruns just before this post goes out. {data.scope}. Claude Code and
					Codex logs, each API message counted once, priced at each model's standard API rate; maintainer hours are
					their own prompts, with gaps over 15 minutes counted as away. Haiku's{" "}
					{usd(data.cost_usd_by_model["Claude Haiku 5.5"])} is left out of the per-day totals.
				</>
			}
		>
			<Show
				when={view() === "per day"}
				fallback={
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
				}
			>
				<For each={ticks()}>
					{(t) => (
						<>
							<line x1={AXIS} x2={W} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
							<text x={AXIS - 6} y={y(t) + 4} text-anchor="end" fill="var(--ink-3)" font-size="10">
								{METRIC[metric()].text(t)}
							</text>
						</>
					)}
				</For>
				<For each={days}>
					{(d, i) => {
						const x = () => AXIS + i() * slot + slot * 0.2;
						const v = () => METRIC[metric()].value(d);
						return (
							<g
								{...on(() => ({
									x: x() + slot * 0.3,
									y: y(v()),
									lines: [
										d.date,
										`${usd(d.cost_usd)}, ${count(d.tokens)} tokens`,
										`${d.agent_hours} agent hours, ${d.maintainer_hours} maintainer hours`,
									],
								}))}
							>
								<rect x={AXIS + i() * slot} y={0} width={slot} height={PLOT} fill="transparent" />
								<rect
									x={x()}
									y={y(v())}
									width={slot * 0.6}
									height={Math.max(2, PLOT - y(v()))}
									rx="4"
									fill="var(--rind)"
								/>
								<text x={x() + slot * 0.3} y={PLOT + 14} text-anchor="middle" fill="var(--ink-3)" font-size="10">
									{d.date.slice(5)}
								</text>
							</g>
						);
					}}
				</For>
			</Show>
		</Chart>
	);
}
