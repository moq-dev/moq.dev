// Everything measured about one live call's audio, on this page's clock (`performance.now()` ms).
//
// Three sources feed it:
// - Your mic frames: `@moq/publish` stamps each with its capture time on this clock, so the media
//   timestamp the agent reports is already a local time.
// - The agent's `voice.json` (moq.pro agent/VOICE.md, version 2): its view of the call on its own
//   monotonic clock.
// - The reply: `@moq/watch` reports each frame's arrival on this clock, and the playhead.
//
// The agent's clock is placed on ours NTP-style, from the fastest transit each way: request frames
// bound the offset from one side and reply frames from the other, so it needs no clock agreement.

// The agent's Opus frames, and the span each packet of a word covers.
export const FRAME_MS = 20;

/** A `voice.json` record. Unknown types are skipped; see moq.pro agent/VOICE.md. */
export type AgentRecord = { version?: number; type?: string; [key: string]: unknown };

/**
 * One frame of a word, as far as it has travelled. `delivered` is at the agent for your words and
 * played for its own; `buffered` is a reply frame here ahead of the playhead.
 */
export type Packet = "delivered" | "buffered" | "reordered" | "flight" | "interrupted" | "lost";

export interface MicFrame {
	capture: number; // local
	arrive: number; // agent
	reordered: boolean; // reached the agent after a frame captured later: retransmitted or reordered
}

export interface ReplyFrame {
	media: number; // reply media time
	arrive: number; // local
	late: boolean; // missed even MoQ's playout deadline
	// Which publish carried it, once known. A barge-in starts a new track where the old one's
	// playhead was, so two tracks can hold the same media time.
	track?: string;
	published?: number; // agent
	played?: boolean;
	discarded?: boolean;
}

export interface Word {
	text: string;
	start: number; // local capture time for yours, reply media time for the agent's
	end: number;
	track?: string;
}

interface Publish {
	track: string;
	start: number; // reply media
	end: number;
	at: number; // agent
}

// A record's media time in milliseconds on its own track.
function ms(record: AgentRecord, field: string): number | undefined {
	const ticks = record[field];
	const scale = record.timescale;
	if (typeof ticks !== "number" || typeof scale !== "number" || scale <= 0) return undefined;
	return (ticks * 1000) / scale;
}

function agentMs(record: AgentRecord, field: string): number | undefined {
	const ns = record[field];
	return typeof ns === "number" ? ns / 1e6 : undefined;
}

// Insert keeping `list` sorted by `key`. Records arrive in about time order, so scan from the back.
// Returns where it went.
function insert<T>(list: T[], item: T, key: (t: T) => number): number {
	let i = list.length;
	while (i > 0 && key(list[i - 1]) > key(item)) i--;
	list.splice(i, 0, item);
	return i;
}

