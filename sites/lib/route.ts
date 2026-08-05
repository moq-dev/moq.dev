/**
 * Routing shared by the Workers and the Vite dev server, so `bun run dev` and
 * production agree on what a URL means.
 *
 * Two cases redirect before the page ever loads:
 *
 *   - moq.pub with no broadcast in the path invents one, so the publisher has a
 *     stable, shareable URL from the first paint rather than after the JS runs.
 *   - the old `?project=&name=` links, which now live in the path.
 */
import * as Broadcast from "./broadcast";
import { random } from "./name";

export interface Options {
	/** Invent a broadcast name when the request doesn't carry one (moq.pub). */
	invent: boolean;
	/** The project to assume when the URL doesn't name one. */
	project: string;
}

/** The path to redirect to, or undefined to serve the request as-is. */
export function redirect(url: URL, options: Options): string | undefined {
	// Already a broadcast path; nothing to do.
	if (Broadcast.parse(url.pathname)) return undefined;

	const params = new URLSearchParams(url.search);
	const name = params.get("name") ?? (options.invent ? random() : undefined);

	// moq.watch with nothing to watch: let the page show its usage hint.
	if (!name) return undefined;

	const project = params.get("project") || options.project;

	// The rest of the query string (relay, jwt, source) isn't part of the
	// broadcast's identity, so it survives the move into the path.
	params.delete("name");
	params.delete("project");
	const query = params.toString();

	return Broadcast.path({ project, name }) + (query ? `?${query}` : "");
}
