# [M] Rebuild /robotics as a marketing page on a shared template

## Goal

`/robotics` is a marketing landing page in the epic's layout instead of a
blog-style MDX article, built on a template that `/contribution` and
`/distribution` reuse with their own content. The URL, the `Users` cards, and
the homepage card's link stay as they are.

## Plan

Decided 2026-11-14 in planning (layout, copy, and tone in the
[epic](/quest/m1/use-case-pages/README.md)):

- Hero chip: the existing "Saronic ships MoQ on its autonomous boats" line.
  Hero art: the kraken or boat from `public/blog/on-a-boat/`.
- Why MoQ cards, one per current section: Pull, not Push / Shit Networks
  (you decide what gives) / Lossy live, pristine archive (backfill) / Bonded
  Pairs / Fan Out / Not Just Media. Card copy is condensed from the current
  page.
- Deep dives: `cars2/backfill.svg`, `on-a-boat/fanout.svg`, and the MoQ Boy
  demo link.
- CTA links the long versions: "On a Boat" (`src/pages/blog/on-a-boat.mdx`) and
  "Cars 2" (`src/pages/blog/cars2.mdx`).

Recommendation: make the template a layout or component that takes each
page's hero, cards, figures, and `Users` filter as data, so the three pages
can't drift apart. Converting `/robotics` from `.mdx` to `.astro` is fine.
