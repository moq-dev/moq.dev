# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

moq.dev is a web blog and demo for Media over QUIC (MoQ) protocol. It's built with Astro, Solid.js, and uses WebTransport to connect to MoQ relay servers for live streaming.

## Essential Commands

```bash
# Development
just dev           # Start dev server with auto-open

# Build & Deploy
just build         # Production build
just deploy        # Deploy to Cloudflare Pages (staging by default)
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

### Deployment

- Cloudflare Pages via Wrangler
- `just deploy` for staging, `just deploy live` for production
- Deploys are manual; nothing ships on merge to `main`

**`just deploy live` mails the subscriber list.** `scripts/notify-subscribers.ts` snapshots the slugs in `https://moq.dev/rss.xml` before the upload, then sends a Resend broadcast for every post in the freshly built `dist/rss.xml` that wasn't in that snapshot. Subject and body come from the feed's `title` and `description`. A deploy that adds no posts sends nothing.

This needs `RESEND_API_KEY` and `RESEND_SEGMENT_ID` in the shell. They are secrets, so they cannot live in the committed `.env.live`; use `.dev.vars` or your shell profile. Without them the deploy still succeeds and the script exits non-zero to say the announcement did not go out.

Broadcasts cannot be recalled, so the script refuses to guess: an unreachable or empty live feed, a missing snapshot, or a missing build all skip sending rather than risk mailing the back catalogue. Any local `.mdx` under `src/pages/blog/` ships on the next `just deploy live` and gets announced, drafts included.

## Development Tips

- Broadcasts are ephemeral - no persistence layer
- The `@moq/publish` and `@moq/watch` packages handle all MoQ protocol implementation
- For new blog posts, add MDX files to `src/pages/blog/`
- Component changes in `src/components/` automatically reload with HMR
