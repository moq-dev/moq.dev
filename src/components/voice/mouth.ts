// Lip sync from loudness and brightness alone. Cartoon mouths never needed phonemes, and the
// agent's audio is all we get.

// Preston Blair-ish mouths, each a file in public/voice/mouth/. No two names differ only by case,
// so they survive a case-insensitive checkout.
export const SHAPES = ["rest", "slit", "small-o", "big-d", "big-o"] as const;
export type Shape = (typeof SHAPES)[number];

const FRAME_MS = 1000 / 60;
const ATTACK = 0.45;
const RELEASE = 0.22;

// How open the mouth wants to be, 0 to 1, from the RMS of a block of samples. Room tone sits under
// the floor.
export function level(samples: Float32Array): number {
	let sum = 0;
	for (const v of samples) sum += v * v;
	const rms = Math.sqrt(sum / samples.length);
	return Math.min(1, Math.max(0, (rms - 0.012) * 9));
}

// The spectral centroid in Hz of `spectrum`, in dB as AnalyserNode reports it, with bins `binHz`
// apart. Weighting by linear magnitude keeps the faint high bins from dragging every sound bright.
export function centroid(spectrum: Float32Array, binHz: number): number {
	let num = 0;
	let den = 0;
	// The bottom bins are DC and rumble.
	for (let i = 2; i < spectrum.length; i++) {
		const magnitude = 10 ** (spectrum[i] / 20);
		num += i * magnitude;
		den += magnitude;
	}
	return den ? (num / den) * binHz : 0;
}

// Move `current` toward `target` by `rate` of the gap per 60 Hz frame, at any frame rate.
export function ease(current: number, target: number, rate: number, dtMs: number): number {
	return current + (target - current) * (1 - (1 - rate) ** (dtMs / FRAME_MS));
}

// Opening fast and closing slower, so syllables read and the mouth does not chatter.
export function follow(current: number, target: number, dtMs: number): number {
	return ease(current, target, target > current ? ATTACK : RELEASE, dtMs);
}

// `tone` is the centroid over the voice's own average: darker than usual rounds the mouth, so it
// suits any voice without tuning a frequency.
export function pick(open: number, tone: number): Shape {
	if (open < 0.08) return "rest";
	const round = tone < 0.9;
	if (open < 0.35) return round ? "small-o" : "slit";
	return round ? "big-o" : "big-d";
}
