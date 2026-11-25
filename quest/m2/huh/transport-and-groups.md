# [M] Build /huh page shell and Sections 1–3 (QUIC, congestion, frames & groups)

## Goal

`src/pages/huh.astro` renders the vertical `/huh` explainer shell (anchor TOC,
standards-status badge styling, `MotionToggle` / reduced-motion handling) with
interactive SolidJS visuals for the first three sections—all flagged as IETF
standard:

1. **QUIC & Multiple Streams** (`Standard · RFC 9000`) — HTTP/2 over TCP vs.
   HTTP/3 & WebTransport over QUIC, with a "Drop a packet" trigger (reusing the
   site's kraken art) showing TCP head-of-line blocking vs. independent QUIC
   streams, plus the native QUIC / WebTransport / WebSocket fallback strip.
2. **Congestion & Prioritization** (`Standard · QUIC / IETF`) — ranked QUIC
   streams feeding a shared congestion-control funnel (`cwnd`), with controls
   to squeeze bandwidth, reorder stream priority (`▲`/`▼`), open a new stream,
   and `RESET` starved streams mid-flight (defaulting slightly congested so
   starvation is visible immediately).
3. **Frames & Groups** (`Standard · IETF MoQ`) — concise delta-encoding
   explanation (`I` keyframe + `P` deltas) paired with a contiguous timeline
   (zero gaps between groups) showing publisher frames trickling frame-by-frame
   over 1 QUIC stream per group into the receiver's video and higher-priority
   audio ribbons, with bandwidth and tail-reset controls.

The page renders cleanly at `/huh` on desktop and mobile in `just dev`, passes
`just check` and `just test`, and stays unlinked from navigation until Sections
4–8 land.

## Plan

Decided 2026-11-24 in [the epic](/quest/m2/huh/README.md):

- Layout: ✅ vertical top-to-bottom sections with anchor links, per-section
  interactive SolidJS toys (rejected: onion layer switcher; pinned
  scrollytelling).
- Section 1 vs. Section 2 split: ✅ put packet loss in Section 1 with an HTTP/3
  comparison where it is relevant, and focus Section 2 on congestion control,
  stream ranking, creation, and resets (rejected: fixating on packet loss as
  the main QUIC story).
- Section 3: ✅ show a contiguous timeline trickling frame-by-frame with delta
  encoding explained inline (rejected: discrete floating group pills; separate
  frame dependency graph section).

Recommendations:

- Put shared simulation helpers and section components under
  `src/components/huh/`, following `src/components/voice/diagram.tsx` for
  accessibility (`role="slider"` / keyboard support where applicable,
  `IntersectionObserver` auto-pause offscreen, `isStill()` for `MotionToggle`
  and `prefers-reduced-motion`).
- Pre-seed animation state so every diagram looks alive on first paint and
  useful when motion is paused.
- Unit-test pure simulation math (priority allocation, group trickling / tail
  reset) with `bun test`.
