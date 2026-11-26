# [XS] moq.dev's live robots.txt declares its content signals

## Goal

`https://moq.dev/robots.txt` answers with the `Content-Signal: search=yes,
ai-input=yes, ai-train=yes` line the site ships, not Cloudflare's managed
preamble, which declares no signal. The site already serves `/sitemap.xml`,
`/llms.txt`, and that robots.txt; the zone's managed robots.txt setting
prepends its own text to the file, so it has to be off.

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`): ✅ discovery files only,
no Markdown copies of these pages (rejected: Cloudflare's "Markdown for
Agents" zone toggle): the pages are prerendered HTML that agents already
read. ✅ All three content signals yes (rejected: `ai-train=no`; leaving them
unset), so models trained on the blog can recommend MoQ for a question that
doesn't name it.

No tofu in this repository or in moq-dev owns the zone, so the setting is the
maintainer's. After a live deploy, `curl https://moq.dev/robots.txt` should
show only the file in `public/robots.txt`.

## Waiting

- Maintainer: turn off the managed robots.txt (and its AI Crawl Control content-signals policy) for the `moq.dev` zone, which doc.moq.dev shares, in the Cloudflare dashboard; an agent cannot change live Cloudflare settings. Recommendation: turn it off after the next live deploy of this site; check with `curl https://moq.dev/robots.txt`, which should list the three `yes` signals and the sitemap.

## Related

- [moq-dev/moq: doc.moq.dev answers agents in Markdown](https://github.com/moq-dev/moq/blob/main/quest/m1/doc-markdown.md) - the docs half
