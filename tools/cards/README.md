# Announcement cards

Social cards for new open-source features, in the style Bun uses for its "in
the next version" posts: one headline, one code block, 1200x675, posted as an
image with a one-line caption. CDN announcements live in moq.pro's copy of this
tool, which shares the look.

| file | what it is |
| --- | --- |
| `cards.ts` | The cards. Add one entry per post; the comment at the top documents the fields and the inline markup. |
| `render.ts` | Renders each card to `out/<slug>.png` with the devshell's Playwright Chromium. Fails on a card whose content overflows rather than cropping it. |
| `underline.svg`, `jetbrains-mono-latin.woff2` | The hand-drawn underline and code font, copied from moq.pro's splash page. The wordmark is `public/home/logo.svg`. |

```sh
just cards            # every card
just cards e2ee       # one or more slugs
just cards --html     # also write out/<slug>.html, to tweak the layout in a browser
```

Change the look in `render.ts`, not per card.

`out/` is ignored. A card is retired from `cards.ts` once posted; the git
history keeps it.
