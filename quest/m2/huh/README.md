# Interactive moq.dev/huh protocol explainer

## Goal

`moq.dev/huh` is a public, animated, interactive explainer that walks visitors
top-to-bottom through 8 sections showing how MoQ works and why it replaces
RTMP/SRT, WebRTC, and HLS/DASH. Each section pairs concise plain-language copy
with an interactive SolidJS visual, explicitly flagging which capabilities are
IETF standard versus non-standard `moq-lite` / `moq-lite-07` / `moq-timestamp`
extensions, accompanied by the `huh?` cat from the voice AI blog post.

The page works completely client-side without requiring a live relay, respects
`MotionToggle` and `prefers-reduced-motion`, and is linked from the top header
nav (`Huh?`), the footer, and a `Huh?` button added to the homepage hero button
row without changing existing hero copy.

Until its final quest ([Sections 6–8 and site
links](/quest/m2/huh/routing-and-timestamps.md)) lands, the page is gated out
of every build but dev and staging (`UNRELEASED` in `astro.config.ts`), so
production 404s it, and live `sitemap.xml`, `llms.txt`, and OG cards leave it
out. That quest removes the gate.

Out of scope: duplicating wire-level protocol specs from `doc.moq.dev`,
rewriting `/blog/moq-onion`, and deploying.

## Plan

Decided 2026-11-24 (maintainer, `/quest-plan`), shared across the epic:

- Outcome: ✅ public `moq.dev/huh` interactive explainer (rejected: unlisted
  prototype first; drop).
- Structure: ✅ 8 top-to-bottom vertical scrolling sections with anchor links
  (`/huh#...`), plus a compact closing "Why switch" pitch band (rejected:
  4-layer bottom-up onion, 5-layer bottom-up onion, top-down layers). Ditching
  the onion/layer framing lets the page build and sell MoQ progressively.
- Visuals & interactivity: ✅ per-section interactive SolidJS toys matching
  `moq.dev`'s dark slate, Signal Green (`#22c55e`), and hand-drawn SVG style
  (`src/components/fanout/map.astro`, `src/components/voice/diagram.tsx`),
  respecting `isStill()` / `MotionToggle` and `prefers-reduced-motion`
  (rejected: pinned scrollytelling stage; watch-only loops).
- Headings & standards flags: ✅ plain human section titles with subtle
  protocol badges, explicitly flagging non-standard extensions (`moq-lite`
  routing, `moq-lite-07` timestamps, `moq-timestamp` `Subscriber Max Age`) vs.
  IETF standard features (rejected: protocol names as main headings; IETF-only
  names; mixing standard and custom features unlabeled).
- Art & mascot: ✅ incorporate the `huh?` cat from
  `public/blog/webrtc-is-still-the-problem/huh.webm` rotoscoped into hand-drawn
  SVG poses via `just trace`, plus a hand-drawn `huh?` heading SVG, reusing
  existing site SVGs where appropriate (rejected: reuse existing SVGs only).
- Navigation: ✅ add `Huh?` to the top header nav (`src/layouts/global.astro`),
  footer, and homepage hero button row (`src/pages/index.astro`, keeping
  existing hero copy untouched) (rejected: homepage + footer only; footer only;
  new homepage callout band).
- Section lineup:
  1. **QUIC & Multiple Streams** *(Standard · RFC 9000)* — HTTP/2 over TCP vs.
     HTTP/3 & WebTransport over QUIC, showing packet loss / head-of-line
     blocking where it applies. Label the automatic WebSocket fallback
     separately as `qmux` over WebSocket/TCP (project draft, still subject to
     TCP head-of-line blocking) rather than under the RFC 9000 badge.
  2. **Congestion & Prioritization** *(Standard · QUIC / IETF)* — shared
     congestion control (`cwnd`), ranked streams, opening new streams cheaply,
     and resetting stale streams mid-flight.
  3. **Frames & Groups** *(Standard · IETF MoQ)* — delta encoding (`I` + `P`
     frames) explained here (rejected: standalone frame dependency graph
     section); contiguous timeline with no gaps between groups, trickling
     frame-by-frame over one QUIC stream per group (noting this is the
     single-subgroup / `moq-lite` case, since IETF `moq-transport` also allows
     multiple subgroups per group).
  4. **Tracks: Media & Arbitrary Data on Demand** *(Standard + `hang`)* — pull,
     not push; live `catalog.json` for video renditions, extra cameras, audio,
     captions, and arbitrary data (`controls`, `chat`, `telemetry`) combined
     here (rejected: separate "Your App" section); unwatched encoders sleep;
     optional E2EE toggle labeled separately as the `moq-e2ee` project draft.
  5. **Broadcasts & Live Discovery** *(Standard + extensions)* — hierarchical
     namespaces/paths, prefix `ANNOUNCE` gossip across relays, live rosters
     without a room server or SDP, bidirectional sessions.
  6. **Mesh Routing, Shortest Path & Failover** *(Non-standard · `moq-lite`)* —
     multi-region voice-call mesh comparing lowest-cost routing (making route
     cost / latency weights explicit rather than implying fewer hops always
     win) and inter-region deduplication against centralized WebRTC SFU
     hairpinning, plus simultaneous CDN + self-hosted `moq-relay` + P2P
     connections with live link-cut failover.
  7. **Timestamp Addressing** *(Non-standard · `moq-lite-07`)* — track
     `Timescale` and frame `Timestamp` on the wire so `Time` range anchors
     address misaligned tracks and align ABR switches by media time, even with
     `moq-e2ee` encryption (rejected: separate faster-than-real-time TTS
     section).
  8. **Max Age: Per-Subscriber Latency Budgets** *(Non-standard · `moq-lite` /
     `moq-timestamp`)* — multiple simultaneous subscribers (e.g. `0.5 s` live
     operator/call, `4 s` viewer, `30 s` archive recorder) sharing one
     broadcast and relay, with the relay forwarding the widest `max_age`
     upstream (bounded by publisher/relay retention) and expiring superseded
     groups on whichever reaches `max_age` first: media timestamp age or
     hop wall-clock arrival age.
  - Closing band: zero STUN/TURN/SDP on direct relay connections over native
    QUIC or WebTransport (P2P browser paths still use WebRTC signaling/ICE) +
    QUIC migration, one protocol replacing RTMP/SRT/WebRTC/HLS, incremental
    migration via OBS/FFmpeg + HLS & WHIP/WHEP gateways, and links to `/demo`,
    `/voice`, `/boy`, `/carla`, and `https://doc.moq.dev`.

Verify all protocol claims against `moq/doc/concept/` and
`moq/drafts/draft-lcurley-moq-lite.md` (and `draft-lcurley-moq-timestamp.md`)
before writing copy. The PR that launches `/huh` publicly adds a follow-up
quest with a `Maintainer:` item to try and promote `moq.dev/huh`.
