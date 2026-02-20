#!/usr/bin/env just --justfile

# Using Just: https://github.com/casey/just?tab=readme-ov-file#installation

# List all of the available commands.
default:
  just --list

# Run the CI checks
check:
	bun i

	# Lint the JS packages
	bun exec biome check

	# Make sure Typescript compiles
	bun run check

# Automatically fix some issues.
fix:
	# Fix the JS packages
	bun i

	# Format and lint
	bun exec biome check --fix

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
build:
	bun i
	bun astro build

# Deploy the site to Cloudflare Pages
deploy env="staging": build
	bun wrangler deploy --env {{env}}

dev:
	bun i

	# Run the web development server
	bun astro dev --open

prod: build
	bun astro preview --open
