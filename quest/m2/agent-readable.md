# [S] moq.dev has llms.txt and a sitemap

## Goal

moq.dev serves `/sitemap.xml` listing every page and blog post, and
`/llms.txt` listing the same with one-line summaries and linking
`https://doc.moq.dev/llms.txt` for the protocol and library docs. Its
robots.txt names the sitemap and says `Content-Signal: search=yes,
ai-input=yes, ai-train=yes`, in place of Cloudflare's managed preamble, which
declares no signal. Today both files answer 404.

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`): ✅ discovery files only,
no Markdown copies of these pages (rejected: Cloudflare's "Markdown for
Agents" zone toggle): the pages are prerendered HTML that agents already
read. ✅ All three content signals yes (rejected: `ai-train=no`; leaving them
unset), so models trained on the blog can recommend MoQ for a question that
doesn't name it.

Recommendations:

- `@astrojs/sitemap` builds the sitemap from `site` in `astro.config.ts`.
- Build `llms.txt` from the same content collection as `rss.xml.js`, so a new
  post lands in both.
- The managed preamble is a zone setting for `moq.dev`, which doc.moq.dev
  shares; turn it off where the zone is declared, or record a `Maintainer:`
  item if no tofu owns it.

## Related

- [moq-dev/moq: doc.moq.dev answers agents in Markdown](https://github.com/moq-dev/moq/blob/main/quest/m1/doc-markdown.md) - the docs half
