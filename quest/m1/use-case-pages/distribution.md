# [M] Distribution page

## Goal

`/distribution` makes the case for MoQ over HLS and DASH for delivering live
media to viewers, on the epic's template, and the homepage's Distribution card
links to it instead of the "Replacing HLS/DASH" post.

## Plan

Decided 2026-11-14 in planning (layout, copy, and tone in the
[epic](/quest/m1/use-case-pages/README.md)). Approved section outline, one
Why MoQ card each, with figures for the deep dives:

1. **Skip, don't Buffer** (real-time): groups ride QUIC streams, newest
   first; congestion costs a skip instead of the spinny boye. Figure:
   `replacing-hls-dash/buffering.gif`.
2. **Pick Your Latency**: on the same broadcast the bettor waits 100 ms and
   the couch 10 s; one stack instead of HLS plus WebRTC. Figure:
   `cars2/speed2.svg`.
3. **Renditions on Demand** (dynamic): ABR switches at any group, not at
   segment ends; the catalog is live, so a 1080p or AV1 rendition can be added
   mid-broadcast; `moq-transcode` encodes only the rungs viewers watch.
   Figure: `moq-boy/bren.svg`.
4. **Fan Out** (mesh, pull): relays merge subscriptions, cluster by hops, and
   can use several CDNs at once (moq.pro and Cloudflare). Figure:
   `open-for-business/viewers-1000.svg`.
5. **Keep Your HLS**: HLS and DASH served from the relay's cache, plus RTMP,
   SRT, and WHEP playback, so clients migrate one at a time.

In Production: ✅ omitted until a distribution user can be named (rejected:
showing every user, which blurs the page; naming a user now). No hero chip
for the same reason. Keep the "Yours?" line.

## Required

- [Robotics rebuild](/quest/m1/use-case-pages/robotics.md) - the shared
  template this page fills in
