// Talk to moq.pro's Pipecat demo agent over MoQ. moq.pro's app/src/lib/VoiceDemo.svelte is the
// reference for the session flow and @pipecat-ai/moq-transport for the wire. This skips the
// Pipecat client: <moq-publish> sends the mic, <moq-watch> plays the reply, and the page speaks
// the slice of RTVI the agent needs over a `transcript.json.z` side track in each direction.
import * as Json from "@moq/json";
import { Clock, Net, Signals } from "@moq/publish";
import "@moq/publish/element";
import type MoqPublish from "@moq/publish/element";
import "@moq/watch/element";
import type MoqWatch from "@moq/watch/element";
import { createEffect, createSignal, For, Index, onCleanup, Show } from "solid-js";
import { type AgentRecord, CallLog } from "./voice/call";
import Cat from "./voice/cat";
import Timeline from "./voice/timeline";

type Turnstile = {
	render: (
		container: HTMLElement,
		options: {
			sitekey: string;
			theme: "dark";
			size: "flexible";
			callback: (token: string) => void;
			"error-callback": () => void;
			"expired-callback": () => void;
		},
	) => string;
	remove: (widgetId: string) => void;
};

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

// POST /voice/sessions (moq.pro api/src/voicedemo.ts).
type Session = {
	id: string;
	relayUrl: string;
	requestBroadcast: string;
	responseBroadcast: string;
	token: string;
	expiresAt: number;
	maxDurationSecs: number;
	maxWaitSecs: number;
};

// An RTVI message as it travels on a transcript track. A reconnect on either side replays the
// whole log, so each side numbers its records (`seq`, per publisher `epoch`) and the reader drops
// what it has already seen.
type Message = {
	label: string;
	type: string;
	id?: string;
	data?: Record<string, unknown>;
	seq?: number;
	epoch?: string;
};

const API_URL = import.meta.env.PUBLIC_VOICE_API_URL;
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// The agent subscribes to this fixed-name track on our broadcast and publishes its own beside
// its audio. Neither is in the catalog.
const RTVI_TRACK = "transcript.json.z";
// The agent's own measurements of the call (moq.pro agent/VOICE.md), a window of records.
const TIMELINE_TRACK = "voice.json";
const RTVI_VERSION = "2.1.0";

// How often a caller waiting for pickup asks whether an edge refused it.
const POLL_MS = 2_000;

// A hangup this close to the limit is the limit: the agent stops at its own claim time, which
// lands a little before our pickup.
const LIMIT_SLACK_SECS = 15;

// Closing the connection drops whatever has not reached the wire, so the goodbye gets a moment
// first, the same as @pipecat-ai/moq-transport.
const GOODBYE_MS = 250;

// The API's refusal codes plus the ones only the page can see. Copy comes from here, never from
// the API's error string.
type Outcome =
	| "disabled"
	| "unavailable"
	| "challenge"
	| "rate_limit"
	| "busy"
	| "daily_budget"
	| "unsupported"
	| "microphone"
	| "no_microphone"
	| "no_pickup"
	| "dropped"
	| "time_up";

const OUTCOMES: Record<Outcome, string> = {
	disabled: "The demo is switched off right now.",
	unavailable: "The demo is broken on our end. Try again in a bit.",
	challenge: "The bot check didn't pass. Try again.",
	rate_limit: "You already have a call going, maybe in another tab. It frees up within five minutes.",
	busy: "Every line is busy. Try again in a few minutes.",
	daily_budget: "We're out of AI minutes for today. Come back tomorrow (UTC).",
	unsupported: "This browser can't run the demo. Try a current Chrome, Safari, or Firefox.",
	microphone: "No microphone access. Allow it in your browser's site settings, then try again.",
	no_microphone: "No microphone found. Plug one in and try again.",
	no_pickup: "Nobody picked up. Try again in a minute.",
	dropped: "The call dropped. Try again.",
	time_up: "Five minutes is up. That's the demo.",
};

const REFUSALS = new Set<string>(["disabled", "unavailable", "challenge", "rate_limit", "busy", "daily_budget"]);

type Phase = "idle" | "checking" | "challenge" | "admitting" | "connecting" | "live";

// A run of speech by one side. `interim` is your words the recognizer may still revise.
type Turn = { who: "you" | "ai"; text: string; interim: string };

