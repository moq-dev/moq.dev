#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	bun i

	# Lint the JS packages
	bunx biome check

	# Make sure Typescript compiles
	bun run check

# Automatically fix some issues.
fix:
	# Fix the JS packages
	bun i

	# Format and lint
	bunx biome check --fix

# Run any CI tests
test:
	# Run the JS tests via node.
	bun test

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun upgrade
	bun outdated

# Build the packages
build mode="live":
	bun i
	bun astro build --mode {{mode}}

	# The moq.pub and moq.watch player sites, which share these .env files.
	bun vite build sites/pub --mode {{mode}}
	bun vite build sites/watch --mode {{mode}}

# Deploy all three sites to Cloudflare
# On `live`, any post that wasn't already on moq.dev gets mailed to subscribers.
deploy env="staging": (build env)
	# The player sites go first. They're independent of the blog, and the
	# snapshot/deploy/announce sequence below is a transaction: a failure between
	# the moq.dev upload and the announcement leaves posts live but unannounced,
	# and the snapshot expires after an hour, so a later retry sees the new posts
	# as already-published and stays silent forever.
	bun wrangler deploy --config sites/pub/wrangler.jsonc --env {{env}}
	bun wrangler deploy --config sites/watch/wrangler.jsonc --env {{env}}

	# Record what's live before we replace it, so we can tell what the deploy added.
	bun scripts/notify-subscribers.ts snapshot --env {{env}}
	bun wrangler deploy --env {{env}}
	just _announce {{env}}

# Mail subscribers about anything this deploy published.
# Credentials come from 1Password (see op.env) so no secret has to live on disk.
[private]
_announce env:
	#!/usr/bin/env bash
	set -euo pipefail

	# Staging never announces, so don't make it depend on 1Password.
	if [ "{{env}}" != "live" ]; then
		exec bun scripts/notify-subscribers.ts send --env {{env}}
	fi

	# Fall back to the ambient environment rather than failing outright: the deploy
	# has already happened by now, and the script reports a missing key itself.
	if ! command -v op >/dev/null 2>&1; then
		echo "[notify] 1Password CLI not found, falling back to the ambient environment." >&2
		exec bun scripts/notify-subscribers.ts send --env {{env}}
	fi

	exec op run --env-file=op.env -- bun scripts/notify-subscribers.ts send --env {{env}}

dev:
	bun i

	# Run the web development server
	bun astro dev --open

# Run the moq.pub development server on :5174. It links broadcasts to :5173,
# so run `just dev-watch` alongside it to follow those links.
dev-pub:
	bun i
	bun vite sites/pub --open

# Run the moq.watch development server on :5173.
dev-watch:
	bun i
	bun vite sites/watch --open

prod: (build "live")
	bun astro preview --open
