// Talk to moq.pro's Pipecat demo agent over MoQ. moq.pro's own client
// (app/src/lib/VoiceDemo.svelte) is the reference for the session flow; this one
// skips the Pipecat client and uses <moq-publish>/<moq-watch> directly, speaking
// only the slice of RTVI the agent needs over its `transcript.json.z` side track.
import * as Json from "@moq/json";
import { Net, Signals } from "@moq/publish";
import "@moq/publish/element";
import "@moq/publish/support/element";
import type MoqPublish from "@moq/publish/element";
import "@moq/watch/element";
import "@moq/watch/support/element";
import type MoqWatch from "@moq/watch/element";
import { createSignal, For, onCleanup, Show } from "solid-js";

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

type RtviMessage = {
	label: "rtvi-ai";
	type: string;
	id: string;
	data?: Record<string, unknown>;
};

const API_URL = import.meta.env.PUBLIC_VOICE_API_URL;
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// The agent subscribes to this fixed-name track on our broadcast and publishes
// its own beside its audio. Neither is in the catalog. It errors on a rejected
// subscription, so ours has to exist even though the agent never waits on it.
const RTVI_TRACK = "transcript.json.z";
const RTVI_VERSION = "2.1.0";

// How often a caller waiting for pickup asks whether an edge refused it.
const POLL_MS = 2_000;

// The API's refusal codes plus the ones only the page can see. Copy comes from
// here, never from the API's error string.
type Outcome =
	| "disabled"
	| "unavailable"
	| "challenge"
	| "rate_limit"
	| "busy"
	| "daily_budget"
	| "unsupported"
	| "microphone"
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
	no_pickup: "Nobody picked up. Try again in a minute.",
	dropped: "The call dropped. Try again.",
	time_up: "Five minutes is up. That's the demo.",
};

const REFUSALS = new Set<string>(["disabled", "unavailable", "challenge", "rate_limit", "busy", "daily_budget"]);

type Phase = "idle" | "checking" | "challenge" | "admitting" | "connecting" | "live";

type Line = { role: "you" | "bot"; text: string; final: boolean };

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
		script.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
		document.head.append(script);
	});
	return turnstilePromise;
}

// Ask before admission: a reservation taken for a caller who then refuses the
// prompt would hold their address for the whole pickup window.
async function probeMicrophone(): Promise<boolean> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		for (const track of stream.getTracks()) track.stop();
		return true;
	} catch {
		return false;
	}
}

function refusal(body: unknown): Outcome {
	const code = (body as { code?: unknown } | undefined)?.code;
	return typeof code === "string" && REFUSALS.has(code) ? (code as Outcome) : "unavailable";
}