// Everything one call holds, so teardown is one place.
type Call = {
	gen: number;
	session: Session;
	timers: ReturnType<typeof setTimeout>[];
	ticker?: ReturnType<typeof setInterval>;
	liveAt?: number;
	epoch: string;
	messages: Message[];
	producer?: Json.Stream.Producer<Message>;
	log: CallLog;
};

let turnstilePromise: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	turnstilePromise ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = TURNSTILE_SCRIPT;
		script.async = true;
		script.addEventListener(
			"load",
			() => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile has no browser API."))),
			{ once: true },
		);
		script.addEventListener(
			"error",
			() => {
				turnstilePromise = undefined;
				script.remove();
				reject(new Error("Turnstile failed to load."));
			},
			{ once: true },
		);
		document.head.append(script);
	});
	return turnstilePromise;
}

// Opus falls back to a WASM polyfill and the relay to WebSocket, so the hard requirements are a
// secure context, capture, and an audio worklet.
function supported(): boolean {
	return (
		window.isSecureContext &&
		typeof navigator.mediaDevices?.getUserMedia === "function" &&
		typeof AudioWorkletNode !== "undefined" &&
		typeof WebAssembly !== "undefined"
	);
}

// Ask before admission: a reservation taken for a caller who then refuses the prompt would hold
// their address for the whole pickup window.
async function probeMicrophone(): Promise<Outcome | undefined> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		for (const track of stream.getTracks()) track.stop();
		return undefined;
	} catch (err) {
		const name = err instanceof DOMException ? err.name : "";
		return name === "NotFoundError" || name === "OverconstrainedError" ? "no_microphone" : "microphone";
	}
}

function refusal(body: unknown): Outcome {
	const code = (body as { code?: unknown } | undefined)?.code;
	return typeof code === "string" && REFUSALS.has(code) ? (code as Outcome) : "unavailable";
}

