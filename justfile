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

# Deploy the site to Cloudflare Pages
# On `live`, any post that wasn't already on moq.dev gets mailed to subscribers.
deploy env="staging": (build env)
	# Record what's live before we replace it, so we can tell what the deploy added.
	bun scripts/notify-subscribers.ts snapshot --env {{env}}
	bun wrangler deploy --env {{env}}
	bun scripts/notify-subscribers.ts send --env {{env}}

dev:
	bun i

	# Run the web development server
	bun astro dev --open

prod: (build "live")
	bun astro preview --open
