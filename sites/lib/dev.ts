/**
 * Teach the Vite dev server the routing that the Worker does in production, so
 * `/anon/foo.hang` loads the page locally instead of 404ing.
 */
import type { Plugin } from "vite";
import { type Options, redirect } from "./route";

export function routing(options: Options): Plugin {
	return {
		name: "moq-routing",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				// Only navigations are ours. Module and asset requests have to reach
				// Vite untouched, or `/logo.svg` gets mistaken for a broadcast path and
				// redirected. In production that split is `run_worker_first`.
				if (!req.headers.accept?.includes("text/html")) return next();

				const url = new URL(req.url ?? "/", "http://localhost");

				const location = redirect(url, options);
				if (location) {
					res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
					res.end();
					return;
				}

				// Serve the page for whatever path this is. The browser keeps the real
				// URL, which is what the page reads.
				req.url = "/";
				next();
			});
		},
	};
}
