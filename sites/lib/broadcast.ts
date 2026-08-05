/**
 * The URL scheme shared by moq.pub and moq.watch: a broadcast lives at
 * `/<project>/<name>`.
 *
 * The project is the relay tenant (`anon`, `demo`, ...) and the name is
 * everything after it, so names may contain slashes. Anything that isn't part
 * of the broadcast's identity — the relay host, an auth token, the capture
 * source — stays in the query string.
 */

export interface Broadcast {
	/** The relay project: the first path segment. */
	project: string;
	/** The broadcast name: everything after the project. */
	name: string;
}

/** Parse `/<project>/<name>`, or undefined when the path isn't a broadcast. */
export function parse(pathname: string): Broadcast | undefined {
	const parts = pathname
		.split("/")
		.filter((part) => part !== "")
		.map(decodeURIComponent);

	// A project on its own isn't enough to publish or watch anything.
	if (parts.length < 2) return undefined;

	const [project, ...name] = parts;
	return { project, name: name.join("/") };
}

/** The inverse of {@link parse}: the path a broadcast lives at. */
export function path({ project, name }: Broadcast): string {
	const parts = [project, ...name.split("/")].filter((part) => part !== "");
	return `/${parts.map(encodeURIComponent).join("/")}`;
}

/**
 * The moq.watch URL that plays a broadcast back.
 *
 * `relay` carries over, because a viewer pointed at the default relay finds
 * nothing when the broadcast went somewhere else.
 *
 * `jwt` deliberately does *not*. moq tokens are prefix-scoped with separate
 * publish (`put`) and subscribe (`get`) grants, and a token being used to
 * publish necessarily carries `put` — copying it into a link meant to be handed
 * around would give every recipient the right to publish, not just to watch. A
 * publisher who wants to share access to a private broadcast passes a
 * viewer-scoped token as `?viewer=`, which becomes the `?jwt=` on the other end.
 */
export function watch(broadcast: Broadcast, params: URLSearchParams, base: string): URL {
	const url = new URL(path(broadcast), base);

	const relay = params.get("relay");
	if (relay) url.searchParams.set("relay", relay);

	const viewer = params.get("viewer");
	if (viewer) url.searchParams.set("jwt", viewer);

	return url;
}

/**
 * The relay URL to connect to: `<relay>/<project>`, carrying `?jwt=` when the
 * page was given a token.
 */
export function relay(broadcast: Broadcast, params: URLSearchParams, fallback: string): URL {
	const url = new URL(params.get("relay") || fallback);
	url.pathname = `${url.pathname.replace(/\/+$/, "")}/${broadcast.project}`;

	const jwt = params.get("jwt");
	if (jwt) url.searchParams.set("jwt", jwt);

	return url;
}
