// Everything since quests started, one square each: questions answered, PRs merged, messages typed,
// and quests finished, in blocks of the same scale that fill in day by day.
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Figure, frames, midscreen, reduced } from "../rind/chart";
import { ANSWERS, count, type Day, date, days, decided, merged, span, total } from "./data";
import "./quest.css";

// Squares per row in every block, so equal areas mean equal counts at any width.
const COLS = 200;
// Seconds the fill takes from the first day to the last.
const PLAY = 7;

interface Item {
	day: number;
	color: string;
	label: string;
}

interface Block {
	name: string;
	items: Item[];
}

// A day's items in a fixed shuffle, so its answers read as a mix rather than stripes.
function shuffle(items: Item[], seed: number) {
	let s = seed;
	for (let i = items.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const j = s % (i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

function block(name: string, label: string, color: string, n: (d: Day) => number): Block {
	return { name, items: days.flatMap((d, day) => Array.from({ length: n(d) }, () => ({ day, color, label }))) };
}

const BLOCKS: Block[] = [
	{
		name: "questions answered",
		items: days.flatMap((d, day) =>
			shuffle(
				ANSWERS.flatMap((a) =>
					Array.from({ length: d.decisions[a.key] ?? 0 }, () => ({ day, color: a.color, label: a.label })),
				),
				day + 1,
			),
		),
	},
	block("PRs merged", "merged", "var(--ink-2)", merged),
	block("messages typed", "typed", "var(--ink-2)", (d) => d.messages),
	block("quests finished", "finished", "var(--ink-2)", (d) => d.quests.deleted),
];

export default function Squares() {
	let figure: HTMLElement | undefined;
	const canvases: HTMLCanvasElement[] = [];
	// The day the fill has reached; it rests on the last, so the figure reads complete before it plays.
	const [clock, setClock] = createSignal(days.length);
	const [tip, setTip] = createSignal<{ x: number; y: number; text: string; sub: string }>();
	const drawn = BLOCKS.map(() => 0);

	// CSS variables resolved once, since a canvas can't read them.
	const colors = new Map<string, string>();
	const paint = (c: string) => {
		if (!c.startsWith("var(")) return c;
		if (!colors.has(c) && figure) colors.set(c, getComputedStyle(figure).getPropertyValue(c.slice(4, -1)).trim());
		return colors.get(c) ?? c;
	};

	const size = (canvas: HTMLCanvasElement, n: number) => {
		const pitch = canvas.clientWidth / COLS;
		const dpr = devicePixelRatio;
		canvas.style.height = `${Math.ceil(n / COLS) * pitch}px`;
		canvas.width = Math.round(canvas.clientWidth * dpr);
		canvas.height = Math.round(Math.ceil(n / COLS) * pitch * dpr);
		return pitch * dpr;
	};

	// Draws each block's squares up to `upto` days, from where it left off.
	const draw = (upto: number) => {
		BLOCKS.forEach((b, i) => {
			const canvas = canvases[i];
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const pitch = canvas.width / COLS;
			const side = Math.max(1, pitch * 0.72);
			let k = drawn[i];
			for (; k < b.items.length && b.items[k].day < upto; k++) {
				ctx.fillStyle = paint(b.items[k].color);
				ctx.fillRect((k % COLS) * pitch, Math.floor(k / COLS) * pitch, side, side);
			}
			drawn[i] = k;
		});
	};

	const reset = () => {
		BLOCKS.forEach((b, i) => {
			size(canvases[i], b.items.length);
			drawn[i] = 0;
		});
	};

	let cancel = () => {};
	const play = () => {
		cancel();
		reset();
		setClock(0);
		cancel = frames((s) => {
			const upto = Math.min(days.length, (s / PLAY) * days.length);
			setClock(upto);
			draw(upto);
			return upto < days.length;
		});
	};

	const hover = (i: number, e: MouseEvent) => {
		const canvas = canvases[i];
		if (!figure) return;
		const pitch = canvas.clientWidth / COLS;
		const k = Math.floor(e.offsetY / pitch) * COLS + Math.floor(e.offsetX / pitch);
		const item = BLOCKS[i].items[k];
		if (!item || item.day >= clock()) return setTip(undefined);
		const d = days[item.day];
		const box = figure.getBoundingClientRect();
		const on = BLOCKS[i].items.filter((x) => x.day === item.day).length;
		setTip({
			x: e.clientX - box.left,
			y: e.clientY - box.top,
			text: `${date(d.date)} · ${item.label}`,
			sub: `${count(on)} ${BLOCKS[i].name} that day`,
		});
	};

	onMount(() => {
		reset();
		draw(days.length);
		const resize = new ResizeObserver(() => {
			reset();
			draw(clock());
		});
		for (const c of canvases) resize.observe(c);
		onCleanup(() => resize.disconnect());
		if (figure && !reduced()) midscreen(figure, play);
	});
	onCleanup(() => cancel());

	const decisions = total(decided);
	const share = (key: string) =>
		Math.round((100 * total((d) => d.decisions[key] ?? 0)) / total((d) => decided(d) - (d.decisions.unranked ?? 0)));

	return (
		<Figure
			class="quest-fig"
			ref={(el) => {
				figure = el;
			}}
			kicker={`Everything, one square each · ${span}`}
			number={count(decisions)}
			headline={
				<>
					questions from agents,
					<br />
					answered by me
				</>
			}
			label={`${count(decisions)} questions answered, ${count(total(merged))} PRs merged, ${count(total((d) => d.messages))} messages typed, and ${count(total((d) => d.quests.deleted))} quests finished, ${span}, one square each.`}
			table={{
				head: ["Day", ...ANSWERS.map((a) => a.label), "PRs merged", "messages typed", "quests finished"],
				rows: days.map((d) => [
					d.date,
					...ANSWERS.map((a) => d.decisions[a.key] ?? 0),
					merged(d),
					d.messages,
					d.quests.deleted,
				]),
			}}
			source={
				<>
					Questions and messages from <code>quest messages</code> on four machines: each answer to Claude Code's or
					Codex's blocking question tool, and each message typed into a session. PRs from GitHub, every repository with
					20 or more PRs in the window. Quests finished are files deleted under <code>quest/</code> on moq-dev/moq's
					main.
				</>
			}
		>
			<div class="blocks">
				<For each={BLOCKS}>
					{(b, i) => (
						<div class="block">
							<div class="label">
								<span>{b.name}</span>
								<strong>{count(b.items.filter((x) => x.day < clock()).length)}</strong>
							</div>
							<canvas
								ref={(el) => {
									canvases[i()] = el;
								}}
								onMouseMove={(e) => hover(i(), e)}
								onMouseLeave={() => setTip(undefined)}
							/>
						</div>
					)}
				</For>
			</div>
			<div class="key">
				<For each={ANSWERS.slice(0, 3)}>
					{(a) => (
						<span>
							<i style={{ background: a.color }} />
							{a.label} · {share(a.key)}%
						</span>
					)}
				</For>
			</div>
			<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
				<span class="clock">{date(days[Math.min(days.length - 1, Math.floor(clock()))].date)}</span>
				<button type="button" class="replay" onClick={play}>
					↻ Replay
				</button>
			</div>
			<Show when={tip()}>
				{(t) => (
					<div class="tip" style={{ left: `${t().x}px`, top: `${t().y}px` }}>
						{t().text}
						<br />
						<span>{t().sub}</span>
					</div>
				)}
			</Show>
		</Figure>
	);
}