function words(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

function clock(secs: number): string {
	return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export default function VoiceDemo() {
	const [phase, setPhase] = createSignal<Phase>("idle");
	const [outcome, setOutcome] = createSignal<Outcome>();
	// Mounts the publisher and player; it outlives `current` by the goodbye.
	const [mounted, setMounted] = createSignal<Call>();
	const [remaining, setRemaining] = createSignal<number>();
	const [transcript, setTranscript] = createSignal<Turn[]>([]);
	// The agent's decoded audio, before volume, for the cat to lip-sync to.
	const [voice, setVoice] = createSignal<AudioNode>();
	// The last call's measurements, kept after it ends so the reader can look them over.
	const [timeline, setTimeline] = createSignal<CallLog>();

	// Bumped by every start and teardown, so an await that resumes after Stop sees it is stale
	// and backs out instead of resurrecting the call.
	let generation = 0;
	let current: Call | undefined;
	let widget: { api: Turnstile; id: string } | undefined;
	let turnstileContainer!: HTMLDivElement;

	// The transcript follows new words unless the reader has scrolled up to reread.
	let transcriptList: HTMLOListElement | undefined;
	let following = true;
	createEffect(() => {
		transcript();
		if (transcriptList && following) transcriptList.scrollTop = transcriptList.scrollHeight;
	});

	const removeWidget = () => {
		widget?.api.remove(widget.id);
		widget = undefined;
	};

	const send = (call: Call, message: Message) => {
		const record = { ...message, seq: call.messages.length, epoch: call.epoch };
		call.messages.push(record);
		call.producer?.append({ value: record });
	};

	// Tear the call down and show why. `undefined` is the reader's own Stop.
	const finish = (gen: number, why: Outcome | undefined) => {
		if (gen !== generation) return;
		generation += 1;
		removeWidget();
		const call = current;
		current = undefined;
		if (call) {
			for (const timer of call.timers) clearTimeout(timer);
			clearInterval(call.ticker);
			call.log.ended = performance.now();
			// The agent hangs up at once on this, instead of waiting for us to redial.
			send(call, { label: "moq-transport", type: "session-ending" });
			const unmount = () => setMounted((m) => (m === call ? undefined : m));
			if (call.producer) setTimeout(unmount, GOODBYE_MS);
			else unmount();
		}
		setRemaining(undefined);
		setOutcome(why);
		setPhase("idle");
	};

	const stop = () => finish(generation, undefined);
	onCleanup(stop);

	const start = async () => {
		if (phase() !== "idle") return;
		const gen = ++generation;
		setOutcome(undefined);
		setTranscript([]);
		setPhase("checking");

		if (!API_URL || !SITE_KEY) return finish(gen, "disabled");
		if (!supported()) return finish(gen, "unsupported");
		const mic = await probeMicrophone();
		if (gen !== generation) return;
		if (mic) return finish(gen, mic);

		setPhase("challenge");
		let api: Turnstile;
		try {
			api = await loadTurnstile();
		} catch {
			return finish(gen, "challenge");
		}
		if (gen !== generation) return;
		const id = api.render(turnstileContainer, {
			sitekey: SITE_KEY,
			theme: "dark",
			size: "flexible",
			callback: (token) => {
				removeWidget();
				void admit(gen, token);
			},
			"error-callback": () => finish(gen, "challenge"),
			"expired-callback": () => finish(gen, "challenge"),
		});
		widget = { api, id };
	};

	const admit = async (gen: number, turnstileToken: string) => {
		if (gen !== generation) return;
		setPhase("admitting");
		let session: Session;
		try {
			const res = await fetch(new URL("/voice/sessions", API_URL), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ turnstileToken }),
			});
			if (gen !== generation) return;
			if (!res.ok) return finish(gen, refusal(await res.json().catch(() => undefined)));
			session = await res.json();
		} catch {
			return finish(gen, "unavailable");
		}
		if (gen !== generation) return;
		// Dialing without credentials would only wait out the pickup deadline.
		if (!session.id || !session.token || !session.relayUrl) return finish(gen, "unavailable");

		const epoch = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join(
			"",
		);
		const call: Call = { gen, session, timers: [], epoch, messages: [], log: new CallLog() };
		setTimeline(call.log);
		current = call;
		// Queued until the publisher's broadcast exists, so the agent reads it first.
		send(call, {
			label: "rtvi-ai",
			type: "client-ready",
			id: crypto.randomUUID(),
			data: { version: RTVI_VERSION, about: { library: "moq.dev" } },
		});

		setPhase("connecting");
		setMounted(call);
		// Admitted is not answered: an edge still has to claim the session.
		call.timers.push(setTimeout(() => finish(gen, "no_pickup"), session.maxWaitSecs * 1000));
		poll(call);
	};

	// Ask the ledger about the session until an edge claims it. An edge at its session cap
	// refuses after we publish, and nothing on the relay says so.
	const poll = (call: Call) => {
		const next = () => call.timers.push(setTimeout(check, POLL_MS));
		const check = async () => {
			if (call.gen !== generation || call.liveAt !== undefined) return;
			let res: Response;
			let body: { state?: unknown; code?: unknown } | undefined;
			try {
				res = await fetch(new URL(`/voice/sessions/${call.session.id}`, API_URL));
				body = await res.json().catch(() => undefined);
			} catch {
				// A network blip is not a refusal. The pickup deadline still runs.
				return next();
			}
			if (call.gen !== generation || call.liveAt !== undefined) return;
			if (res.status === 503 && body?.code === "busy") return finish(call.gen, "busy");
			if (res.ok && body?.state === "claimed") return;
			if (res.ok && body?.state === "ended") return finish(call.gen, "no_pickup");
			if (res.ok || res.status === 429 || res.status >= 500) return next();
			finish(call.gen, "unavailable");
		};
		next();
	};

	// The agent's broadcast appearing is the pickup we can hear.
	const onPickup = (call: Call) => {
		if (call.gen !== generation || call.liveAt !== undefined) return;
		const max = call.session.maxDurationSecs;
		for (const timer of call.timers) clearTimeout(timer);
		call.timers = [setTimeout(() => finish(call.gen, "time_up"), max * 1000)];
		const liveAt = performance.now();
		call.liveAt = liveAt;
		setRemaining(max);
		call.ticker = setInterval(() => {
			setRemaining(Math.max(0, Math.ceil(max - (performance.now() - liveAt) / 1000)));
		}, 1000);
		setPhase("live");
	};

	const hangup = (call: Call) => {
		if (call.liveAt === undefined) return finish(call.gen, "dropped");
		const elapsed = (performance.now() - call.liveAt) / 1000;
		finish(call.gen, elapsed >= call.session.maxDurationSecs - LIMIT_SLACK_SECS ? "time_up" : "dropped");
	};

	// Your interim transcripts replace each other until the final one lands; consecutive text
	// from one side joins its current turn.
	const say = (who: Turn["who"], text: string, final: boolean) => {
		setTranscript((turns) => {
			const last = turns.at(-1);
			const turn = last?.who === who ? last : { who, text: "", interim: "" };
			const next = final ? { who, text: `${turn.text} ${text}`.trim(), interim: "" } : { ...turn, interim: text };
			return last === turn ? [...turns.slice(0, -1), next] : [...turns, next];
		});
	};

	const onMessage = (call: Call, el: MoqWatch, segments: Set<unknown>, { label, type, data }: Message) => {
		if (call.gen !== generation) return;
		if (label === "moq-transport") {
			if (type === "session-ending") hangup(call);
			return;
		}
		const text = data?.text;
		switch (type) {
			case "user-started-speaking":
				// Barge-in: drop the reply already buffered ahead instead of letting it drain.
				el.reset();
				break;
			case "user-transcription":
				if (typeof text === "string") say("you", text, data?.final === true);
				break;
			case "bot-output":
				// RTVI 2.x repeats a sentence as it is spoken, under one segment_id.
				if (typeof text === "string" && !segments.has(data?.segment_id)) {
					segments.add(data?.segment_id);
					say("ai", text, true);
				}
				break;
			case "error":
				// A provider fell over mid-call.
				if (data?.fatal === true) finish(call.gen, "dropped");
				break;
		}
	};

	// Our side of RTVI. The broadcast is rebuilt on every reconnect, so each one replays the log.
	const bindPublish = (effects: Signals.Effect, el: MoqPublish, call: Call) => {
		effects.run((effect) => {
			const broadcast = effect.get(el.broadcast.net);
			if (!broadcast) return;
			const producer = new Json.Stream.Producer<Message>({
				track: broadcast.createTrack(RTVI_TRACK),
				compression: "deflate",
			});
			for (const record of call.messages) producer.append({ value: record });
			call.producer = producer;
			effect.cleanup(() => {
				if (call.producer === producer) call.producer = undefined;
				producer.finish();
			});
		});
	};

	const bindWatch = (effects: Signals.Effect, el: MoqWatch, call: Call) => {
		const seen = { epoch: undefined as string | undefined, seq: -1 };
		const segments = new Set<unknown>();
		effects.run((effect) => {
			const root = effect.get(el.audio.out.root);
			if (!root) return;
			setVoice(root);
			effect.cleanup(() => setVoice((v) => (v === root ? undefined : v)));
		});
		effects.run((effect) => {
			const media = effect.get(el.audio.out.timestamp);
			const playing = !effect.get(el.audio.out.stalled);
			call.log.playhead(performance.now(), media, playing);
		});
		// The decoder reports a frame only once playback nears it, so a reply streamed ahead shows up
		// here first: the frames are already in the buffer.
		effects.run((effect) => {
			call.log.buffer(effect.get(el.audio.out.buffered));
		});
		effects.spawn(async () => {
			const arrivals = el.audio.arrivals();
			effects.cleanup(() => arrivals.close());
			for (;;) {
				const next = await arrivals.next();
				if (!next) return;
				if (next.kind === "frame") call.log.received(next.timestamp, next.arrival, next.late);
				else call.log.gap(next.timestamp, next.duration);
			}
		});
		effects.run((effect) => {
			const active = effect.get(el.broadcast.out.active);
			if (!active) return;
			onPickup(call);

			const timeline = active.track(TIMELINE_TRACK).subscribe();
			effect.cleanup(() => timeline.close());
			const records = new Json.Window.Consumer<AgentRecord>({ track: timeline });
			effect.spawn(async () => {
				for await (const { value } of records) {
					if ("push" in value) call.log.agent(value.push.value);
				}
			});

			const track = active.track(RTVI_TRACK).subscribe();
			effect.cleanup(() => track.close());
			const consumer = new Json.Stream.Consumer<Message>({ track, compression: "deflate" });
			effect.spawn(async () => {
				for await (const {
					value: { seq, epoch, ...message },
				} of consumer) {
					if (typeof seq === "number") {
						if (epoch !== seen.epoch) Object.assign(seen, { epoch, seq: -1 });
						if (seq <= seen.seq) continue;
						seen.seq = seq;
					}
					onMessage(call, el, segments, message);
				}
			});
		});
	};

	const status = () => {
		switch (phase()) {
			case "checking":
				return "Asking for your microphone...";
			case "challenge":
				return "Checking you're not a bot...";
			case "admitting":
				return "Getting a line...";
			case "connecting":
				return "Waiting for the agent to pick up...";
			case "live":
				return "Live. Talk normally, and interrupt whenever.";
			default:
				return undefined;
		}
	};

	return (
		<div class="not-prose my-8 rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-xl sm:p-6">
			<Cat voice={voice()} class="mx-auto mb-5 block h-40 w-40" />
			<div class="flex flex-wrap items-center gap-3">
				<Show
					when={phase() !== "idle"}
					fallback={
						<button
							type="button"
							onClick={start}
							class="rounded-lg bg-green-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-green-400"
						>
							Start talking
						</button>
					}
				>
					<button
						type="button"
						onClick={stop}
						class="rounded-lg border border-slate-600 px-5 py-3 font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
					>
						Stop
					</button>
				</Show>
				<p class="m-0 text-sm text-slate-400" role="status" aria-live="polite">
					<Show
						when={status()}
						fallback={
							<Show when={outcome()} fallback="Five minutes, English, shared preview capacity. Needs your microphone.">
								{(why) => (
									<span class={why() === "time_up" ? "text-slate-300" : "text-amber-300"}>{OUTCOMES[why()]}</span>
								)}
							</Show>
						}
					>
						{status()}
					</Show>
				</p>
				<Show when={phase() === "live" && remaining() !== undefined}>
					<span class="ml-auto font-mono text-xs text-slate-500" role="timer" aria-label="Time left">
						{clock(remaining() ?? 0)}
					</span>
				</Show>
			</div>

			<div ref={turnstileContainer} classList={{ "mt-4": phase() === "challenge" }} />

			<Show when={transcript().length > 0}>
				<ol
					ref={(el) => {
						transcriptList = el;
						following = true;
					}}
					onScroll={(e) => {
						const el = e.currentTarget;
						following = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
					}}
					class="mt-4 mb-0 max-h-80 list-none space-y-3 overflow-y-auto p-0"
					aria-label="Transcript"
				>
					<For each={transcript()}>
						{(turn) => (
							<li class="flex gap-3">
								<span class="w-8 shrink-0 pt-0.5 text-right font-mono text-xs text-slate-500">
									{turn.who === "ai" ? "AI" : "you"}
								</span>
								<p class="m-0 flex flex-wrap gap-x-1.5 font-bold">
									<Index each={words(turn.text)}>
										{(word) => <span class={turn.who === "ai" ? "text-green-400" : "text-slate-100"}>{word()}</span>}
									</Index>
									<Index each={words(turn.interim)}>{(word) => <span class="text-slate-500">{word()}</span>}</Index>
								</p>
							</li>
						)}
					</For>
				</ol>
			</Show>

			<Show when={timeline()} keyed>
				{(log) => <Timeline call={log} />}
			</Show>

			<Show when={mounted()} keyed>
				{(call) => {
					const effects = new Signals.Effect();
					onCleanup(() => effects.close());
					const url = new URL(call.session.relayUrl);
					url.searchParams.set("jwt", call.session.token);
					return (
						<>
							<moq-publish
								ref={(el: MoqPublish) => bindPublish(effects, el, call)}
								class="hidden"
								prop:url={url}
								prop:name={Net.Path.from(call.session.requestBroadcast)}
								prop:source="camera"
								prop:invisible={true}
							/>
							<moq-watch
								ref={(el: MoqWatch) => bindWatch(effects, el, call)}
								class="hidden"
								prop:url={url}
								prop:name={Net.Path.from(call.session.responseBroadcast)}
								prop:volume={1}
								prop:delay={Clock.Milli(100)}
								// The agent sends its reply up to ~25s ahead of real time; holding less drops it.
								prop:buffer={Clock.Milli(30_000)}
							/>
						</>
					);
				}}
			</Show>

			<p class="mt-4 mb-0 text-xs text-slate-500">
				Your audio goes to Deepgram, OpenAI, and Cartesia for the call. We don't keep it.{" "}
				<a href="https://moq.pro/privacy" class="underline hover:text-slate-300">
					Privacy
				</a>
			</p>
		</div>
	);
}
