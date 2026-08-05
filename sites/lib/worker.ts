/**
 * The Cloudflare Worker behind moq.pub and moq.watch: serve the Vite build, and
 * hand every broadcast path to the single page that renders it.
 */
import { type Options, redirect } from "./route";

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export function handler(options: Options) {
	return {
		async fetch(request: Request, env: Env): Promise<Response> {
			const url = new URL(request.url);

			const location = redirect(url, options);
			if (location) {
				// An invented name is different on every request, so this redirect must
				// not be cached anywhere between here and the browser.
				return new Response(null, {
					status: 302,
					headers: { Location: location, "Cache-Control": "no-store" },
				});
			}

			// Broadcast names end in `.hang`, so "does the path look like a file?"
			// can't tell a page apart from an asset. Ask the asset store instead, and
			// fall back to the page, which reads the path client-side.
			const asset = await env.ASSETS.fetch(request);
			if (asset.status !== 404) return asset;

			return env.ASSETS.fetch(new Request(new URL("/", url), { headers: request.headers }));
		},
	};
}