function clock(secs: number): string {
	return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export default function VoiceDemo() {
	const [phase, setPhase] = createSignal<Phase>("idle");
	const [outcome, setOutcome] = createSignal<Outcome>();
	const [session, setSession] = createSignal<Session>();
	const [remaining, setRemaining] = createSignal<number>();
	const [transcript, setTranscript] = createSignal<Line[]>([]);

	// Bumped by every start and teardown, so an await that resumes after Stop
	// sees it is stale and backs out instead of resurrecting the call.
	let generation = 0;
	let timers: ReturnType<typeof setTimeout>[] = [];
	let ticker: ReturnType<typeof setInterval> | undefined;
	let liveAt: number | undefined;
	let widget: { api: Turnstile; id: string } | undefined;
	let turnstileContainer!: HTMLDivElement;

	const removeWidget = () => {
		widget?.api.remove(widget.id);
		widget = undefined;
	};

	// Tear the call down and show why. `undefined` is the reader's own Stop.
	const finish = (gen: number, why: Outcome | undefined) => {
		if (gen !== generation) return;
		generation += 1;
		for (const timer of timers) clearTimeout(timer);
		timers = [];
		clearInterval(ticker);
		ticker = undefined;
		liveAt = undefined;
		removeWidget();
		setSession(undefined);
		setRemaining(undefined);
		setTranscript([]);
		setOutcome(why);
		setPhase("idle");
	};

	const stop = () => finish(generation, undefined);
	onCleanup(stop);

	const start = async () => {
		if (phase() !== "idle") return;
		const gen = ++generation;
		setOutcome(undefined);
		setPhase("checking");

		if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== "function") {
			return finish(gen, "unsupported");
		}
		const mic = await probeMicrophone();
		if (gen !== generation) return;
		if (!mic) return finish(gen, "microphone");

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
		let admitted: Session;
		try {
			const res = await fetch(new URL("/voice/sessions", API_URL), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ turnstileToken }),
			});
			if (gen !== generation) return;
			if (!res.ok) return finish(gen, refusal(await res.json().catch(() => undefined)));
			admitted = await res.json();
		} catch {
			return finish(gen, "unavailable");
		}
		if (gen !== generation) return;

		setPhase("connecting");
		setSession(admitted);
		// Admitted is not answered: an edge still has to claim the session.
		timers.push(setTimeout(() => finish(gen, "no_pickup"), admitted.maxWaitSecs * 1000));
		poll(gen, admitted.id);
	};

	// Ask the ledger about the session until an edge claims it. An edge at its
	// session cap refuses after we publish, and nothing on the relay says so.
	const poll = (gen: number, id: string) => {
		const next = () => timers.push(setTimeout(check, POLL_MS));
		const check = async () => {
			if (gen !== generation || liveAt !== undefined) return;
			let res: Response;
			let body: { state?: unknown; code?: unknown } | undefined;
			try {
				res = await fetch(new URL(`/voice/sessions/${id}`, API_URL));
				body = await res.json().catch(() => undefined);
			} catch {
				// A network blip is not a refusal. The pickup deadline still runs.
				return next();
			}
			if (gen !== generation || liveAt !== undefined) return;
			if (res.status === 503 && body?.code === "busy") return finish(gen, "busy");
			if (res.ok && body?.state === "claimed") return;
			if (res.ok && body?.state === "ended") return finish(gen, "no_pickup");
			next();
		};
		next();
	};

	// The agent's broadcast appearing is the pickup we can hear; it going away
	// is the agent hanging up, at the time limit or because something broke.
	const onLive = (gen: number, admitted: Session) => {
		if (gen !== generation || liveAt !== undefined) return;
		for (const timer of timers) clearTimeout(timer);
		timers = [setTimeout(() => finish(gen, "time_up"), admitted.maxDurationSecs * 1000)];
		liveAt = performance.now();
		setRemaining(admitted.maxDurationSecs);
		ticker = setInterval(() => {
			if (liveAt === undefined) return;
			const elapsed = (performance.now() - liveAt) / 1000;
			setRemaining(Math.max(0, Math.ceil(admitted.maxDurationSecs - elapsed)));
		}, 1000);
		setPhase("live");
	};

	const onHangup = (gen: number, admitted: Session) => {
		if (liveAt === undefined) return;
		const elapsed = (performance.now() - liveAt) / 1000;
		// The host stops at its own claim time, a little before our pickup.
		finish(gen, elapsed >= admitted.maxDurationSecs - 15 ? "time_up" : "dropped");
	};

	// Interim user transcripts replace themselves until the final one lands; bot
	// sentences join the bot's current turn.
	const addLine = (role: Line["role"], text: string, final: boolean) => {
		setTranscript((lines) => {
			const last = lines.at(-1);
			if (last && last.role === role && !last.final) return [...lines.slice(0, -1), { role, text, final }];
			if (last && last.role === "bot" && role === "bot") {
				return [...lines.slice(0, -1), { role, text: `${last.text} ${text}`, final: true }];
			}
			return [...lines, { role, text, final }];
		});
	};

	const onMessage = (gen: number, { type, data }: RtviMessage) => {
		const text = data?.text;
		if (gen !== generation || typeof text !== "string") return;
		if (type === "user-transcription") addLine("you", text, data?.final === true);
		// Word-level events repeat the sentence that follows them.
		if (type === "bot-output" && data?.aggregated_by !== "word") addLine("bot", text, true);
	};

	// Our side of RTVI: announce the client the moment the broadcast exists, so
	// the track is there before the agent's subscription arrives.
	const bindPublish = (effects: Signals.Effect, el: MoqPublish) => {
		effects.run((effect) => {
			const broadcast = effect.get(el.broadcast.net);
			if (!broadcast) return;
			const producer = new Json.Stream.Producer<RtviMessage>(broadcast.createTrack(RTVI_TRACK), {
				compression: true,
			});
			producer.append({
				label: "rtvi-ai",
				type: "client-ready",
				id: crypto.randomUUID(),
				data: { version: RTVI_VERSION, about: { library: "moq.dev" } },
			});
			effect.cleanup(() => producer.finish());
		});
	};

	const bindWatch = (effects: Signals.Effect, el: MoqWatch, gen: number, admitted: Session) => {
		let seen = false;
		effects.run((effect) => {
			const active = effect.get(el.broadcast.out.active);
			if (!active) {
				if (seen) onHangup(gen, admitted);
				return;
			}
			seen = true;
			onLive(gen, admitted);

			const track = active.subscribe(RTVI_TRACK);
			effect.cleanup(() => track.close());
			const consumer = new Json.Stream.Consumer<RtviMessage>(track, { compression: true });
			effect.spawn(async () => {
				for await (const message of consumer) onMessage(gen, message);
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
				return "Live. Speak normally, and interrupt whenever.";
			default:
				return undefined;
		}
	};

	return (
		<div class="not-prose my-8 rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-xl sm:p-6">
			<div class="mb-4 flex items-start justify-between gap-4">
				<div>
					<p class="m-0 text-lg font-bold text-white">Talk to a Voice AI over MoQ</p>
					<p class="mt-1 mb-0 text-sm text-slate-400">
						Five minutes, English, shared preview capacity. Needs your microphone.
					</p>
				</div>
				<Show when={phase() === "live"}>
					<span class="mt-1 inline-flex items-center gap-2 rounded-full bg-green-950 px-3 py-1 text-xs font-semibold text-green-300">
						<span class="h-2 w-2 animate-pulse rounded-full bg-green-400" /> Live
						<Show when={remaining() !== undefined}>
							<span class="font-mono text-green-400/80">{clock(remaining() ?? 0)}</span>
						</Show>
					</span>
				</Show>
			</div>

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
					<Show when={status()} fallback={<span class="text-amber-300">{OUTCOMES[outcome() as Outcome]}</span>}>
						{status()}
					</Show>
				</p>
			</div>

			<div ref={turnstileContainer} classList={{ "mt-4": phase() === "challenge" }} />

			<Show when={transcript().length > 0}>
				<ol class="mt-4 mb-0 max-h-64 list-none space-y-2 overflow-y-auto p-0 text-sm" aria-label="Transcript">
					<For each={transcript()}>
						{(line) => (
							<li class={line.role === "you" ? "text-slate-300" : "text-emerald-200"}>
								<span class="mr-2 font-mono text-xs text-slate-500">{line.role}</span>
								{line.text}
							</li>
						)}
					</For>
				</ol>
			</Show>

			<Show when={session()}>
				{(active) => {
					const gen = generation;
					const effects = new Signals.Effect();
					onCleanup(() => effects.close());
					const url = new URL(active().relayUrl);
					url.searchParams.set("jwt", active().token);
					return (
						<>
							<moq-publish
								ref={(el: MoqPublish) => bindPublish(effects, el)}
								class="hidden"
								prop:url={url}
								prop:name={Net.Path.from(active().requestBroadcast)}
								prop:source="camera"
								prop:invisible={true}
								prop:preview="none"
							/>
							<moq-watch
								ref={(el: MoqWatch) => bindWatch(effects, el, gen, active())}
								class="hidden"
								prop:url={url}
								prop:name={Net.Path.from(active().responseBroadcast)}
								prop:reload={true}
								prop:volume={1}
								// The agent sends up to ~25s ahead of real time; a lower ceiling drops its speech.
								prop:latency={{ min: Net.Time.Milli(100), max: Net.Time.Milli(30_000) }}
							/>
						</>
					);
				}}
			</Show>

			<div class="mt-4 space-y-2">
				<moq-publish-support prop:show="error" />
				<moq-watch-support prop:show="error" />
			</div>

			<p class="mt-4 mb-0 text-xs text-slate-500">Audio is sent to the demo agent, not stored by this page.</p>
		</div>
	);
}
