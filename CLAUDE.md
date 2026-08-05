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
just deploy live   # Deploy to production, and email subscribers about new posts
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
- **Package Manager**: bun v1.3.4
- **Task Runner**: just

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
`moq.pub/anon/lazy-otter-4f21.hang`. The project is the relay tenant and the
name is everything after it, so names may contain slashes. The same path on
either site refers to the same broadcast — publish at `moq.pub/anon/x.hang` and
watch it back at `moq.watch/anon/x.hang`.

Anything that *isn't* part of the broadcast's identity stays in the query
string: `?relay=<url>`, `?jwt=<token>`, and (moq.pub only) `?source=camera` and
`?viewer=<token>`.

**`jwt` is never copied into the moq.watch link that moq.pub shows.** moq tokens
are prefix-scoped with separate publish (`put`) and subscribe (`get`) grants, so
a token being used to publish carries `put` — putting it in a link meant to be
passed around would hand every recipient the right to publish. `relay` does
carry over, since a viewer on the wrong relay finds nothing. To share access to
a private broadcast, pass a subscribe-only token as `?viewer=`; it becomes the
`?jwt=` on the moq.watch end. With a `jwt` and no `viewer`, the page says so
rather than showing a link that looks fine and won't connect.

`sites/lib` holds the scheme itself, shared by both sites and by both the Worker
and the Vite dev server so they can't drift:

- `broadcast.ts` — parse and build `/<project>/<name>`, and the relay URL
- `route.ts` — which requests redirect: a bare `moq.pub/` invents a random name,
  and old `?project=&name=` links move into the path
- `worker.ts` — the Worker both sites export
- `dev.ts` — a Vite plugin giving `just dev-pub` / `just dev-watch` the same
  routing (`just dev` is the Astro site and doesn't use it)

Two things are easy to break here:

- `assets.run_worker_first: ["/"]` in each `wrangler.jsonc` is load-bearing. `/`
  matches `index.html`, so without it Cloudflare's asset server answers first and
  the Worker never runs — no redirect, no invented name.
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

The player sites deploy *before* moq.dev on purpose. Snapshot → moq.dev upload →
announce is effectively a transaction: a failure in the middle leaves posts live
but unannounced, and since the snapshot expires after an hour, a later retry
reads those posts as already-published and never mails them. Keep anything
fallible out from between those three steps.

**`just deploy live` mails the subscriber list.** `scripts/notify-subscribers.ts` snapshots the slugs in `https://moq.dev/rss.xml` before the upload, then sends a Resend broadcast for every post in the freshly built `dist/rss.xml` that wasn't in that snapshot. Subject and body come from the feed's `title` and `description`. A deploy that adds no posts sends nothing.

Credentials come from 1Password, so no secret has to sit on disk. `op.env` maps `RESEND_API_KEY` to `op://Corp/Resend/credential` and `op run` resolves it for the duration of the command. That file is committed on purpose: it holds references, not values. Install and sign in once with `brew install 1password-cli && op signin`.

Without the 1Password CLI the recipe falls back to `RESEND_API_KEY` and `RESEND_SEGMENT_ID` from the ambient environment, and if those are missing too the deploy still succeeds while the script exits non-zero to say the announcement did not go out. `just deploy staging` never announces and never touches 1Password.

Broadcasts cannot be recalled, so the script refuses to guess: an unreachable or empty live feed, a missing snapshot, or a missing build all skip sending rather than risk mailing the back catalogue. Any local `.mdx` under `src/pages/blog/` ships on the next `just deploy live` and gets announced, drafts included.

## Development Tips

- Broadcasts are ephemeral - no persistence layer
- The `@moq/publish` and `@moq/watch` packages handle all MoQ protocol implementation
- For new blog posts, add MDX files to `src/pages/blog/`
- Component changes in `src/components/` automatically reload with HMR
- moq.pub links to moq.watch, so `just dev-pub` expects `just dev-watch` on :5173
