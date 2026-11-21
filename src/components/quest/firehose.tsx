// The daily volume since quests started, one lane per measure on its own scale, sharing the date axis.
import { createSignal, For, Show } from "solid-js";
import { Figure } from "../rind/chart";
import { count, type Day, date, days, decided, merged, span, total } from "./data";
import "./quest.css";
import { scrub } from "./scrub";

const H = 56;

interface Lane {
	name: string;
	value: (d: Day) => number;
	format: (n: number) => string;
	note?: string;
}

const usd = (n: number) => `$${count(Math.round(n))}`;

const LANES: Lane[] = [
	{ name: "PRs merged", value: merged, format: count },
	{ name: "questions answered", value: decided, format: count },
	{ name: "messages typed", value: (d) => d.messages, format: count },
	{
		name: "agent sessions",
		value: (d) => d.sessions,
		format: count,
		note: "from the logs each machine still keeps, so early days undercount",
	},
	{ name: "at API prices", value: (d) => d.costUsd, format: usd, note: "same logs, priced by token-max" },
];

// Axis ticks on the first of each month.
const TICKS = days.flatMap((d, i) => (d.date.endsWith("-01") ? [{ i, label: date(d.date) }] : []));

export default function Firehose() {
	const [at, setAt] = createSignal<number>();
	const busiest = days.reduce((a, d) => (merged(d) > merged(a) ? d : a));

	return (
		<Figure
			class="quest-fig"
			kicker={`Per day · ${span}`}
			number={count(merged(busiest))}
			headline={
				<>
					PRs merged on
					<br />
					{date(busiest.date)}
				</>
			}
			label={`Per day from ${span}: ${LANES.map((l) => l.name).join(", ")}, each on its own scale.`}
			table={{
				head: ["Day", ...LANES.map((l) => l.name)],
				rows: days.map((d) => [d.date, ...LANES.map((l) => l.format(l.value(d)))]),
			}}
			source={
				<>
					PRs from GitHub, every repository with 20 or more PRs in the window. Questions and messages from{" "}
					<code>quest messages</code> on four machines. Sessions and their cost from <code>token-max sessions</code> on
					the same machines, a session found on two counted once; subagents count as sessions. API prices are list
					prices, not what a subscription paid.
				</>
			}
		>
			<div class="lanes" {...scrub(at, setAt, "Pick a day to see its numbers in every lane")}>
				<For each={LANES}>
					{(lane) => {
						const max = Math.max(...days.map(lane.value));
						const w = 100 / days.length;
						return (
							<div class="lane">
								<div class="label">
									<span>
										{lane.name}
										<Show when={lane.note}>
											<small style={{ color: "var(--ink-3)" }}> · {lane.note}</small>
										</Show>
									</span>
									<strong>
										<Show when={at() !== undefined} fallback={lane.format(total(lane.value))}>
											{/* biome-ignore lint/style/noNonNullAssertion: shown only when set */}
											{lane.format(lane.value(days[at()!]))}
										</Show>
									</strong>
								</div>
								<svg
									viewBox={`0 0 100 ${H}`}
									preserveAspectRatio="none"
									style={{ height: `${H}px` }}
									aria-hidden="true"
								>
									<line class="grid" x1="0" x2="100" y1={H} y2={H} vector-effect="non-scaling-stroke" />
									<For each={days}>
										{(d, i) => {
											const h = (lane.value(d) / max) * H;
											return (
												<rect
													x={i() * w + w * 0.12}
													width={w * 0.76}
													y={H - h}
													height={h}
													fill={at() === i() ? "var(--rind)" : "var(--ink-2)"}
												/>
											);
										}}
									</For>
								</svg>
							</div>
						);
					}}
				</For>
				<div class="axis relative h-4">
					<For each={TICKS}>
						{(t) => (
							<span class="absolute" style={{ left: `${(100 * t.i) / days.length}%`, "font-family": "var(--mono)" }}>
								{t.label}
							</span>
						)}
					</For>
				</div>
			</div>
			<p class="fine">
				<Show when={at() !== undefined} fallback="Totals shown; hover a day for its numbers.">
					{/* biome-ignore lint/style/noNonNullAssertion: shown only when set */}
					{date(days[at()!].date)}
				</Show>
			</p>
		</Figure>
	);
}
