/**
 * Vanity import paths for the Go modules, so a program imports `moq.dev/moq`
 * rather than whichever mirror repo the code happens to live in.
 *
 * The go command fetches `<import path>?go-get=1` and reads the repo to clone
 * out of a `<meta name="go-import">` tag, so this hostname owns the published
 * import path. Moving or renaming a mirror then costs a line in the table below
 * instead of a breaking change for everyone who imported it.
 */

/** A published module: the path it answers to, and the repo behind it. */
interface Module {
	/** Path on this host, which is also the module path in its `go.mod`. */
	dir: string;
	/** Repo the go command clones. */
	repo: string;
}

/**
 * The host the modules are published under.
 *
 * Hard-coded rather than read off the request: the tag has to name the module
 * path in `go.mod`, so staging serves the same `moq.dev/...` prefix it will
 * serve in production (and `go get new.moq.dev/moq` correctly refuses).
 */
const HOST = "moq.dev";

/**
 * Every module published under HOST.
 *
 * Paths have to start with `/moq` to match the `run_worker_first` wildcard in
 * wrangler.jsonc. Without that, an asset miss answers with the 404 page and the
 * go command never reaches this Worker at all.
 */
const MODULES: Module[] = [
	{ dir: "/moq", repo: "https://github.com/moq-dev/moq-go" },
	{ dir: "/moq-ffi", repo: "https://github.com/moq-dev/moq-go-ffi" },
];

/** The go-get response for a vanity path, or undefined to serve the request normally. */
export function vanity(url: URL): Response | undefined {
	// The go command asks about the full import path, package directory and all,
	// so a module owns everything beneath it.
	const module = MODULES.find((m) => url.pathname === m.dir || url.pathname.startsWith(`${m.dir}/`));
	if (!module) return undefined;

	// Only the go command wants the meta tag; send people to the docs.
	if (url.searchParams.get("go-get") !== "1") {
		return Response.redirect(`https://pkg.go.dev/${HOST}${url.pathname}`, 302);
	}

	return new Response(page(module), {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
}

function page(module: Module): string {
	const path = HOST + module.dir;

	// go-import is the one the go command needs. go-source is what pkg.go.dev
	// follows to link a symbol back to the line that declares it.
	return `<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<meta name="go-import" content="${path} git ${module.repo}">
		<meta name="go-source" content="${path} ${module.repo} ${module.repo}/tree/main{/dir} ${module.repo}/blob/main{/dir}/{file}#L{line}">
	</head>
	<body>
		<a href="https://pkg.go.dev/${path}">${path}</a> is served from <a href="${module.repo}">${module.repo}</a>.
	</body>
</html>
`;
}