// The first index whose key is at least `value`, in a list sorted by `key`.
function lowerBound<T>(list: T[], value: number, key: (t: T) => number): number {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (key(list[mid]) < value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

// Each FRAME_MS of a word, the middle of the frame it should fall in.
function slots(word: Word): number[] {
	const count = Math.max(1, Math.round((word.end - word.start) / FRAME_MS));
	return Array.from({ length: count }, (_, i) => word.start + (i + 0.5) * FRAME_MS);
}

export class CallLog {
	mic: MicFrame[] = [];
	reply: ReplyFrame[] = [];
	gaps: { media: number; duration: number }[] = [];
	// Reply media the player holds but has not played: received, decoded or not.
	buffered: { start: number; end: number }[] = [];
	// In the order the agent settled on them, which is the order they were said.
	userWords: Word[] = [];
	agentWords: Word[] = [];
	// The STT's latest interim result for your words since its last final ones.
	interims: Word[] = [];
	#interimAt?: number;
	// Whether the reply is playing, and when it last stopped.
	#replying = false;
	#replyStopped?: number;
	publishes: Publish[] = [];
	// The longest publish, which bounds how far back one can still hold a media time.
	#longest = 0;
	// Tracks a barge-in retired: their later arrivals never play.
	#retired = new Set<string>();
	// A reconnect restates the window, so a word can come twice.
	#seen = new Set<string>();
	// The reply's media time only moves forward, across track changes too.
	#head?: number;

	// The fastest transit each way, each including the clock offset.
	minUp?: number; // agent - local
	minDown?: number; // local - agent

	/** Agent time minus local time, once both directions have been measured. */
	get offset(): number | undefined {
		if (this.minUp === undefined || this.minDown === undefined) return undefined;
		return (this.minUp - this.minDown) / 2;
	}

	/** The most the offset can be wrong by: half the fastest round trip. */
	get error(): number | undefined {
		if (this.minUp === undefined || this.minDown === undefined) return undefined;
		return (this.minUp + this.minDown) / 2;
	}

	/** Ingest one `voice.json` record. */
	agent(record: AgentRecord) {
		if (record.version !== 2) return;
		switch (record.type) {
			case "arrival": {
				const capture = ms(record, "media_ticks");
				const arrive = agentMs(record, "arrival_ns");
				if (capture === undefined || arrive === undefined) return;
				const frame = { capture, arrive, reordered: false };
				const at = insert(this.mic, frame, (f) => f.capture);
				for (let i = at + 1; i < this.mic.length && !frame.reordered; i++) {
					frame.reordered = this.mic[i].arrive < arrive;
				}
				const up = arrive - capture;
				if (this.minUp === undefined || up < this.minUp) this.minUp = up;
				return;
			}
			case "word": {
				const start = ms(record, "start_ticks");
				const end = ms(record, "end_ticks");
				if (typeof record.text !== "string" || start === undefined || end === undefined) return;
				const track = typeof record.track === "string" ? record.track : undefined;
				const key = `${record.speaker}:${track}:${start}:${record.text}`;
				if (this.#seen.has(key)) return;
				this.#seen.add(key);
				const word = { text: record.text, start, end, track };
				if (record.speaker === "user") {
					this.userWords.push(word);
					// A final result settles the interims it covers.
					this.interims = this.interims.filter((w) => w.start >= end);
				} else if (record.speaker === "agent") this.agentWords.push(word);
				return;
			}
			case "interim": {
				const start = ms(record, "start_ticks");
				const end = ms(record, "end_ticks");
				const at = agentMs(record, "at_ns");
				if (typeof record.text !== "string" || start === undefined || end === undefined || at === undefined) return;
				// One result's words share its time, and each result restates the words since the last final.
				if (at !== this.#interimAt) {
					this.#interimAt = at;
					this.interims = [];
				}
				this.interims.push({ text: record.text, start, end });
				return;
			}
			case "publish": {
				const start = ms(record, "start_ticks");
				const end = ms(record, "end_ticks");
				const at = agentMs(record, "at_ns");
				if (typeof record.track !== "string" || start === undefined || end === undefined || at === undefined) return;
				const publish = { track: record.track, start, end, at };
				insert(this.publishes, publish, (p) => p.start);
				this.#longest = Math.max(this.#longest, end - start);
				// The audio can beat its own record here, leaving a frame on the retired track's publish
				// of the same media time; the newest publish sent before it arrived claims it.
				for (const frame of this.reply) {
					if (frame.media < start || frame.media >= end) continue;
					if (frame.published !== undefined && frame.published >= at) continue;
					if (!this.#sentBefore(at, frame.arrive)) continue;
					this.#published(frame, publish);
				}
				return;
			}
			case "retire": {
				if (typeof record.track !== "string") return;
				this.#retired.add(record.track);
				for (const frame of this.reply) {
					if (frame.track === record.track) this.#discard(frame);
				}
				return;
			}
		}
	}

	/** Whether a publish at agent time `at` can have been sent before local time `arrive`. */
	#sentBefore(at: number, arrive: number): boolean {
		// Trusting the offset's midpoint would turn away the faster frames that would refine it.
		const offset = this.offset;
		const error = this.error;
		return offset === undefined || error === undefined || at - offset - error <= arrive;
	}

	#published(frame: ReplyFrame, publish: Publish) {
		// A frame claimed from a retired track is not what that retirement discarded.
		if (frame.track !== undefined && frame.track !== publish.track) frame.discarded = false;
		frame.track = publish.track;
		frame.published = publish.at;
		// Between overlapping publishes the pick is only as good as the clock, and the wrong one could
		// undercut the fastest transit, so only a frame one publish alone holds measures it.
		const down = frame.arrive - publish.at;
		const holders = this.publishes.filter((p) => frame.media >= p.start && frame.media < p.end).length;
		if (holders === 1 && (this.minDown === undefined || down < this.minDown)) this.minDown = down;
		if (this.#retired.has(publish.track)) this.#discard(frame);
	}

	/** What a retired track still held never plays. */
	#discard(frame: ReplyFrame) {
		if (!frame.played) frame.discarded = true;
	}

	/** A reply frame as `@moq/watch` received it. */
	received(media: number, arrive: number, late: boolean) {
		const frame: ReplyFrame = { media, arrive, late };
		// Of the publishes holding this media time, the newest one sent before it arrived. Without a
		// clock offset yet there has been no barge-in, so there is only one.
		let best: Publish | undefined;
		for (let i = this.publishes.length - 1; i >= 0; i--) {
			const p = this.publishes[i];
			// Sorted by start, so once even the longest publish ends before this media time, none earlier holds it.
			if (p.start + this.#longest <= media) break;
			if (media < p.start || media >= p.end) continue;
			if (!this.#sentBefore(p.at, arrive)) continue;
			if (!best || p.at > best.at) best = p;
		}
		if (best) this.#published(frame, best);
		insert(this.reply, frame, (f) => f.media);
	}

	/** Reply media that will never arrive. */
	gap(media: number, duration: number) {
		this.gaps.push({ media, duration });
	}

	/** The reply media the player holds, which runs ahead of the arrivals its decoder has reached. */
	buffer(ranges: readonly { start: number; end: number }[]) {
		this.buffered = ranges.map(({ start, end }) => ({ start, end }));
	}

	/** The reply's playhead is at `media`, or nothing is playing. */
	playhead(media: number | undefined) {
		// An idle player reports zero.
		if (media === undefined || (this.#head !== undefined && media < this.#head)) return;
		this.#head = media;
		for (const frame of this.reply) {
			if (!frame.played && !frame.discarded && frame.media <= media) frame.played = true;
		}
	}

	/** Your word's frames, one per FRAME_MS, as the agent received them. */
	sent(word: Word): Packet[] {
		return slots(word).map((t) => {
			// The frame whose 20 ms holds this slot's middle.
			const i = lowerBound(this.mic, t - FRAME_MS, (f) => f.capture);
			const frame = this.mic[i];
			if (!frame || frame.capture > t) return "flight";
			return frame.reordered ? "reordered" : "delivered";
		});
	}

	/** The reply started or stopped playing at local time `at`. */
	replying(playing: boolean, at: number) {
		if (this.#replying && !playing) this.#replyStopped = at;
		this.#replying = playing;
	}

	/**
	 * Your audio the STT has not made words of, up to `now`: its frames, as far as they have got.
	 * Nothing while the reply plays, and it starts over once it stops.
	 */
	pending(now: number): Packet[] | undefined {
		const first = this.mic[0];
		if (this.#replying || !first) return undefined;
		const none = Number.NEGATIVE_INFINITY;
		let start = Math.max(first.capture, this.#replyStopped ?? none, this.userWords.at(-1)?.end ?? none);
		for (const word of this.interims) start = Math.max(start, word.end);
		if (now - start < FRAME_MS) return undefined;
		return this.sent({ text: "", start, end: now });
	}

	/** The agent's word's frames, one per FRAME_MS, as they reached you. */
	heard(word: Word): Packet[] {
		return slots(word).map((t) => {
			for (let i = lowerBound(this.reply, t - FRAME_MS, (f) => f.media); i < this.reply.length; i++) {
				const frame = this.reply[i];
				if (frame.media > t) break;
				// A frame can beat the record of the track that carries it.
				if (frame.track !== undefined && word.track !== undefined && frame.track !== word.track) continue;
				if (frame.discarded) return "interrupted";
				if (frame.late) return "lost";
				return frame.played ? "delivered" : "buffered";
			}
			if (word.track !== undefined && this.#retired.has(word.track)) return "interrupted";
			if (this.gaps.some((g) => t >= g.media && t < g.media + g.duration)) return "lost";
			// The decoder reports a frame only once playback nears it; the player holds it before that.
			if (this.buffered.some((r) => t >= r.start && t < r.end)) return "buffered";
			return "flight";
		});
	}
}

// Words as compared across the transcript and `voice.json`: case and punctuation aside.
function norm(text: string): string {
	return text
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, "");
}

// How far either side may run ahead: the transcript and `voice.json` each leave words out.
const SKIP = 4;

/**
 * Pair each transcript word with the timed word it is, in order. The transcript shows what was
 * said; `voice.json` leaves out any word it could not time, so a word without a match is undefined.
 */
export function align(texts: string[], words: Word[]): (Word | undefined)[] {
	let next = 0;
	return texts.map((text) => {
		const key = norm(text);
		if (!key) return undefined;
		for (let i = next; i < Math.min(words.length, next + SKIP); i++) {
			if (norm(words[i].text) !== key) continue;
			next = i + 1;
			return words[i];
		}
		return undefined;
	});
}
