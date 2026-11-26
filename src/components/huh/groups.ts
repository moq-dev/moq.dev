// A publisher writing video and audio frames over QUIC, one stream per group, frame by frame as they're encoded.
// Audio outranks video. With `reset` on, the newest video group goes first and an older group's unsent tail is
// reset once a newer group starts; with it off, every frame goes out in order, however late. Sizes are in kb and
// bandwidth in kb/s; times are seconds of media, which starts at zero on both clocks.

export const FPS = 10; // slowed down so each frame is visible
export const GOP = 10; // frames per group: a keyframe, then deltas
export const I_SIZE = 60; // a keyframe is a whole picture
export const P_SIZE = 10; // a delta is only what changed
export const AUDIO_SIZE = 4;
export const AUDIO_GOP = 10; // audio frames stand alone, but still ride in groups so a stream carries more than one

// The average rate of the whole broadcast, for scaling the bandwidth control.
export const RATE = (FPS * (I_SIZE + (GOP - 1) * P_SIZE)) / GOP + FPS * AUDIO_SIZE;

export type Kind = "video" | "audio";

export interface Frame {
	kind: Kind;
	group: number;
	index: number; // within its group; 0 is the keyframe
	ts: number; // when it was encoded
	size: number;
	sent: number; // kb sent so far; it arrives once all of it has
	arrived?: number; // when its last byte was sent
	reset?: number; // when its stream was reset before it went out
}

export interface Options {
	bandwidth: number;
	reset: boolean;
}

// How far behind a viewer falls before it gives up on the backlog and skips to the newest group, as a real player
// does, which keeps the backlog bounded.
export const BEHIND = 10;

// Frames older than this have all been sent or reset, and are forgotten since nothing draws them.
const KEEP = BEHIND + 2;

export class Sim {
	t = 0;
	frames: Frame[] = [];
	#next = { video: 0, audio: 0 };

	step(dt: number, opts: Options) {
		this.t += dt;
		this.#encode("video", GOP);
		this.#encode("audio", AUDIO_GOP);
		const behind = this.t - BEHIND;
		const stale = this.frames.some((f) => f.ts < behind && f.arrived === undefined && f.reset === undefined);
		if (opts.reset || stale) this.#reset();

		let budget = opts.bandwidth * dt;
		for (const frame of this.#order(opts.reset)) {
			if (budget <= 0) break;
			const take = Math.min(budget, frame.size - frame.sent);
			frame.sent += take;
			budget -= take;
			if (frame.sent >= frame.size) frame.arrived = this.t;
		}

		const cutoff = this.t - KEEP;
		if (this.frames[0] && this.frames[0].ts < cutoff) this.frames = this.frames.filter((f) => f.ts >= cutoff);
	}

	#encode(kind: Kind, gop: number) {
		for (let n = this.#next[kind]; n / FPS <= this.t; n = ++this.#next[kind]) {
			const index = n % gop;
			const size = kind === "audio" ? AUDIO_SIZE : index === 0 ? I_SIZE : P_SIZE;
			this.frames.push({ kind, group: Math.floor(n / gop), index, ts: n / FPS, size, sent: 0 });
		}
	}

	// Resets every group with a newer one of its kind started, throwing away whatever it hasn't sent yet. Audio
	// always keeps up, so in practice only video is reset.
	#reset() {
		const newest = { video: 0, audio: 0 };
		for (const f of this.frames) newest[f.kind] = Math.max(newest[f.kind], f.group);
		for (const f of this.frames) {
			if (f.group < newest[f.kind] && f.arrived === undefined && f.reset === undefined) f.reset = this.t;
		}
	}

	// The frames waiting to send, in the order the sender serves them.
	#order(newestFirst: boolean): Frame[] {
		const waiting = this.frames.filter((f) => f.arrived === undefined && f.reset === undefined);
		const audio = waiting.filter((f) => f.kind === "audio");
		const video = waiting.filter((f) => f.kind === "video");
		// Within a group, frames always go in order: a delta is useless without the frames before it.
		if (newestFirst) video.sort((a, b) => b.group - a.group || a.index - b.index);
		return [...audio, ...video];
	}

	// The newest frame of `kind` the viewer can play: it, and every frame before it in its group, has arrived.
	playable(kind: Kind): Frame | undefined {
		let best: Frame | undefined;
		let group = -1;
		let complete = false;
		for (const f of this.frames) {
			if (f.kind !== kind) continue;
			if (f.group !== group) {
				group = f.group;
				complete = f.index === 0;
			}
			complete &&= f.arrived !== undefined;
			if (complete) best = f;
		}
		return best;
	}

	// How far the viewer's newest playable frame of `kind` trails the encoder, in seconds.
	latency(kind: Kind): number {
		const f = this.playable(kind);
		return f ? this.t - f.ts : this.t;
	}
}
