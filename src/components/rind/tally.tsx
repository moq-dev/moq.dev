// What building rind cost in Claude, as a till receipt: list price, then the subscription that paid for it.
import { For } from "solid-js";
import { Figure } from "./chart";
import data from "./data/tally.json";

// The Claude subscription that ran every session, in US dollars a month.
const PLAN = 100;

type Model = keyof typeof data.cost_usd_by_model;
const CLAUDE = (Object.keys(data.cost_usd_by_model) as Model[])
	.filter((m) => m.startsWith("Claude"))
	.sort((a, b) => data.cost_usd_by_model[b] - data.cost_usd_by_model[a]);
// Review bots also run on subscriptions; the tally only estimates what they'd cost at list.
const BOTS = Object.entries(data.bots_rough_estimate.cost_usd_by_bot).filter(([bot]) => !bot.startsWith("Codex"));

const tokens = CLAUDE.flatMap((m) => Object.values(data.tokens_by_model[m])).reduce((a, n) => a + n, 0);
const reads = CLAUDE.reduce((a, m) => a + data.tokens_by_model[m].cache_read, 0) / tokens;
const bots = BOTS.reduce((a, [, cost]) => a + cost, 0);
const list = CLAUDE.reduce((a, m) => a + data.cost_usd_by_model[m], 0) + bots;
const paid = (PLAN * data.calendar_span.count) / 30;

const usd = (n: number, cents = false) =>
	`$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const date = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

export default function Tally() {
	const lines: [string, string][] = [
		...CLAUDE.map((m): [string, string] => [m, usd(data.cost_usd_by_model[m])]),
		["Review bots (est.)", usd(bots)],
	];
	const stats: [string, string][] = [
		["Tokens", `${(tokens / 1e9).toFixed(2)}B`],
		["Cache reads", `${Math.round(reads * 100)}%`],
		["Agent hrs", data.agent_hours["Claude Code"].toFixed(1)],
		["Human hrs", data.maintainer_hours.toFixed(1)],
	];

	return (
		<Figure
			label={`A receipt: ${usd(list)} of Claude and review bots at list prices, paid ${usd(paid, true)} through a ${usd(PLAN)} a month subscription.`}
			table={{
				head: ["Line", "Amount"],
				rows: [...lines, ...stats, ["List price", usd(list, true)], ["Paid", usd(paid, true)]],
			}}
			source={
				<>
					From the tally in <a href={data.source.pr}>moq-dev/rind#400</a>, as of {data.as_of.slice(0, 10)}. {data.scope}
					. Claude Code logs, each API message counted once, priced at each model's standard API rate. Review bots:{" "}
					{BOTS.map(([bot, cost]) => `${bot} ${usd(cost)}`).join(", ")}, a rough estimate. Paid:{" "}
					{data.calendar_span.count} days of a {usd(PLAN)} a month plan. Human hours are the maintainer's prompts, with
					gaps over 15 minutes counted as away.
				</>
			}
		>
			<div class="till">
				<div class="receipt">
					<div class="c">
						<div class="store">RIND</div>
						{date(data.calendar_span.first).toUpperCase()} → {date(data.calendar_span.last).toUpperCase()}{" "}
						{data.calendar_span.last.slice(0, 4)}
						<br />
						{data.calendar_span.count} DAYS · TERMINAL /goal
					</div>
					<hr />
					<For each={lines}>
						{([item, cost]) => (
							<div class="li">
								<span>{item.toUpperCase()}</span>
								<span>{cost}</span>
							</div>
						)}
					</For>
					<hr />
					<For each={stats}>
						{([item, value]) => (
							<div class="li">
								<span>{item.toUpperCase()}</span>
								<span>{value}</span>
							</div>
						)}
					</For>
					<hr />
					<div class="li list">
						<span>LIST PRICE</span>
						<span>{usd(list, true)}</span>
					</div>
					<div class="li">
						<span>SUBSIDIES</span>
						<span>−{usd(list - paid, true)}</span>
					</div>
					<hr />
					<div class="li paid">
						<span>PAID</span>
						<span>{usd(paid, true)}</span>
					</div>
					<div class="c">
						{data.calendar_span.count} DAYS OF {usd(PLAN)}/MO · YOU SAVED {Math.floor((1 - paid / list) * 100)}%
					</div>
					<hr />
					<div class="c">THANK YOU FOR VIBING</div>
					<div class="barcode" />
				</div>
			</div>
		</Figure>
	);
}
