// Every review a bot left on GitHub, per day, stacked by reviewer: Pullfrog arrives on Oct 30 and takes
// over from the Codex connector, beside CodeRabbit.
import { createSignal, For, Show } from "solid-js";
import { Figure } from "../rind/chart";
import { count, type Day, date, days, span, total } from "./data";
import "./quest.css";
import { scrub } from "./scrub";

const H = 180;

// Bottom to top, so the newcomer stacks on the ones it joined.
const REVIEWERS = [
	{ login: "chatgpt-codex-connector", name: "Codex", color: "var(--took)" },
	{ login: "coderabbitai", name: "CodeRabbit", color: "var(--other)" },
	{ login: "pullfrog", name: "Pullfrog", color: "var(--own)" },
];

const reviews = (d: Day, login: string) => d.reviews[login] ?? 0;
const stack = (d: Day) => REVIEWERS.reduce((a, r) => a + reviews(d, r.login), 0);
const MAX = Math.max(...days.map(stack));
const TICKS = days.flatMap((d, i) => (d.date.endsWith("-01") ? [{ i, label: date(d.date) }] : []));

// Pullfrog's first review, and the merged PRs it read out of those merged in repos it had joined.
const START = days.findIndex((d) => reviews(d, "pullfrog") > 0);
const READ = total((d) => reviews(d, "pullfrogMerged"));
const OF = total((d) => reviews(d, "pullfrogJoined"));

export default function Reviews() {
	const [at, setAt] = createSignal<number>();
	const w = 100 / days.length;
	// A 2px surface gap between stacked segments, in the plot's units.
	const gap = (2 / H) * MAX;

	return (
		<Figure
			class="quest-fig"
			kicker={`Reviews by bots on GitHub, per day · ${span}`}
			number={count(total((d) => reviews(d, "pullfrog")))}
			headline={
				<>
					reviews by Pullfrog
					<br />
					since {date(days[START].date)}
				</>
			}
			label={`Reviews per day by ${REVIEWERS.map((r) => r.name).join(", ")}, ${span}. Pullfrog reviewed ${count(READ)} of the ${count(OF)} PRs merged once it had joined their repository.`}
			table={{
				head: ["Day", ...REVIEWERS.map((r) => r.name), "PRs merged where Pullfrog was", "of them, Pullfrog reviewed"],
				rows: days.map((d) => [
					d.date,
					...REVIEWERS.map((r) => reviews(d, r.login)),
					reviews(d, "pullfrogJoined"),
					reviews(d, "pullfrogMerged"),
				]),
			}}
			source={
				<>
					GitHub reviews by each bot's login, on every repository with 20 or more PRs in the window, by the day each was
					submitted. A bot reviews a PR again on each new head, so a PR can have several. Replies to a review's threads
					aren't counted.
				</>
			}
		>
			<div class="key">
				<For each={[...REVIEWERS].reverse()}>
					{(r) => (
						<span>
							<i style={{ background: r.color }} />
							{r.name} ·{" "}
							<strong>
								{count(at() === undefined ? total((d) => reviews(d, r.login)) : reviews(days[at() ?? 0], r.login))}
							</strong>
						</span>
					)}
				</For>
				<Show when={at() !== undefined}>
					<span>{date(days[at() ?? 0].date)}</span>
				</Show>
			</div>
			<div class="mt-4" {...scrub(at, setAt, "Pick a day to see each bot's reviews")}>
				<svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: `${H}px` }} aria-hidden="true">
					<line class="grid" x1="0" x2="100" y1={H} y2={H} vector-effect="non-scaling-stroke" />
					<For each={days}>
						{(d, i) => {
							let base = 0;
							return (
								<For each={REVIEWERS}>
									{(r) => {
										const n = reviews(d, r.login);
										const y0 = base;
										base += n;
										const h = Math.max(0, ((n - (y0 ? gap : 0)) / MAX) * H);
										return (
											<Show when={n > 0}>
												<rect
													x={i() * w + w * 0.12}
													width={w * 0.76}
													y={H - ((y0 + n) / MAX) * H}
													height={h}
													fill={r.color}
													opacity={at() === undefined || at() === i() ? 1 : 0.45}
												/>
											</Show>
										);
									}}
								</For>
							);
						}}
					</For>
					<line
						class="cursor"
						x1={START * w}
						x2={START * w}
						y1="0"
						y2={H}
						stroke-dasharray="3 3"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
				<div class="axis relative mt-1 h-4">
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
				Pullfrog reviewed {count(READ)} of the {count(OF)} PRs merged once it had joined their repository (
				{Math.round((100 * READ) / OF)}%).
			</p>
		</Figure>
	);
}
