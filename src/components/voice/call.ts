// Everything measured about one live call, on this page's clock (`performance.now()` milliseconds).
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

// A frame is late for WebRTC once it arrives this much later than the fastest one did: the initial
// target of libwebrtc's audio jitter buffer (NetEQ's kStartDelayMs in
// modules/audio_coding/neteq/delay_manager.cc), which only grows after it has already dropped audio.
export const WEBRTC_MS = 80;

// The agent's Opus frames, and the duration drawn for a reply frame.
export const FRAME_MS = 20;

// How much history to keep, in milliseconds.
const KEEP_MS = 60_000;

/** A `voice.json` record. Unknown types are skipped; see moq.pro agent/VOICE.md. */
export type AgentRecord = { version?: number; type?: string; [key: string]: unknown };

export interface MicFrame {
	capture: number; // local
	arrive: number; // agent
}

export interface ReplyFrame {
	media: number; // reply media time
	arrive: number; // local
	late: boolean; // missed even MoQ's playout deadline
	// Which publish carried it, once known. A barge-in starts a new track where the old one's
	// playhead was, so two tracks can hold the same media time.
	track?: string;
	published?: number; // agent
	play?: number; // local, frozen once it played or was interrupted
	discarded?: boolean;
}

export interface Word {
	text: string;
	start: number;
	end: number;
	at?: number; // agent, when STT settled on it
	track?: string;
}

export interface Mark {
	at: number; // agent
	kind: "vad" | "turn" | "llm" | "tts" | "retire";
	label: string;
	media?: number; // local, for user-side marks: what the agent had heard
}

export interface Span {
	start: number; // agent
	end?: number; // agent, open while running
	kind: "llm" | "tts";
	first?: number; // agent: first text or audio
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
function insert<T>(list: T[], item: T, key: (t: T) => number) {
	let i = list.length;
	while (i > 0 && key(list[i - 1]) > key(item)) i--;
	list.splice(i, 0, item);
}

export class CallLog {
	mic: MicFrame[] = [];
	reply: ReplyFrame[] = [];
	gaps: { media: number; duration: number }[] = [];
	userWords: Word[] = [];
	interims: Word[] = [];
	agentWords: Word[] = [];
	marks: Mark[] = [];
	spans: Span[] = [];
	// User speech as the VAD decided it, in local capture time.
	speech: { start: number; end?: number }[] = [];
	publishes: Publish[] = [];
	// The longest publish, which bounds how far back one can still hold a media time.
	#longest = 0;
	// Retired tracks and when they retired, on the local clock: their later arrivals never play.
	#retired = new Map<string, number>();

	// The fastest transit each way, each including the clock offset.
	minUp?: number; // agent - local
	minDown?: number; // local - agent

	// Where the reply's playhead was, and when.
	#anchor?: { local: number; media: number };
	#playing = false;
	#head?: { now: number; media: number | undefined };

	ended?: number; // local

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

	/** An agent time on the local clock, once the offset is known. */
	local(agent: number): number | undefined {
		const offset = this.offset;
		return offset === undefined ? undefined : agent - offset;
	}

	/** How much later than the fastest a request frame reached the agent. */
	upLateness(frame: MicFrame): number {
		return frame.arrive - frame.capture - (this.minUp ?? 0);
	}

	/** How much later than the fastest a reply frame reached us, once its publish is known. */
	downLateness(frame: ReplyFrame): number | undefined {
		if (frame.published === undefined) return undefined;
		return frame.arrive - frame.published - (this.minDown ?? 0);
	}

