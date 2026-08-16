// Cloudflare Worker entry. Static asset requests fall through to the ASSETS
// binding (Workers-with-Static-Assets). Only /api/* is handled here.

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	RESEND_API_KEY: string;
	RESEND_SEGMENT_ID: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/subscribe") {
			if (request.method !== "POST") {
				return new Response("Method Not Allowed", { status: 405 });
			}
			return handleSubscribe(request, env);
		}

		// de.moq.dev is the DEMOQED page, which lives at /de in the static build.
		const alreadyRewritten = url.pathname === "/de" || url.pathname.startsWith("/de/");
		if (url.hostname.split(".")[0] === "de" && !alreadyRewritten) {
			const rewritten = new URL(url);
			rewritten.pathname = `/de${url.pathname}`;
			return env.ASSETS.fetch(new Request(rewritten, request));
		}

		return env.ASSETS.fetch(request);
	},
};

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
	let email: unknown;
	try {
		const body = (await request.json()) as { email?: unknown };
		email = body.email;
	} catch {
		return json({ error: "invalid body" }, 400);
	}

	if (typeof email !== "string" || !EMAIL_RE.test(email)) {
		return json({ error: "invalid email" }, 400);
	}

	let res: Response;
	try {
		res = await fetch("https://api.resend.com/contacts", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email,
				unsubscribed: false,
				// Objects, not bare ids. A string here is a 422 that used to be reported
				// to the visitor as success, so every signup was dropped on the floor.
				segments: [{ id: env.RESEND_SEGMENT_ID }],
			}),
		});
	} catch (err) {
		console.error(`Resend POST /contacts → fetch threw: ${err}`);
		return json({ error: "subscribe failed" }, 502);
	}

	// Resend upserts contacts: re-subscribing an existing address returns 201 with
	// the same contact id, so there is no duplicate to hide and no reason to
	// swallow a 4xx. Anything not ok is a real failure (malformed body, unknown
	// segment), and calling those success is what silently discarded every signup.
	// Only log status + request id, not the body (which may contain the email).
	if (!res.ok) {
		console.error(`Resend POST /contacts → ${res.status} (request-id: ${res.headers.get("x-request-id") ?? "n/a"})`);
		return json({ error: "subscribe failed" }, 502);
	}

	return json({ ok: true }, 200);
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
