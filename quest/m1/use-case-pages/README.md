# Use-case marketing pages: robotics, contribution, distribution

## Goal

moq.dev has marketing landing pages for robotics, contribution, and
distribution, built on one shared template: `/robotics` is rebuilt from its
current blog-style MDX, and `/contribution` and `/distribution` are new. Each
argues what MoQ does better than the incumbents (WebRTC/RTP for robotics,
RTMP/SRT/WHIP for contribution, HLS/DASH for distribution). The homepage's
Robotics, Contribution, and Distribution cards link to them.

Out of scope: rewriting the moq docs' use-case pages
(`moq/doc/concept/use-case/`), new homepage copy, new hand-drawn art, and
deploying.

## Plan

Decided 2026-11-14 in planning, shared by all three pages:

- Pages: ✅ one standalone page per use case (rejected: one combined
  contribution/distribution page, bold sections inside existing pages). Each
  homepage card needs its own landing spot.
- Style: ✅ marketing landing page (rejected: keep the blog-style MDX and only
  add a hero; cards only with no figures). The user asked for /robotics to read
  less like a blog post and more like marketing. Layout, top to bottom:
  1. Hero: an "In prod" chip when the page has a production user, a display
     heading with a scribble, a one-line pitch, "Talk to us" and "Docs"
     buttons, art on the right.
  2. In Production: the `Users` cards for the use case, placed up front so the
     proof comes first.
  3. Why MoQ: an icon-tile card per argument, two or three lines each.
  4. Deep dives: two or three reused figures, a sentence each.
  5. CTA: the homepage's Self-host and moq.pro cards, the "Yours?" email line,
     and links to the long-version blog posts.
- Build the layout from the homepage's existing parts (`display`,
  `scribble`, `card`, `icon-tile`, `btn-green`, `btn-line`, `label`; see
  `src/pages/index.astro`). Card icons reuse `public/drawn/icon-*.svg` and
  `public/icons/use-case/`; figures reuse `public/blog/` art, and a figure may
  appear on more than one page.
- Copy: ✅ condense existing lines from the live /robotics page, the blog
  posts, and the moq docs; where a pitch line or heading has no existing
  source, the PR offers two or three plain options for the user to pick
  (rejected: fresh agent-written copy, with or without rewording the rule).
  This follows the AGENTS.md rule that a redesign keeps the live site's copy.
- Tone: ✅ keep the voice as is, profanity and jokes included, such as the
  "Shit Networks" heading and the kraken captions (rejected: keep the humor but
  drop profanity, neutral corporate).
- Overlap between pages: ✅ retell shared arguments (pull, backfill, fan-out,
  failover) in each use case's own terms and examples, linking to the page
  that goes deeper (rejected: one-line links instead of the argument, shared
  text components). Each page has to stand alone for a visitor arriving from
  its homepage card.
- Homepage cards keep their title and body copy; only `href` changes.
  [moq-dev/moq.dev#225](https://github.com/moq-dev/moq.dev/pull/225) also
  edits `src/pages/index.astro`; expect a small conflict.
- Claim only what has shipped. Check each feature claim against the `moq`
  submodule's docs (`doc/bin/`, `doc/concept/`) or code before writing it;
  the blog posts are older and partly out of date.
- Source material: the moq docs' use-case pages, and the blog posts
  "Replacing HLS/DASH", "Distribution @ Twitch", "You Don't Need It",
  "Cars 2", "On a Boat", "MoqBoy", "OpenAI still has a WebRTC Problem",
  "Update 00", and "Update 01".
