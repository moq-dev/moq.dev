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
				segments: [env.RESEND_SEGMENT_ID],
			}),
		});
	} catch (err) {
		console.error(`Resend POST /contacts → fetch threw: ${err}`);
		return json({ error: "subscribe failed" }, 502);
	}

	// Treat any non-5xx as success so we don't leak whether an address is
	// already on the list (Resend returns 4xx for duplicates). Log 4xx for
	// debugging since a misconfigured segment ID would silently break sends.
	// Only log status + request id, not the body (which may contain the email).
	if (!res.ok) {
		console.error(`Resend POST /contacts → ${res.status} (request-id: ${res.headers.get("x-request-id") ?? "n/a"})`);
	}
	if (res.status >= 500) {
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
