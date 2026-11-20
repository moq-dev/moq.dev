// Cloudflare Worker entry. Static assets are served before the Worker runs, so
// this only sees paths without one: the Go vanity import paths and 404s.

import { vanity } from "./vanity";

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// `go get moq.dev/moq` and friends, served from a mirror repo rather than
		// by this site.
		const module = vanity(url);
		if (module) return module;

		// Not `not_found_handling`, because public/_headers would apply to its response
		// and cache a missing /_astro/ file as immutable. Worker responses skip _headers.
		const page = await env.ASSETS.fetch(new Request(new URL("/404", url)));
		return new Response(page.body, { status: 404, headers: page.headers });
	},
};
