# [S] Hand-drawn SVG art and rotoscoped huh? cat for /huh

## Goal

`public/huh/` contains hand-drawn-style SVGs traced with `just trace`: a set of
rotoscoped poses of the `huh?` cat from
`public/blog/webrtc-is-still-the-problem/huh.webm` (covering looking away /
sleeping, turning head `huh?`, leaning in `HUH?!`, and enlightened `oh!`) plus
a drawn `huh?` heading SVG matching `public/drawn/how.svg` and
`public/drawn/what.svg`. Only traced SVGs are committed (no raw PNGs).

## Plan

Decided 2026-11-24 in [the epic](/quest/m2/huh/README.md): ✅ rotoscope the
`huh?` cat from `public/blog/webrtc-is-still-the-problem/huh.webm` and add a
hand-drawn `huh?` header via `just trace` (rejected: reuse existing SVGs only).

Guidance:

- Extract key poses from `public/blog/webrtc-is-still-the-problem/huh.webm`
  (sideways look, head turn, close-up stare) and rotoscope them into flat-color
  drawings snapped to the site palette (`#fafafa`, `#00be2d`, `#a3a5a8`,
  `#000000`, transparent background) plus a fourth enlightened pose with Signal
  Green eyes so the cat can react across `/huh`'s sections.
- Run `just trace` on each PNG, visually compare the traced SVG against the
  source PNG per `AGENTS.md`, delete the PNGs, and commit only the SVGs under
  `public/huh/`.
- Keep the `huh?` cat SVGs compatible with the site's `boil` / `boil-always`
  animation classes and `MotionToggle` (`still` variant).
