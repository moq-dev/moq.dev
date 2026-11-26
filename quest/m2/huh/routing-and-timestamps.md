# [M] Add /huh Sections 6–8 (routing, timestamps, max age), huh? cat, and site links

## Goal

`/huh` is complete, released in live builds, and publicly linked across `moq.dev`:

6. **Mesh Routing, Shortest Path & Failover** (`Non-standard · moq-lite`) — a
   multi-region voice-call mesh (`US-West`, `US-East`, `EU`, `Tokyo`) comparing
   MoQ lowest-cost routing and per-link fan-out deduplication (e.g.
   `Tokyo ↔ Tokyo` staying local) against centralized WebRTC SFU hairpinning,
   plus toggles to add a simultaneous self-hosted / P2P shortcut and to cut a
   mesh link to watch automatic rerouting. State the demo's route-cost model
   explicitly (latency/edge costs or equal per-hop cost) so visitors understand
   that `moq-lite` ranks total route cost before hop count rather than always
   picking fewer hops.
7. **Timestamp Addressing** (`Non-standard · moq-lite-07`) — interactive shared
   media timeline across tracks with intentionally misaligned group durations
   (e.g. `480p` 2 s groups, `1080p` 3 s groups, `audio` 1 s groups), showing a
   draggable `Time(t)` anchor resolving to the right group on each track, an
   ABR `480p → 1080p` switch aligned cleanly by media time, and a `moq-e2ee`
   toggle labeled as its own project draft.
8. **Max Age: Per-Subscriber Latency Budgets** (`Non-standard · moq-lite /
   moq-timestamp`) — one broadcast through one relay serving three simultaneous
   subscribers (`Operator / Call`, `Couch Viewer`, `Archive Recorder`) with
   independent `Subscriber Max Age` budgets (plus an adjustable slider and a
   "Trigger congestion" button). Model both expiration clocks (whichever
   reaches `max_age` first: media timestamp age or hop wall-clock arrival age
   since the successor arrived, with the newest group never expiring) and the
   upstream retention limit (`Publisher Max Age` / relay cache ceiling, so a
   wider subscriber budget cannot recover groups already evicted upstream),
   showing the relay forwarding the widest `max_age` upstream (1× upload) while
   each viewer independently skips, buffers, or backfills.

Also ships the closing "Why switch" band (zero STUN/TURN/SDP scoped to direct
relay connections over native QUIC or WebTransport—not browser P2P paths, which
still use application-provided WebRTC signaling and ICE—plus QUIC migration,
one protocol replacing RTMP/SRT/WebRTC/HLS, incremental migration via
OBS/FFmpeg + HLS & WHIP/WHEP gateways, links to demos and `doc.moq.dev`), the
reactive `huh?` cat companion and the drawn `huh?` heading (replacing the
plain-text `<h1>`) using the traced SVGs from `public/huh/`, and
`Huh?` links in the top header nav, footer (`src/layouts/global.astro`), and
homepage hero button row (`src/pages/index.astro`, keeping existing hero copy
untouched).

Launching removes the live gate: move `src/unreleased/huh.astro` into
`src/pages/huh.astro` and delete its `UNRELEASED` entry in `astro.config.ts`
(and the gate itself if nothing else uses it), so live builds emit `/huh` and
list it in `sitemap.xml` and `llms.txt`. Add its OG card too: an `og-huh` entry
in `tools/cards/cards.ts` (title and description from the page, art
`huh/cat-huh.svg`), rendered with `just og og-huh`, passed as the page's
`cover`. Verify `/huh` in `bun astro build --mode live` output, its sitemap,
llms.txt, and `bun scripts/check-og.ts`.

Because this PR launches `moq.dev/huh` publicly for users to try, it adds a
follow-up quest with a `Maintainer:` item to try and promote `/huh`.

## Plan

Decided 2026-11-24 in [the epic](/quest/m2/huh/README.md):

- Non-standard flags: ✅ explicitly badge Sections 6, 7, and 8 as non-standard
  `moq-lite` / `moq-lite-07` / `moq-timestamp` features (rejected: unlabeled
  mix with IETF standard sections).
- Section 6: ✅ multi-region voice-call mesh comparing shortest-path routing,
  self-hosted/P2P hybrid links, and failover against centralized WebRTC SFU
  hairpinning (rejected: simple origin-to-3-edges fan-out only).
- Section 7: ✅ focus on `moq-lite-07` timestamp addressing (`Timescale`,
  frame `Timestamp`, `Time` anchors across misaligned tracks) (rejected:
  separate faster-than-real-time TTS section).
- Section 8: ✅ dedicated multi-subscriber `Subscriber Max Age` section showing
  different latency budgets sharing one broadcast and relay.
- Navigation: ✅ add `Huh?` to header nav, footer, and homepage hero button row
  without rewriting existing hero copy (rejected: dedicated homepage callout
  band; footer-only link).

Recommendations:

- Let the `huh?` cat companion react to both scroll position (current section)
  and user interactions across Sections 1–8, transitioning from confused
  (`huh?`) to enlightened (`oh!`), and allow clicking it to cycle poses.
- Unit-test pure routing/failover path selection, timestamp-to-group resolution,
  and multi-subscriber `max_age` expiration math with `bun test`.
- Check `src/lib/landing.test.ts` (and update if it asserts the exact homepage
  hero buttons or nav links) and verify on desktop and mobile in `just dev`.
