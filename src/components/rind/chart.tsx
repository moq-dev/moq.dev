// The frame every figure in the rind post shares: a kicker, one headline number, the plot, and the data
// behind it in a collapsed table with its source.
import { For, type JSX, onCleanup, Show } from "solid-js";
import "./chart.css";

// A table cell: data, not JSX, so the frame builds each element once, in render order. An array is
// one cell of several parts.
type Part = string | { text: string; href: string };
export type Cell = number | Part | Part[];
const part = (p: Part) => (typeof p === "object" ? <a href={p.href}>{p.text}</a> : p);

export interface Props {
	kicker?: string;
	number?: string; // the headline number, in giant type
	headline?: JSX.Element;
	label: string; // what the figure shows, for screen readers
	table: { head: string[]; rows: Cell[][] };
	source: JSX.Element;
	ref?: (el: HTMLElement) => void;
	children: JSX.Element;
}

export function Figure(props: Props) {
	return (
		<figure class="rind-fig not-prose select-none" aria-label={props.label} ref={props.ref}>
			<Show when={props.kicker}>
				<div class="kicker">{props.kicker}</div>
			</Show>
			<Show
				when={props.number}
				fallback={<Show when={props.headline}>{<p class="headline">{props.headline}</p>}</Show>}
			>
				<div class="hero">
					<div class="big number">{props.number}</div>
					<p class="headline">{props.headline}</p>
				</div>
			</Show>
			{props.children}
			<details class="data">
				<summary>Data</summary>
				<div class="overflow-x-auto">
					<table>
						<thead>
							<tr>
								<For each={props.table.head}>{(h) => <th>{h}</th>}</For>
							</tr>
						</thead>
						<tbody>
							<For each={props.table.rows}>
								{(row) => (
									<tr>
										<For each={row}>
											{(cell) => (
												<td>{typeof cell === "number" ? cell : Array.isArray(cell) ? cell.map(part) : part(cell)}</td>
											)}
										</For>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
				<p>{props.source}</p>
			</details>
		</figure>
	);
}

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Runs `fn` once `el` reaches the middle half of the viewport, so an animation starts where it's seen.
export function midscreen(el: Element, fn: () => void) {
	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries[0].isIntersecting) return;
			observer.disconnect();
			fn();
		},
		{ rootMargin: "-25% 0px -25% 0px" },
	);
	observer.observe(el);
	onCleanup(() => observer.disconnect());
}

// Calls `fn` with the seconds since start on every frame until it returns false; returns a cancel.
export function frames(fn: (seconds: number) => boolean) {
	let id = 0;
	let start: number | undefined;
	const step = (now: number) => {
		start ??= now;
		if (fn((now - start) / 1000)) id = requestAnimationFrame(step);
	};
	id = requestAnimationFrame(step);
	return () => cancelAnimationFrame(id);
}

// A CPU model as people say it: "Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz" is "Core i7-8700".
export const cpu = (model: string) =>
	model
		.replace(/\((R|TM)\)/g, "")
		.replace(/^(Intel|AMD)\s+/, "")
		.replace(/\s+(CPU @.*|\d+-Core Processor)$/, "")
		.trim();

export const geomean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

export function time(ns: number) {
	if (ns < 1_000) return `${ns.toPrecision(3)} ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toPrecision(3)} µs`;
	return `${(ns / 1_000_000).toPrecision(3)} ms`;
}

export const times = (x: number) => `${x.toFixed(2)}×`;

// admin/bench-report's speed bands, by time over the fastest's; a heatmap colors each as .s<band>.
const EDGES = [1.1, 1.25, 1.5, 2, 4, 8];
export const BANDS = ["fastest, or within 10%", "to 1.25×", "to 1.5×", "to 2×", "to 4×", "to 8×", "over 8×"];
export const band = (ratio: number) => {
	const i = EDGES.findIndex((edge) => ratio <= edge);
	return i < 0 ? EDGES.length : i;
};

// The speed key under a heatmap.
export function Bands() {
	return (
		<div class="key">
			<For each={BANDS}>
				{(label, i) => (
					<span>
						<span class="trio">
							<i class={`s${i()}`} />
						</span>
						{label}
					</span>
				)}
			</For>
		</div>
	);
}

export const day = (iso: string) => iso.slice(0, 10);
// The days a set of hosts ran, since each host's report can come from a different run.
export const days = (hosts: { source: { date: string } }[]) =>
	[...new Set(hosts.map((h) => day(h.source.date)))].sort().join(" and ");

export const commit = (sha: string) => <a href={`https://github.com/moq-dev/rind/commit/${sha}`}>{sha.slice(0, 8)}</a>;

// rind's report names for libraries, as the post spells them.
export const NAMES: Record<string, string> = {
	"rind-dit-held": "rind (DIT held)",
	rustcrypto: "RustCrypto",
	openssl: "OpenSSL",
};
export const name = (lib: string) => NAMES[lib] ?? lib;
