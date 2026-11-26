// The site's committed OG cards: the page cards in cards.ts plus one per blog
// post, built from its frontmatter. `just og` renders them; check-og.test.ts
// fails when a card's inputs changed since it was last rendered.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type Card, OG_CARDS } from "./cards.ts";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

// Maps each card's `ogOut` to the fingerprint of the inputs it was rendered
// from and the digest of the PNG that render wrote.
export const LOCK = join(ROOT, "tools/cards/og.lock.json");
export type Lock = Record<string, { inputs: string; png: string }>;

// A hex SHA-256 digest.
export function sha256(data: string | Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}

// A post's frontmatter block, parsed as the YAML it is.
function frontmatter(source: string): Record<string, string | undefined> {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) throw new Error("blog post has no frontmatter");
	return Bun.YAML.parse(match[1]) as Record<string, string | undefined>;
}

function blogCards(): Card[] {
	const dir = join(ROOT, "src/pages/blog");
	return readdirSync(dir)
		.filter((name) => name.endsWith(".mdx"))
		.sort()
		.map((name) => {
			const slug = basename(name, ".mdx");
			const fm = frontmatter(readFileSync(join(dir, name), "utf8"));
			const date = fm.date
				? new Date(fm.date).toLocaleDateString("en-US", {
						year: "numeric",
						month: "short",
						day: "numeric",
						timeZone: "UTC",
					})
				: undefined;
			return {
				slug: `og-blog-${slug}`,
				eyebrow: date,
				title: fm.title ?? slug,
				sub: fm.description,
				blogCover: fm.cover?.replace(/^\/+/, ""),
				url: `moq.dev/blog/${slug}`,
				note: fm.author ? `by ${fm.author}` : undefined,
				ogOut: `public/og/blog/${slug}.png`,
			};
		});
}

// Every committed OG card.
export function ogCards(): Card[] {
	return [...OG_CARDS, ...blogCards()];
}

// A hash of the card's fields and the art it embeds, so an edited title or
// redrawn cover marks its committed PNG stale.
export function fingerprint(card: Card): string {
	const hash = createHash("sha256").update(JSON.stringify(card));
	for (const art of [card.art, card.blogCover]) {
		if (art) hash.update(readFileSync(join(ROOT, "public", art)));
	}
	return hash.digest("hex");
}
