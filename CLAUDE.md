# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

moq.dev is a web blog and demo for Media over QUIC (MoQ) protocol. It's built with Astro, Solid.js, and uses WebTransport to connect to MoQ relay servers for live streaming.

## Essential Commands

```bash
# Development
npm run dev        # Start dev server with auto-open and HTTPS

# Build & Production
npm run build      # Production build
npm run prod       # Build and preview production

# Code Quality
npm run check      # Run Biome linting and TypeScript checking
npm run fix        # Auto-fix code issues and audit dependencies
```

## Architecture Overview

### Technology Stack
- **Framework**: Astro with SSR via Node.js adapter
- **UI Components**: Solid.js for interactive elements
- **Styling**: Tailwind CSS
- **Build**: Vite with WASM and mkcert plugins
- **Code Quality**: Biome for linting/formatting
- **Package Manager**: pnpm v10.11.0

### Key Components

1. **MoQ Client Implementation** (`@moq/hang` package):
   - Custom web components: `<hang-publish>`, `<hang-watch>`, `<hang-support>`
   - WebTransport protocol for relay connections
   - Publishing: `src/components/publish.tsx` - Creates broadcasts with random names
   - Watching: `src/components/watch.tsx` - Connects to broadcasts by name

2. **Routing Structure**:
   - `/publish` - Create new broadcasts
   - `/watch/{name}` - View specific broadcast
   - `/blog/` - MDX-based blog posts
   - Dynamic routes use `export const prerender = false` for SSR

3. **Environment Configuration**:
   - `PUBLIC_RELAY_URL` - WebTransport URL
   - Separate `.env` files for dev/production

### Important Patterns

- **No REST APIs**: Uses WebTransport directly for streaming
- **Stateless**: No database or user management
- **Error Handling**: Component-level with `src/components/fail.tsx`
- **Authentication**: Basic JWT support via query parameters for demo broadcasts
- **Content Management**: MDX files in `src/pages/blog/` for documentation

### Deployment

- Docker multi-stage builds
- Terraform infrastructure in `/infra/`
- Production entry: `dist/server/entry.mjs`

## Development Tips

- WebTransport requires HTTPS even in development (handled by vite-plugin-mkcert)
- Broadcasts are ephemeral - no persistence layer
- The `@moq/hang` package handles all MoQ protocol implementation
- For new blog posts, add MDX files to `src/pages/blog/`
- Component changes in `src/components/` automatically reload with HMR
