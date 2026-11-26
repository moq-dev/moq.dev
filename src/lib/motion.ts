// One switch for every looping animation on the site. The motion toggle sets `.still`
// (paused) or `.moving` (played) on <html>; with neither, the OS reduced-motion setting
// decides. CSS reads the same state through the `still` variant in global.css.

const reducedMotion = () =>
	typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;

export function isStill() {
	if (typeof document === "undefined") return false;
	const root = document.documentElement;
	return root.classList.contains("still") || (!!reducedMotion()?.matches && !root.classList.contains("moving"));
}

export function setStill(still: boolean) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.classList.toggle("still", still);
	root.classList.toggle("moving", !still);
	try {
		localStorage.setItem("motion", still ? "off" : "on");
	} catch {
		// Private mode or blocked storage: the choice lasts until the next page load.
	}
	document.dispatchEvent(new Event("motion"));
}

// Calls `run(true)` while `el` is on screen, the tab is visible, and motion is on, and
// `run(false)` as soon as any of those stops being true. It also calls `run(false)` right
// away, so something that starts offscreen is paused before it's ever seen.
export function whileLive(el: Element, run: (live: boolean) => void) {
	let visible = false;
	let live: boolean | undefined;
	const sync = () => {
		const next = visible && !document.hidden && !isStill();
		if (next === live) return;
		live = next;
		run(next);
	};
	new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		sync();
	}).observe(el);
	document.addEventListener("visibilitychange", sync);
	document.addEventListener("motion", sync);
	reducedMotion()?.addEventListener("change", sync);
	sync();
}
