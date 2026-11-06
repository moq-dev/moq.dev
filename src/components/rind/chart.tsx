// The frame every chart in the rind post shares: title, toggles, a hover tip, the table view, and the source.
import { type Accessor, children, createSignal, For, type JSX, Show } from "solid-js";
import "./chart.css";

export interface Tip {
	x: number; // in the SVG's viewBox units
	y: number;
	lines: string[];
}

// A table cell: data, not JSX, so the frame builds each element once, in render order.
export type Cell = string | number | { text: string; href: string };

export interface Props {
	title: string;
	subtitle?: string;
	controls?: JSX.Element;
	stats?: JSX.Element; // headline numbers, above the plot
	legend?: { color: string; label: string; pattern?: boolean }[];
	width: number; // the SVG's viewBox, so the tip can be placed over it
	height: number;
	tip: Accessor<Tip | undefined>;
	label: string; // what the chart shows, for screen readers
	table: { head: string[]; rows: Cell[][] };
	source: JSX.Element;
	children: JSX.Element; // the SVG's contents
}

export function Chart(props: Props) {
	// Resolved once: reading a JSX prop twice (in `when`, then as children) would build it twice.
	const controls = children(() => props.controls);
	const stats = children(() => props.stats);

	return (
		<figure class="rind-chart not-prose card my-8 select-none p-4 text-left sm:p-5">
			<figcaption class="mb-3 flex flex-wrap items-baseline gap-x-3">
				<span class="font-mono text-sm font-medium uppercase tracking-wider">{props.title}</span>
				<Show when={props.subtitle}>
					<span class="text-sm" style={{ color: "var(--ink-2)" }}>
						{props.subtitle}
					</span>
				</Show>
			</figcaption>

			<Show when={controls()}>
				<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">{controls()}</div>
			</Show>

			<Show when={stats()}>{stats()}</Show>

			<Show when={props.legend}>
				<div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink-2)" }}>
					<For each={props.legend}>
						{(item) => (
							<span class="flex items-center gap-1.5">
								<svg width="12" height="12" aria-hidden="true">
									<rect width="12" height="12" rx="3" fill={item.color} />
									<Show when={item.pattern}>
										<rect width="12" height="12" rx="3" fill="url(#rind-hatch)" />
									</Show>
								</svg>
								{item.label}
							</span>
						)}
					</For>
				</div>
			</Show>

			<div class="relative">
				<svg
					viewBox={`0 0 ${props.width} ${props.height}`}
					class="block w-full"
					font-size="12"
					role="img"
					aria-label={props.label}
				>
					<defs>
						<pattern id="rind-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<rect width="1.5" height="5" fill="var(--surface)" opacity="0.55" />
						</pattern>
					</defs>
					{props.children}
				</svg>
				<Show when={props.tip()}>
					{(tip) => (
						<div
							class="pointer-events-none absolute z-10 max-w-72 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs shadow-lg"
							style={{
								left: `${(tip().x / props.width) * 100}%`,
								top: `calc(${(tip().y / props.height) * 100}% - 6px)`,
								background: "var(--surface)",
								"border-color": "var(--grid)",
							}}
						>
							<For each={tip().lines}>
								{(line, i) => <div style={{ color: i() ? "var(--ink-2)" : "var(--ink)" }}>{line}</div>}
							</For>
						</div>
					)}
				</Show>
			</div>

			<details class="mt-3 text-xs" style={{ color: "var(--ink-2)" }}>
				<summary class="cursor-pointer">Table</summary>
				<div class="mt-2 overflow-x-auto">
					<table class="w-full text-left">
						<thead>
							<tr>
								<For each={props.table.head}>{(h) => <th class="py-1 pr-3 font-medium">{h}</th>}</For>
							</tr>
						</thead>
						<tbody>
							<For each={props.table.rows}>
								{(row) => (
									<tr class="border-t" style={{ "border-color": "var(--grid)" }}>
										<For each={row}>
											{(cell) => (
												<td class="py-1 pr-3 !text-left">
													{typeof cell === "object" ? (
														<a class="underline" href={cell.href}>
															{cell.text}
														</a>
													) : (
														cell
													)}
												</td>
											)}
										</For>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
			</details>

			<div class="mt-2 text-[0.7rem] leading-snug" style={{ color: "var(--ink-3)" }}>
				{props.source}
			</div>
		</figure>
	);
}

// A row of mutually exclusive buttons, the toggle above every chart.
export function Toggle<T extends string>(props: {
	label: string;
	options: readonly T[];
	value: T;
	onChange: (value: T) => void;
	names?: Partial<Record<T, string>>;
}) {
	return (
		<fieldset class="flex flex-wrap items-center gap-1 text-xs" aria-label={props.label}>
			<span class="mr-1" style={{ color: "var(--ink-3)" }}>
				{props.label}
			</span>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-pressed={props.value === option}
						class="rounded-sm px-2 py-0.5"
						style={
							props.value === option
								? { background: "var(--button-on)", color: "var(--button-on-ink)" }
								: { background: "var(--button)", color: "var(--ink)" }
						}
						onClick={() => props.onChange(option)}
					>
						{props.names?.[option] ?? option}
					</button>
				)}
			</For>
		</fieldset>
	);
}

// The hover state every chart keeps: one tip at a time.
export function createTip() {
	const [tip, setTip] = createSignal<Tip>();
	// Spread onto a mark so the pointer and keyboard both show its tip.
	const on = (make: () => Tip) => ({
		tabIndex: 0,
		onPointerEnter: () => setTip(make()),
		onPointerLeave: () => setTip(undefined),
		onFocus: () => setTip(make()),
		onBlur: () => setTip(undefined),
	});
	return { tip, on };
}

export function time(ns: number) {
	if (ns < 1_000) return `${ns.toPrecision(3)} ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toPrecision(3)} µs`;
	return `${(ns / 1_000_000).toPrecision(3)} ms`;
}

export const times = (x: number) => `${x.toFixed(2)}×`;

export const day = (iso: string) => iso.slice(0, 10);

export const short = (sha: string) => sha.slice(0, 8);

export const commit = (sha: string) => (
	<a class="underline" href={`https://github.com/moq-dev/rind/commit/${sha}`}>
		{short(sha)}
	</a>
);
