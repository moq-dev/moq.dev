import type { JSX } from "solid-js";

// The palette every /huh diagram draws with, matching the voice diagrams.
export const COLOR = {
	green: "#22c55e",
	sky: "#38bdf8",
	violet: "#a78bfa",
	amber: "#f59e0b",
	red: "#ef4444",
	track: "#0f172a",
	line: "#334155",
	text: "#f1f5f9",
	dim: "#64748b",
	neutral: "#94a3b8",
};

// One color per stream, in order. Amber and red are kept for waiting and loss.
export const STREAM_COLORS = [COLOR.green, COLOR.sky, COLOR.violet, "#f472b6", "#2dd4bf", "#e2e8f0"];

export const MONO = "'JetBrains Mono', monospace";

// The card every diagram sits in: an accessible description, the drawing, then its controls.
export function Figure(props: { label: string; children: JSX.Element; controls: JSX.Element }) {
	return (
		<figure class="not-prose card -mx-5 select-none rounded-none border-x-0 px-3 py-4 sm:mx-0 sm:rounded-xl sm:border-x sm:p-5">
			<figcaption class="sr-only">{props.label}</figcaption>
			{props.children}
			<div class="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-2">{props.controls}</div>
		</figure>
	);
}

export function Button(props: {
	onClick: () => void;
	children: JSX.Element;
	pressed?: boolean;
	disabled?: boolean;
	label?: string;
	class?: string;
}) {
	return (
		<button
			type="button"
			class={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1 font-medium transition-colors disabled:opacity-40 ${
				props.pressed
					? "border-accent bg-accent-soft text-accent-ink"
					: "border-line-strong bg-surface-2 text-ink hover:border-ink-3"
			} ${props.class ?? ""}`}
			aria-pressed={props.pressed}
			aria-label={props.label}
			disabled={props.disabled}
			onClick={() => props.onClick()}
		>
			{props.children}
		</button>
	);
}

// A labeled range input; the native control brings keyboard and screen reader support.
export function Slider(props: {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	text: string; // the value, as read aloud and shown
	onInput: (value: number) => void;
}) {
	return (
		<label class="flex items-center gap-2">
			<span class="label">{props.label}</span>
			<input
				type="range"
				class="w-28 accent-green-500 sm:w-36"
				min={props.min}
				max={props.max}
				step={props.step}
				value={props.value}
				aria-valuetext={props.text}
				onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
			/>
			<span class="w-20 font-mono text-xs text-ink-3">{props.text}</span>
		</label>
	);
}

export function Swatch(props: { color: string; children: JSX.Element; outline?: boolean; hatch?: boolean }) {
	return (
		<span class="inline-flex items-center gap-1.5 text-xs text-ink-3">
			<span
				class="inline-block size-2.5 rounded-sm"
				style={{
					background: props.outline
						? "transparent"
						: props.hatch
							? `repeating-linear-gradient(45deg, ${props.color} 0 2px, transparent 2px 4px)`
							: props.color,
					border: props.outline ? `1.5px dashed ${props.color}` : undefined,
				}}
			/>
			{props.children}
		</span>
	);
}
