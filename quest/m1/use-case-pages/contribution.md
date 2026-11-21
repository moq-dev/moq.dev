# [M] Contribution page

## Goal

`/contribution` makes the case for MoQ over RTMP, SRT, and WHIP for getting
live media from an encoder into the cloud, on the epic's template, and the
homepage's Contribution card links to it instead of the OBS docs.

## Plan

Decided 2026-11-14 in planning (layout, copy, and tone in the
[epic](/quest/m1/use-case-pages/README.md)). Approved section outline, one
Why MoQ card each, with figures for the deep dives:

1. **Pull, not Push**: nothing leaves the encoder until something subscribes;
   the long tail (a thousand cameras, three watched).
2. **Encode on Demand** (dynamic renditions): OBS simulcast renditions pause
   when the uplink can't fund them; a `moq-transcode` ladder encodes only the
   rungs someone pulls; MoQ Boy's encoders sleep with no subscriber. Figure:
   `moq-boy/bren2.svg`.
3. **Lossy Live, Pristine Archive** (real-time): the operator waits 100 ms,
   the recorder 30 s, on the same stream. Figure: `cars2/backfill.svg`.
4. **One Copy off the Truck** (mesh): a venue relay clusters with a CDN, so
   the expensive uplink carries each track once. Figure: `cars2/fanout.svg`.
5. **Failover**: announce over several connections or CDNs; subscriptions
   resume mid-group when a route dies (publisher instances). Figure:
   `on-a-boat/multipath.svg`.
6. **Bring Your Encoder**: the OBS plugin, RTMP/SRT/WHIP ingest, MPEG-TS with
   SCTE-35 kept; the same protocol both ways, so there's no transmux at the
   edge.

In Production shows the `Users` cards for `contribution` (Meta today). Meta
runs its own implementation of the standard, not the moq.dev libraries, so
the page must not imply otherwise. The hero chip may cite Meta's live ingest
talk.

## Required

- [Robotics rebuild](/quest/m1/use-case-pages/robotics.md) - the shared
  template this page fills in
