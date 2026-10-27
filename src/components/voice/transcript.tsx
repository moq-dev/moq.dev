// Both sides' words, each underlined by its own audio: one segment per 20 ms packet, colored by how
// far it got. Your words fill in as the agent receives them; its words land in your buffer well
// ahead of the playhead and turn solid as you hear them.
import { createEffect, createMemo, createSignal, For, Index, type JSX, onCleanup, Show } from "solid-js";
import { align, type CallLog, type Packet } from "./call";

// A run of speech by one side. `interim` is your words the recognizer may still revise.
export type Turn = { who: "you" | "ai"; text: string; interim: string };

const PACKET: Record<Packet, string> = {
	delivered: "#22c55e",
	buffered: "rgba(34, 197, 94, 0.35)",
	reordered: "#f59e0b",
	flight: "#334155",
	interrupted: "#94a3b8",
	lost: "#ef4444",
};

const LEGEND: [Packet, string][] = [
	["delivered", "delivered"],
	["buffered", "buffered ahead"],
	["reordered", "arrived out of order"],
	["flight", "in flight"],
	["interrupted", "interrupted"],
	["lost", "lost"],
];

const REDRAW_MS = 100;

function words(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

function underline(packets: Packet[]): JSX.CSSProperties {
	// A run of one state is one gradient stop pair.
	const stops: string[] = [];
	let from = 0;
	packets.forEach((packet, i) => {
		if (packets[i + 1] === packet) return;
		const to = ((i + 1) / packets.length) * 100;
		stops.push(`${PACKET[packet]} ${from}% ${to}%`);
		from = to;
	});
	return {
		"background-image": `linear-gradient(to right, ${stops.join(", ")})`,
		"background-size": "100% 3px",
		"background-position": "0 100%",
		"background-repeat": "no-repeat",
		"padding-bottom": "3px",
		// A word a barge-in cut off entirely was never said. Only the agent's words are cut off.
		color: packets.every((p) => p === "interrupted") ? "rgba(74, 222, 128, 0.4)" : undefined,
	};
}

/** `live` while the call's audio still moves, so the underlines follow its packets. */
export default function Transcript(props: { turns: Turn[]; log?: CallLog; live: boolean }) {
	const [tick, setTick] = createSignal(0);
	createEffect(() => {
		if (!props.live) return;
		const timer = setInterval(() => setTick((t) => t + 1), REDRAW_MS);
		onCleanup(() => {
			clearInterval(timer);
			// One last look at where every packet ended up.
			setTick((t) => t + 1);
		});
	});

	// Each word's underline by turn, from the `voice.json` word it matches.
	const underlines = createMemo(() => {
		tick();
		const log = props.log;
		const turns = props.turns;
		if (!log) return [];
		const spoken = (who: Turn["who"]) => turns.filter((t) => t.who === who).flatMap((t) => words(t.text));
		const matched = { you: align(spoken("you"), log.userWords), ai: align(spoken("ai"), log.agentWords) };
		const next = { you: 0, ai: 0 };
		return turns.map((turn) =>
			words(turn.text).map(() => {
				const word = matched[turn.who][next[turn.who]++];
				if (!word) return undefined;
				return underline(turn.who === "you" ? log.sent(word) : log.heard(word));
			}),
		);
	});

	// The transcript follows new words unless the reader has scrolled up to reread.
	let list: HTMLOListElement | undefined;
	let following = true;
	createEffect(() => {
		void props.turns;
		if (list && following) list.scrollTop = list.scrollHeight;
	});

	return (
		<Show when={props.turns.length > 0}>
			<ol
				ref={(el) => {
					list = el;
					following = true;
				}}
				onScroll={(e) => {
					const el = e.currentTarget;
					following = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
				class="mt-4 mb-0 max-h-80 list-none space-y-3 overflow-y-auto p-0"
				aria-label="Transcript"
			>
				<For each={props.turns}>
					{(turn, t) => (
						<li class="flex gap-3">
							<span class="w-8 shrink-0 pt-0.5 text-right font-mono text-xs text-slate-500">
								{turn.who === "ai" ? "AI" : "you"}
							</span>
							<p class="m-0 flex flex-wrap gap-x-1.5 font-bold">
								<Index each={words(turn.text)}>
									{(word, i) => (
										<span
											class={turn.who === "ai" ? "text-green-400" : "text-slate-100"}
											style={underlines()[t()]?.[i]}
										>
											{word()}
										</span>
									)}
								</Index>
								<Index each={words(turn.interim)}>{(word) => <span class="text-slate-500">{word()}</span>}</Index>
							</p>
						</li>
					)}
				</For>
			</ol>
			<Show when={props.log}>
				<ul
					class="mt-3 mb-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-slate-400"
					aria-label="Underline legend"
				>
					<For each={LEGEND}>
						{([packet, label]) => (
							<li class="flex items-center gap-1.5">
								<span class="inline-block h-1 w-4 rounded-sm" style={{ background: PACKET[packet] }} />
								{label}
							</li>
						)}
					</For>
				</ul>
			</Show>
		</Show>
	);
}
