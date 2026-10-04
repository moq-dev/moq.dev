import { Net } from "@moq/publish";
import "@moq/publish/element";
import "@moq/publish/support/element";
import "@moq/watch/element";
import "@moq/watch/support/element";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

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
	reset: (widgetId: string) => void;
	remove: (widgetId: string) => void;
};

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

type Session = {
	relayUrl: string;
	requestBroadcast: string;
	responseBroadcast: string;
	publishToken: string;
	watchToken: string;
	expiresAt: number;
};

type Refusal = {
	error?: string;
};

const API_URL = import.meta.env.PUBLIC_API_URL;
const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstilePromise: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	if (turnstilePromise) return turnstilePromise;

	turnstilePromise = new Promise((resolve, reject) => {
		const loaded = () => {
			if (window.turnstile) resolve(window.turnstile);
			else reject(new Error("Turnstile loaded without its browser API."));
		};

		const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`);
		if (existing) {
			existing.addEventListener("load", loaded, { once: true });
			existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
			return;
		}

		const script = document.createElement("script");
		script.src = TURNSTILE_SCRIPT;
		script.async = true;
		script.defer = true;
		script.addEventListener("load", loaded, { once: true });
		script.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
		document.head.append(script);
	});

	return turnstilePromise;
}

function authenticatedUrl(base: string, token: string): URL {
	const url = new URL(base);
	url.searchParams.set("jwt", token);
	return url;
}

export default function VoiceDemo() {
	const [challenge, setChallenge] = createSignal<string>();
	const [session, setSession] = createSignal<Session>();
	const [starting, setStarting] = createSignal(false);
	const [error, setError] = createSignal<string>();
	let turnstileContainer!: HTMLDivElement;
	let turnstile: Turnstile | undefined;
	let widgetId: string | undefined;
	let expiryTimer: ReturnType<typeof setTimeout> | undefined;

	const resetChallenge = () => {
		setChallenge(undefined);
		if (turnstile && widgetId) turnstile.reset(widgetId);
	};

	const stop = () => {
		if (expiryTimer) clearTimeout(expiryTimer);
		expiryTimer = undefined;
		setSession(undefined);
		setStarting(false);
		resetChallenge();
	};

	const start = async () => {
		const turnstileToken = challenge();
		if (!turnstileToken || starting()) return;

		setStarting(true);
		setError(undefined);
		try {
			const response = await fetch(new URL("/voice/sessions", API_URL), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ turnstileToken }),
			});
			if (!response.ok) {
				const refusal = (await response.json().catch(() => ({}))) as Refusal;
				throw new Error(refusal.error ? refusal.error : `The demo refused this session (${response.status}).`);
			}

			const admitted = (await response.json()) as Session;
			setSession(admitted);
			const remainingMs = Math.max(0, admitted.expiresAt * 1000 - Date.now());
			expiryTimer = setTimeout(stop, remainingMs);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "The voice demo could not start.");
			resetChallenge();
		} finally {
			setStarting(false);
		}
	};

	onMount(() => {
		if (!SITE_KEY) return;
		void loadTurnstile()
			.then((api) => {
				turnstile = api;
				widgetId = api.render(turnstileContainer, {
					sitekey: SITE_KEY,
					theme: "dark",
					size: "flexible",
					callback: (token) => {
						setChallenge(token);
						setError(undefined);
					},
					"error-callback": () => setError("The browser challenge failed. Please try again."),
					"expired-callback": () => setChallenge(undefined),
				});
			})
			.catch((cause) => setError(cause instanceof Error ? cause.message : "Turnstile failed to load."));
	});

	onCleanup(() => {
		if (expiryTimer) clearTimeout(expiryTimer);
		if (turnstile && widgetId) turnstile.remove(widgetId);
	});

	return (
		<div class="not-prose my-8 rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-xl sm:p-6">
			<div class="mb-5 flex items-start justify-between gap-4">
				<div>
					<p class="m-0 text-lg font-bold text-white">Talk to a Voice AI over MoQ</p>
					<p class="mt-1 mb-0 text-sm text-slate-400">Shared preview capacity. Sessions end after five minutes.</p>
				</div>
				<Show when={session()}>
					<span class="mt-1 inline-flex items-center gap-2 rounded-full bg-green-950 px-3 py-1 text-xs font-semibold text-green-300">
						<span class="h-2 w-2 animate-pulse rounded-full bg-green-400" /> Live
					</span>
				</Show>
			</div>

			<div class="space-y-4" classList={{ hidden: Boolean(session()) }}>
				<Show
					when={SITE_KEY}
					fallback={
						<p class="m-0 rounded-lg bg-amber-950 p-3 text-sm text-amber-200">The demo is not configured yet.</p>
					}
				>
					<div ref={turnstileContainer} class="min-h-[65px]" />
					<button
						type="button"
						onClick={start}
						disabled={!challenge() || starting()}
						class="rounded-lg bg-green-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
					>
						{starting() ? "Connecting..." : "Start talking"}
					</button>
				</Show>
				<Show when={error()}>
					<p role="alert" class="m-0 rounded-lg bg-red-950 p-3 text-sm text-red-200">
						{error()}
					</p>
				</Show>
				<p class="m-0 text-xs text-slate-500">
					Your browser will ask for microphone access. Audio is sent to the demo agent, not stored by this page.
				</p>
			</div>

			<Show when={session()}>
				{(active) => {
					const publishUrl = authenticatedUrl(active().relayUrl, active().publishToken);
					const watchUrl = authenticatedUrl(active().relayUrl, active().watchToken);
					return (
						<div class="space-y-5">
							<moq-publish
								class="hidden"
								prop:url={publishUrl}
								prop:name={Net.Path.from(active().requestBroadcast)}
								prop:source="camera"
								prop:invisible={true}
								prop:preview="none"
							/>
							<moq-watch
								class="hidden"
								prop:url={watchUrl}
								prop:name={Net.Path.from(active().responseBroadcast)}
								prop:reload={true}
								prop:volume={1}
								prop:latency={{ min: Net.Time.Milli(100), max: Net.Time.Milli(30_000) }}
							/>
							<p class="m-0 text-base text-slate-200">Speak normally. The agent will answer through your speakers.</p>
							<button
								type="button"
								onClick={stop}
								class="rounded-lg border border-slate-600 px-5 py-2 font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
							>
								Stop session
							</button>
						</div>
					);
				}}
			</Show>

			<div class="mt-5 space-y-2">
				<moq-publish-support prop:show="error" />
				<moq-watch-support prop:show="error" />
			</div>
		</div>
	);
}
