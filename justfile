#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the checks. No CI runs on pull requests, so run this, `just test`, and
# `just build` before pushing.
check:
	# The committed lockfile, as the deploy installs it.
	bun install --frozen-lockfile

	# This revision's dev shell, whose evaluation checks the Nix and package.json
	# Bun pins, even from a shell entered at an older revision.
	nix eval --raw ".#devShells.$(nix eval --impure --raw --expr builtins.currentSystem).default.drvPath" > /dev/null

	# Lint the JS packages
	bunx biome check

	# Make sure Typescript compiles
	bun run check

	# Validate the quest tree
	quest check

# Automatically fix some issues.
fix:
	# Fix the JS packages
	bun i

	# Format and lint
	bunx biome check --fix

# Run the tests.
test:
	# Run the JS tests via node.
	bun test

# Render the social announcement cards (tools/cards/cards.ts) to PNG with the
# devshell's Playwright Chromium: `just cards` for all, `just cards <slug>...`
# for some, `--html` to keep the page for tweaking. Output lands in
# tools/cards/out/, which is ignored; the PNGs are posted, not committed.
cards *args:
	bun i
	bun tools/cards/render.ts {{args}}

# Regenerate every per-page and per-blog-post OG card under public/og/ and public/layout/og.png.
og *args:
	bun i
	bun tools/cards/render.ts --og {{args}}

# Trace hand-drawn PNGs into SVGs beside them (tools/drawn/trace.ts). Then delete
# each PNG and point its references at the SVG; a cover still gets a PNG og:image.
trace *args:
	bun tools/drawn/trace.ts {{args}}

# Upgrade any tooling
upgrade:
	# Update the NPM dependencies
	bun upgrade
	bun outdated

# Build the packages
build mode="live":
	bun i
	bun astro build --mode {{mode}}

	# Only the built HTML shows whether each page's social card renders.
	bun scripts/check-og.ts

	# The moq.pub and moq.watch player sites, which share these .env files.
	bun vite build sites/pub --mode {{mode}}
	bun vite build sites/watch --mode {{mode}}

# Build and deploy all three sites to Cloudflare.
deploy env="staging": (build env) (deploy-upload env)

# Upload the already built sites to Cloudflare.
deploy-upload env="staging":
	bun wrangler deploy --config sites/pub/wrangler.jsonc --env {{env}}
	bun wrangler deploy --config sites/watch/wrangler.jsonc --env {{env}}
	bun wrangler deploy --env {{env}}

dev:
	bun i

	# Run the web development server
	bun astro dev --open

# Run the moq.pub development server on :5174.
dev-pub:
	bun i
	bun vite sites/pub --open

# Run the moq.watch development server on :5173.
dev-watch:
	bun i
	bun vite sites/watch --open

prod: (build "live")
	bun astro preview --open