	/** Ingest one `voice.json` record. */
	agent(record: AgentRecord) {
		if (record.version !== 2) return;
		switch (record.type) {
			case "arrival": {
				const capture = ms(record, "media_ticks");
				const arrive = agentMs(record, "arrival_ns");
				if (capture === undefined || arrive === undefined) return;
				insert(this.mic, { capture, arrive }, (f) => f.capture);
				const up = arrive - capture;
				if (this.minUp === undefined || up < this.minUp) this.minUp = up;
				return;
			}
			case "word": {
				const word = this.#word(record);
				if (!word) return;
				if (record.speaker === "user") {
					insert(this.userWords, word, (w) => w.start);
					// The final word supersedes what the interims heard there.
					this.interims = this.interims.filter((i) => i.end <= word.start || i.start >= word.end);
				} else if (record.speaker === "agent") {
					insert(this.agentWords, word, (w) => w.start);
				}
				return;
			}
			case "interim": {
				const word = this.#word(record);
				if (!word) return;
				// A later interim revises the ones it overlaps.
				this.interims = this.interims.filter((i) => i.end <= word.start || i.start >= word.end);
				if (!this.userWords.some((w) => w.start < word.end && w.end > word.start)) {
					insert(this.interims, word, (w) => w.start);
				}
				return;
			}
			case "vad": {
				const at = agentMs(record, "at_ns");
				const media = ms(record, "media_ticks");
				const confirm = ms(record, "confirm_ticks") ?? 0;
				if (at === undefined || media === undefined) return;
				const speaking = record.speaking === true;
				const change = media - confirm;
				const open = this.speech.at(-1);
				if (speaking && (!open || open.end !== undefined)) this.speech.push({ start: change });
				if (!speaking && open && open.end === undefined) open.end = change;
				this.marks.push({ at, kind: "vad", label: speaking ? "speech" : "silence", media });
				return;
			}
			case "turn": {
				const at = agentMs(record, "at_ns");
				if (at === undefined) return;
				const media = ms(record, "media_ticks");
				this.marks.push({ at, kind: "turn", label: record.speaking === true ? "your turn" : "my turn", media });
				return;
			}
			case "llm":
			case "tts": {
				const at = agentMs(record, "at_ns");
				if (at === undefined) return;
				this.#span(record.type, record.event, at);
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
				const at = agentMs(record, "at_ns");
				const unplayed = ms(record, "unplayed_ticks");
				if (at === undefined) return;
				const label = unplayed ? `barge-in, dropped ${(unplayed / 1000).toFixed(1)}s` : "barge-in";
				this.marks.push({ at, kind: "retire", label });
				// What the retired track still held never plays; draw it where it would have.
				if (typeof record.track !== "string") return;
				const now = this.local(at) ?? performance.now();
				this.#retired.set(record.track, now);
				for (const frame of this.reply) {
					if (frame.track === record.track) this.#discard(frame, now);
				}
				return;
			}
		}
	}

	#word(record: AgentRecord): Word | undefined {
		const start = ms(record, "start_ticks");
		const end = ms(record, "end_ticks");
		if (typeof record.text !== "string" || start === undefined || end === undefined) return undefined;
		const track = typeof record.track === "string" ? record.track : undefined;
		return { text: record.text, start, end, at: agentMs(record, "at_ns"), track };
	}

	#span(kind: "llm" | "tts", event: unknown, at: number) {
		const open = this.spans.findLast((s) => s.kind === kind && s.end === undefined);
		if (event === "request") {
			// TTS requests each sentence; one span covers the whole reply until it ends. Each LLM request
			// is a new statement, and supersedes one an interruption left without an end.
			if (open && kind === "llm") open.end = at;
			if (!open || kind === "llm") this.spans.push({ kind, start: at });
		} else if (event === "first_text" || event === "first_audio") {
			if (open && open.first === undefined) open.first = at;
		} else if (event === "end") {
			if (open) open.end = at;
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
		if (frame.track !== undefined && frame.track !== publish.track && frame.discarded) {
			frame.discarded = false;
			frame.play = undefined;
		}
		frame.track = publish.track;
		frame.published = publish.at;
		// Between overlapping publishes the pick is only as good as the clock, and the wrong one could
		// undercut the fastest transit, so only a frame one publish alone holds measures it.
		const down = frame.arrive - publish.at;
		const holders = this.publishes.filter((p) => frame.media >= p.start && frame.media < p.end).length;
		if (holders === 1 && (this.minDown === undefined || down < this.minDown)) this.minDown = down;
		const retired = this.#retired.get(publish.track);
		if (retired !== undefined) this.#discard(frame, retired);
	}

