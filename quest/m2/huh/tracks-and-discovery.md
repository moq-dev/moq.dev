# [M] Add /huh Sections 4–5 (on-demand tracks and broadcast discovery gossip)

## Goal

The `/huh` page (`src/unreleased/huh.astro`, served in dev and staging but not
live builds) includes interactive SolidJS visuals for Sections 4 and 5:

4. **Tracks: Media & Arbitrary Data on Demand** (`Standard + hang`) — an
   interactive broadcast track rack (`video/1080p`, `video/480p`, second camera
   track, `audio`, `captions`, and arbitrary app data such as `controls.json`)
   beside a live `catalog.json` view and uplink bandwidth meter. Unsubscribed
   tracks visibly sleep (`0 kbps`, encoder idle); toggling subscriptions or
   presets wakes only the pulled tracks, and an E2EE toggle—explicitly labeled
   as the separate `moq-e2ee` project draft rather than part of `hang` or IETF
   `moq-transport`—shows relays forwarding opaque ciphertext without parsing
   payloads.
5. **Broadcasts & Live Discovery** (`Standard + extensions`) — an interactive
   namespace prefix-gossip playground where publishers announce paths (e.g.
   `room/alice`, `room/bob`, `room/carol`, `boat/cam-1`) through a relay mesh
   to subscribers watching prefixes (`room/*`, `boat/*`). Toggling publishers
   online/offline animates `ANNOUNCE` / withdrawal gossip and updates matching
   live rosters immediately with zero polling, room server, or SDP, while
   highlighting that sessions are bidirectional.

Both sections respect `MotionToggle` and `prefers-reduced-motion`, work cleanly
on desktop and mobile in `just dev`, and pass `just check` and `just test`.

## Plan

Decided 2026-11-24 in [the epic](/quest/m2/huh/README.md):

- Media + arbitrary data combined: ✅ explain media renditions, captions,
  pull-on-demand sleeping encoders, E2EE, and arbitrary app data tracks in
  Section 4 (rejected: separate "Your App" section; separate "Media" layer).
- Discovery: ✅ include a dedicated section explaining broadcasts/namespaces
  and live `ANNOUNCE` gossip so visitors see how publishers and subscribers
  find each other without a room server or SDP.

Recommendations:

- Reuse the section shell (`src/components/huh/section.astro`), standards
  badge (`badge.astro`), and diagram helpers (`clock.ts` for the motion-aware
  animation loop and pre-seeding, `ui.tsx` for the figure card, buttons,
  sliders, and palette) that Sections 1–3 established, with pure simulation
  math beside each diagram and unit-tested like `hol.ts` / `priority.ts` /
  `groups.ts`.
- Keep the Standards badge accurate against `moq/doc/concept/standard.md`
  (pull-on-demand tracks and namespace announcements are IETF `moq-transport`;
  the `hang` catalog and prefix-route gossip / `solicit` / `active-count`
  extensions are project drafts).
