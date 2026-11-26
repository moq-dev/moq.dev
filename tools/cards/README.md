# Announcement cards

Social cards for new open-source features, in the style Bun uses for its "in
the next version" posts: one headline, optionally a grid of facts or a code
block, 1200x675, posted as an image with a one-line caption. CDN announcements live in moq.pro's copy of this
tool, which shares the look.

| file | what it is |
| --- | --- |
| `cards.ts` | The cards. Add one entry per post; the comment at the top documents the fields and the inline markup. |
| `og.ts` | The committed OG cards and the fingerprint that flags a stale one. |
| `render.ts` | Renders each card to `out/<slug>.png` with the devshell's Playwright Chromium. Fails on a card whose content overflows rather than cropping it. |
| `public/icons/cards/` | Traced tile icons. A hand-drawn `public/drawn/icon-<name>.svg` takes precedence when present. |
| `jetbrains-mono-latin.woff2` | The code font, from moq.pro's splash page. The wordmark (`public/home/logo.svg`), underline stroke, and drawn icons come from the site. |

```sh
just cards            # every card
just cards e2ee       # one or more slugs
just cards --html     # also write out/<slug>.html, to tweak the layout in a browser
```

Change the look in `render.ts`, not per card.

`out/` is ignored. A card is retired from `cards.ts` once posted; the git
history keeps it.

## OG cards

The site's `og:image` cards are committed: `OG_CARDS` in `cards.ts` (the
default `public/layout/og.png` and one `public/og/page/<page>.png` per page),
plus one `public/og/blog/<slug>.png` per blog post, built from its frontmatter
by `og.ts`.

```sh
just og               # render every OG card at 1x into public/
just og og-blog-rind  # one or more slugs
```

`og.lock.json` records the inputs each card was rendered from. `bun test` fails
when a card is missing, orphaned, or stale (say, after a post's title changes),
so rerun `just og` and commit the PNGs with the lock.