	/** What a retired track still held never plays; draw it where it would have. */
	#discard(frame: ReplyFrame, retired: number) {
		if (frame.play !== undefined) return;
		// Before any playhead there is nowhere it would have played, so it ends where it was retired.
		frame.play = this.playAt(frame, retired) ?? retired;
		frame.discarded = true;
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

	/** The reply's playhead: media `media` is playing at local time `now`, or nothing is. */
	playhead(now: number, media: number | undefined, playing: boolean) {
		// The reply's media time only moves forward, across track changes too; an idle player
		// reports zero.
		if (media === undefined || (this.#anchor && media < this.#anchor.media)) {
			this.#playing = false;
			return;
		}
		this.#playing = playing;
		this.#anchor = { local: now, media };
		for (const frame of this.reply) {
			if (frame.play === undefined && frame.media <= media) frame.play = now - (media - frame.media);
		}
	}

	/** When a reply frame plays (or played) on the local clock, if it can be placed. */
	playAt(frame: ReplyFrame, now: number): number | undefined {
		if (frame.play !== undefined) return frame.play;
		const head = this.mediaNow(now);
		return head === undefined ? undefined : now + Math.max(0, frame.media - head);
	}

	/** Media time of the reply's playhead now, extrapolated between updates. */
	mediaNow(now: number): number | undefined {
		if (this.#head?.now === now) return this.#head.media;
		const anchor = this.#anchor;
		let media: number | undefined;
		if (anchor && this.#playing) {
			media = anchor.media + (now - anchor.local);
		} else {
			// A stalled player starts the next utterance from its own first frame, about now.
			const next = this.reply.find((f) => f.play === undefined && !f.discarded);
			media = next ? Math.max(next.media, anchor?.media ?? 0) : anchor?.media;
		}
		this.#head = { now, media };
		return media;
	}

	/**
	 * Where the latest exchange starts on the local clock: your latest statement or the agent's
	 * latest reply, whichever began first, as `voice.json` keeps the latest statement on each side.
	 */
	exchange(): number | undefined {
		// The turn is decided a little into the statement, so it starts with the speech before it.
		const heard = this.marks.findLast((m) => m.kind === "turn" && m.label === "your turn")?.media;
		const said = heard === undefined ? undefined : (this.speech.findLast((s) => s.start <= heard)?.start ?? heard);
		const thought = this.spans.findLast((s) => s.kind === "llm");
		const replied = thought && this.local(thought.start);
		if (said === undefined) return replied;
		return replied === undefined ? said : Math.min(said, replied);
	}

	/** Drop what has scrolled far out of view. */
	prune(now: number) {
		const cut = now - KEEP_MS;
		const offset = this.offset ?? 0;
		this.mic = this.mic.filter((f) => f.capture >= cut);
		this.userWords = this.userWords.filter((w) => w.end >= cut);
		this.interims = this.interims.filter((w) => w.end >= cut);
		this.speech = this.speech.filter((s) => s.end === undefined || s.end >= cut);
		this.marks = this.marks.filter((m) => m.at - offset >= cut);
		this.spans = this.spans.filter((s) => s.end === undefined || s.end - offset >= cut);
		this.reply = this.reply.filter((f) => f.play === undefined || f.play >= cut);
		const media = this.mediaNow(now);
		if (media !== undefined) {
			const mediaCut = media - KEEP_MS;
			this.agentWords = this.agentWords.filter((w) => w.end >= mediaCut);
			this.publishes = this.publishes.filter((p) => p.end >= mediaCut);
			this.gaps = this.gaps.filter((g) => g.media + g.duration >= mediaCut);
		}
	}
}
