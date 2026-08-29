// Cloudflare Worker entry. Static asset requests fall through to the ASSETS
// binding (Workers-with-Static-Assets). Only the de.moq.dev rewrite and the Go
// vanity import paths are handled here.
//
// Note that the Worker only sees a request if wrangler.jsonc says so: an asset
// miss is answered with the 404 page rather than falling through, so every path
// below has to be listed in `run_worker_first`.

import { vanity } from "./vanity";

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// de.moq.dev is the DEMOQED page, which lives at /de in the static build.
		const alreadyRewritten = url.pathname === "/de" || url.pathname.startsWith("/de/");
		if (url.hostname.split(".")[0] === "de" && !alreadyRewritten) {
			const rewritten = new URL(url);
			rewritten.pathname = `/de${url.pathname}`;
			return env.ASSETS.fetch(new Request(rewritten, request));
		}
		// `go get moq.dev/moq` and friends, served from a mirror repo rather than
		// by this site. After the rewrite above, so it only ever answers for the
		// host the import paths are published under.
		const module = vanity(url);
		if (module) return module;

		return env.ASSETS.fetch(request);
	},
};
