// Streams sharing one congestion window, served strictly in rank order: QUIC lets the sender pick which stream's
// bytes go next, so a lower-ranked stream only gets what the ones above it leave over. Rates are Mb/s, sizes Mb.

export interface Stream {
	id: number;
	name: string;
	rate: number; // what the application writes
	queued: number; // written but not yet sent
	out: number; // recent send rate, smoothed for display
	starved: number; // seconds spent getting less than STARVED of its rate
}

// The most a stream buffers before its writer blocks, which also bounds what a reset throws away.
export const MAX_QUEUE = 2;

// A stream getting less than this share of its rate is starving.
export const STARVED = 0.25;

// How quickly the displayed send rate follows the real one, per second.
const SMOOTH = 4;

// Splits `capacity` over the demands in rank order: each takes all it wants before the next gets any.
export function allocate(demand: readonly number[], capacity: number): number[] {
	let left = Math.max(0, capacity);
	return demand.map((want) => {
		const take = Math.min(want, left);
		left -= take;
		return take;
	});
}

// Advances every stream by `dt` seconds over a congestion window of `cwnd` Mb/s.
export function step(streams: Stream[], cwnd: number, dt: number) {
	// Coarsened animation timestamps can repeat, and a zero step has no rate to measure.
	if (dt <= 0) return;
	for (const s of streams) s.queued = Math.min(MAX_QUEUE, s.queued + s.rate * dt);
	const sent = allocate(
		streams.map((s) => s.queued),
		cwnd * dt,
	);
	const k = 1 - Math.exp(-SMOOTH * dt);
	streams.forEach((s, i) => {
		s.queued -= sent[i];
		s.out += (sent[i] / dt - s.out) * k;
		s.starved = s.out < s.rate * STARVED ? s.starved + dt : 0;
	});
}

// Moves the stream at `from` up (-1) or down (+1) one rank, if it can.
export function move(streams: Stream[], from: number, by: -1 | 1) {
	const to = from + by;
	if (to < 0 || to >= streams.length) return;
	[streams[from], streams[to]] = [streams[to], streams[from]];
}
