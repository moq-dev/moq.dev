// A tiny deterministic network model for the voice AI diagrams.
// Everything is a pure function of wall-clock time `t` so the animation can be scrubbed.

// Seconds of audio per packet. Opus uses 20ms; 100ms keeps the dots countable.
export const FRAME = 0.1;

// One-way network delay, exaggerated so packets are visible in flight.
export const FLIGHT = 0.25;

export interface Word {
	text: string;
	start: number;
	end: number;
}

// A packet-sized slice of a track, keyed by media timestamp.
// Each field is the wall-clock time the slice enters that state.
export interface Segment {
	ts: number;
	have?: number; // available but not consumed (light fill)
	start?: number; // consumption starts (solid fill grows)
	done?: number; // consumption finishes
	missing?: number; // known to be missing, waiting on a retransmit
	lost?: number; // given up on
}

export interface Packet {
	ts: number;
	sent: number;
	lost: boolean;
	rtx?: number; // retransmit time, if the transport bothers
}

// A window of wall-clock time where every packet sent is lost.
export interface Loss {
	start: number;
	end: number;
}

export function frames(duration: number): number[] {
	const count = Math.round(duration / FRAME);
	return Array.from({ length: count }, (_, i) => round(i * FRAME));
}

export function transmit(ts: number[], send: (ts: number) => number, loss: Loss, retransmit: boolean): Packet[] {
	let retransmits = 0;
	return ts.map((ts) => {
		const sent = send(ts);
		const lost = sent >= loss.start && sent < loss.end;
		// Retransmits queue up behind the loss and go out in a quick burst once it clears.
		const rtx = lost && retransmit ? loss.end + 0.02 * retransmits++ : undefined;
		return { ts, sent, lost, rtx };
	});
}

export function arrival(p: Packet): number | undefined {
	if (!p.lost) return p.sent + FLIGHT;
	if (p.rtx !== undefined) return p.rtx + FLIGHT;
	return undefined;
}

export function fill(s: Segment, t: number): number {
	if (s.start === undefined || s.done === undefined || t < s.start) return 0;
	return Math.min(1, (t - s.start) / Math.max(1e-6, s.done - s.start));
}

export function has(at: number | undefined, t: number): boolean {
	return at !== undefined && t >= at;
}

// The media timestamp consumption has reached.
export function head(segments: Segment[], t: number): number {
	let pos = 0;
	for (const s of segments) {
		if (has(s.lost, t)) pos = Math.max(pos, s.ts + FRAME);
		const f = fill(s, t);
		if (f > 0) pos = Math.max(pos, s.ts + FRAME * f);
	}
	return pos;
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}
