// A plot that scrubs through days by pointer or arrow keys, as an accessible slider.
import type { Accessor, Setter } from "solid-js";
import { date, days } from "./data";

export function scrub(at: Accessor<number | undefined>, setAt: Setter<number | undefined>, label: string) {
	const last = days.length - 1;
	const clamp = (i: number) => Math.max(0, Math.min(last, i));
	return {
		role: "slider",
		tabIndex: 0,
		"aria-label": label,
		"aria-valuemin": 0,
		"aria-valuemax": last,
		// Getters, so a spread keeps them reactive.
		get "aria-valuenow"() {
			return at() ?? last;
		},
		get "aria-valuetext"() {
			return date(days[at() ?? last].date);
		},
		onMouseMove: (e: MouseEvent) => {
			// Measured from the plot itself, since offsetX is relative to whichever child is under the pointer.
			const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
			setAt(clamp(Math.floor(((e.clientX - box.left) / box.width) * days.length)));
		},
		onMouseLeave: () => setAt(undefined),
		onBlur: () => setAt(undefined),
		onKeyDown: (e: KeyboardEvent) => {
			const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -7, PageUp: 7 }[e.key];
			if (e.key === "Home" || e.key === "End") setAt(e.key === "Home" ? 0 : last);
			else if (step) setAt(clamp((at() ?? last) + step));
			else return;
			e.preventDefault();
		},
	} as const;
}
