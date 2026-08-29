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

# Deploy all three sites to Cloudflare.
deploy env="staging": (build env)
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
