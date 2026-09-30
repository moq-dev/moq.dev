# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

moq.dev is a web blog and demo for Media over QUIC (MoQ) protocol. It's built with Astro, Solid.js, and uses WebTransport to connect to MoQ relay servers for live streaming.

The repo holds three sites, each its own Cloudflare Worker but built and deployed together:

| Site        | Source      | What it is                                            |
|-------------|-------------|-------------------------------------------------------|
| `moq.dev`   | `src/`      | The Astro blog and demos                              |
| `moq.pub`   | `sites/pub` | A bare `<moq-publish-ui>` publisher, no framework     |
| `moq.watch` | `sites/watch` | A bare `<moq-watch-ui>` player, no framework         |

## Essential Commands

```bash
# Development
just dev           # Start the moq.dev dev server with auto-open
just dev-pub       # moq.pub on :5174
just dev-watch     # moq.watch on :5173

# Build & Deploy
just build         # Production build of all three sites
just deploy        # Deploy all three to Cloudflare (staging by default)
just deploy live   # Deploy to production
just prod          # Build and preview production locally

# Code Quality
just check         # Run Biome linting and TypeScript checking
just fix           # Auto-fix code formatting/lint issues
```

## Architecture Overview

### Technology Stack
- **Framework**: Astro (static output)
- **UI Components**: Solid.js for interactive elements
- **Styling**: Tailwind CSS
- **Build**: Vite
- **Code Quality**: Biome for linting/formatting
- **Package Manager**: bun v1.3.13
- **Task Runner**: just
- **Toolchain**: pinned in `flake.nix`; `nix develop` (or direnv, via `.envrc`) provides bun, node, and just

The Bun version in nixpkgs must match `packageManager` in `package.json`
and the base image in `Dockerfile`. CI reads its version from `package.json`
and evaluates the flake assertions to catch drift. When a weekly Dependabot
Nix update changes Bun, update the other two pins in the same PR.

### Key Components

**MoQ Client Implementation** (`@moq/publish` + `@moq/watch` packages):
   - Custom web components: `<moq-publish>`, `<moq-watch>`
   - UI wrapper components: `<moq-publish-ui>`, `<moq-watch-ui>`

### Important Patterns

- **No REST APIs**: Uses WebTransport directly for streaming
- **Stateless**: No database or user management
- **Error Handling**: Component-level with `src/components/fail.tsx`
- **Authentication**: Basic JWT support via query parameters for demo broadcasts
- **Content Management**: MDX files in `src/pages/blog/` for documentation

### The moq.pub / moq.watch URL scheme

A broadcast is identified by its path: `/<project>/<name>`, e.g.
`moq.pub/try/h2z15dgmdh.hang`. The project is the relay tenant and the
name is everything after it, so names may contain slashes. The same path on
either site refers to the same broadcast — publish at `moq.pub/try/x.hang` and
watch it back at `moq.watch/try/x.hang`.

Anything that *isn't* part of the broadcast's identity stays in the query
string: `?relay=<url>`, `?cloudflare=<subdomain>`, `?jwt=<token>`, and
(moq.pub only) `?source=camera`. `?cloudflare=draft-16` is shorthand for
`https://draft-16.cloudflare.mediaoverquic.com`; the project path segment still
carries Cloudflare's relay token. `cloudflare` and `relay` are mutually
exclusive.

A bare `moq.pub/` mints a private broadcast in the `try` project from
`POST ${PUBLIC_API_URL}/try/token` and keeps the publish token in its own URL.
**A watch link never carries `?jwt=`**: moq tokens are prefix-scoped with
separate publish (`put`) and subscribe (`get`) grants, so a shared publish token
lets anyone publish. moq.pub links to moq.watch only for `try` on the default
relay, and moq.watch mints its own subscribe token from `/try/watch` for a
tokenless `try` path. Other projects get no link; swap the hostname.

`sites/lib` holds the scheme itself, shared by both sites and by both the Worker
and the Vite dev server so they can't drift:

- `broadcast.ts` — parse and build `/<project>/<name>`, and the relay URL
- `route.ts` — old `?project=&name=` links redirect into the path
- `try.ts` — mint `try` credentials from the API
- `worker.ts` — the Worker both sites export
- `dev.ts` — a Vite plugin giving `just dev-pub` / `just dev-watch` the same
  routing (`just dev` is the Astro site and doesn't use it)

Two things are easy to break here:

- `assets.run_worker_first: ["/"]` in each `wrangler.jsonc` is load-bearing. `/`
  matches `index.html`, so without it Cloudflare's asset server answers first and
  the Worker never runs and old `?project=&name=` links don't redirect.
- The Worker can't decide "asset vs. page" by looking for a dot, because names
  end in `.hang`. It asks the asset store and falls back to the page on a 404.

### Deployment

- Cloudflare Workers via Wrangler, one per site
- `just deploy` for staging, `just deploy live` for production
- Deploys are manual; nothing ships on merge to `main`

`just deploy <env>` builds all three sites in that mode and uploads each Worker.
The player sites read the repo-root `.env.<env>` files that the Astro site uses,
so `PUBLIC_RELAY_URL` is the single place the relay is configured. Staging is
`new.moq.dev`, `new.moq.pub`, and `new.moq.watch`.

The player sites deploy before moq.dev.

## Development Tips

- Broadcasts are ephemeral - no persistence layer
- The `@moq/publish` and `@moq/watch` packages handle all MoQ protocol implementation
- For new blog posts, add MDX files to `src/pages/blog/`
- Component changes in `src/components/` automatically reload with HMR
