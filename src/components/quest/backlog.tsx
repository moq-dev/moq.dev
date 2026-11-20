// Quests written and finished on moq-dev/moq, summed day by day: the gap between the lines is the
// open tree, which stays bounded because a finished quest's file is deleted.
import { createSignal, For, Show } from "solid-js";
import { Figure } from "../rind/chart";
import { count, date, days, span } from "./data";
import "./quest.css";
import { scrub } from "./scrub";

const H = 200;

// Running totals of quests written and finished, and the open tree between them.
const RUNS = (() => {
	let added = 0;
	let deleted = 0;
	return days.map((d) => {
		added += d.quests.added;
		deleted += d.quests.deleted;
		return { date: d.date, added, deleted, open: added - deleted };
	});
})();
const MAX = RUNS[RUNS.length - 1].added;
const TICKS = days.flatMap((d, i) => (d.date.endsWith("-01") ? [{ i, label: date(d.date) }] : []));

const x = (i: number) => (100 * (i + 0.5)) / RUNS.length;
const y = (n: number) => H - (n / MAX) * H;
const path = (key: "added" | "deleted") => RUNS.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[key])}`).join("");
// The open tree as the area between the two lines.
const GAP = `${path("added")}${RUNS.map((_, i) => `L${x(RUNS.length - 1 - i)},${y(RUNS[RUNS.length - 1 - i].deleted)}`).join("")}Z`;

export default function Backlog() {
	const [at, setAt] = createSignal<number>();
	const last = RUNS[RUNS.length - 1];
	const r = () => RUNS[at() ?? RUNS.length - 1];

	return (
		<Figure
			class="quest-fig"
			kicker={`moq-dev/moq's quest tree · ${span}`}
			number={count(last.deleted)}
			headline={
				<>
					quests finished
					<br />
					and deleted
				</>
			}
			label={`Quests written and finished on moq-dev/moq, ${span}: ${count(last.added)} written, ${count(last.deleted)} finished, ${count(last.open)} open.`}
			table={{
				head: ["Day", "Written, so far", "Finished, so far", "Open"],
				rows: RUNS.map((r) => [r.date, r.added, r.deleted, r.open]),
			}}
			source={
				<>
					Markdown files added and deleted under <code>quest/</code> in moq-dev/moq's main branch history; a moved quest
					is neither. Open counts only quests written since quests started.
				</>
			}
		>
			<div class="key">
				<span>
					<i style={{ background: "var(--took)" }} />
					written · <strong>{count(r().added)}</strong>
				</span>
				<span>
					<i style={{ background: "var(--own)" }} />
					finished · <strong>{count(r().deleted)}</strong>
				</span>
				<span>
					<i style={{ background: "var(--line)" }} />
					open · <strong>{count(r().open)}</strong>
				</span>
				<Show when={at() !== undefined}>
					<span>{date(r().date)}</span>
				</Show>
			</div>
			<div class="mt-4" {...scrub(at, setAt, "Pick a day to see the quest tree then")}>
				<svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: `${H}px` }} aria-hidden="true">
					<For each={[0.25, 0.5, 0.75, 1]}>
						{(f) => (
							<line class="grid" x1="0" x2="100" y1={H - f * H} y2={H - f * H} vector-effect="non-scaling-stroke" />
						)}
					</For>
					<path d={GAP} fill="var(--line)" />
					<path
						d={path("added")}
						fill="none"
						stroke="var(--took)"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					/>
					<path
						d={path("deleted")}
						fill="none"
						stroke="var(--own)"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
					/>
					<Show when={at() !== undefined}>
						{/* biome-ignore lint/style/noNonNullAssertion: shown only when set */}
						<line class="cursor" x1={x(at()!)} x2={x(at()!)} y1="0" y2={H} vector-effect="non-scaling-stroke" />
					</Show>
				</svg>
				<div class="axis relative mt-1 h-4">
					<For each={TICKS}>
						{(t) => (
							<span class="absolute" style={{ left: `${(100 * t.i) / RUNS.length}%`, "font-family": "var(--mono)" }}>
								{t.label}
							</span>
						)}
					</For>
				</div>
			</div>
		</Figure>
	);
}
