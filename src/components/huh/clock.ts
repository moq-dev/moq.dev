import { whileLive } from "@/lib/motion";

// Longest step a single frame may take, so a tab waking from the background doesn't jump the simulation.
const MAX_DT = 0.1;

export interface Clock {
	live(): boolean; // whether it's ticking: on screen, tab visible, and motion on
	stop(): void;
}

// Calls `tick(dt)` with elapsed seconds on every animation frame while `el` is live.
export function animate(el: Element, tick: (dt: number) => void): Clock {
	let frame = 0;
	let last = 0;
	let live = false;
	const loop = (now: number) => {
		tick(Math.min(MAX_DT, (now - last) / 1000));
		last = now;
		frame = requestAnimationFrame(loop);
	};
	const stop = whileLive(el, (next) => {
		live = next;
		cancelAnimationFrame(frame);
		if (!live) return;
		last = performance.now();
		frame = requestAnimationFrame(loop);
	});
	return {
		live: () => live,
		stop: () => {
			stop();
			cancelAnimationFrame(frame);
		},
	};
}

// Runs `step` for `seconds` in small increments: to pre-seed a diagram so it looks alive on first paint, or to show
// a control's effect while motion is paused.
export function advance(seconds: number, step: (dt: number) => void, dt = 1 / 30) {
	for (let t = 0; t < seconds; t += dt) step(Math.min(dt, seconds - t));
}
