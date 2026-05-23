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
						class="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
					/>
					<button
						type="submit"
						disabled={state() === "submitting"}
						class="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:bg-slate-700"
					>
						{state() === "submitting" ? "Subscribing…" : "Subscribe"}
					</button>
				</form>
			)}
			{state() === "error" && <p class="mt-2 text-sm text-red-400">{error()}</p>}
		</>
	);
}
