import { createSignal } from "solid-js";

type State = "idle" | "submitting" | "success" | "error";

export default function Subscribe() {
	const [email, setEmail] = createSignal("");
	const [state, setState] = createSignal<State>("idle");
	const [error, setError] = createSignal("");

	const handleSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		setState("submitting");
		setError("");

		try {
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email() }),
			});

			if (res.ok) {
				setState("success");
			} else {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setError(body.error ?? "Something went wrong. Try again?");
				setState("error");
			}
		} catch {
			setError("Couldn't reach the server. Try again?");
			setState("error");
		}
	};

	return (
		<>
			{state() === "success" ? (
				<p class="text-sm text-green-400">Thanks! You'll get an email when a new post goes up.</p>
			) : (
				<form onSubmit={handleSubmit} class="flex flex-col gap-2 sm:flex-row">
					<input
						type="email"
						required
						placeholder="you@example.com"
						value={email()}
						onInput={(e) => setEmail(e.currentTarget.value)}
						disabled={state() === "submitting"}
						class="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 transition-colors focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-60"
					/>
					<button
						type="submit"
						disabled={state() === "submitting"}
						class="rounded-lg bg-green-500 px-5 py-2 font-bold text-slate-950 transition-colors hover:bg-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
					>
						{state() === "submitting" ? "Subscribing…" : "Subscribe"}
					</button>
				</form>
			)}
			{state() === "error" && <p class="mt-2 text-sm text-red-400">{error()}</p>}
		</>
	);
}
