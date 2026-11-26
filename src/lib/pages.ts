// Every public page of moq.dev, read at build time so sitemap.xml and llms.txt list the same
// pages and a new one lands in both without an edit here. URLs end in a slash, as the layout declares them canonical.

import { SITE, SITE_DESCRIPTION } from "./site";

const sources = import.meta.glob<string>("../pages/**/*.{astro,mdx}", {
	eager: true,
	query: "?raw",
	import: "default",
});

export interface Page {
	url: string;
	title: string;
	description?: string;
	/** Publication date, used to order blog posts. */
	date?: string;
	blog: boolean;
}

// Frontmatter values are one line, plain or double-quoted.
function frontmatter(source: string, key: string): string | undefined {
	const head = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	const line = head.match(new RegExp(`^${key}: *(.+)$`, "m"))?.[1];
	if (line === undefined) return undefined;
	if (/^[>|]/.test(line)) throw new Error(`pages: multi-line ${key} is not supported`);
	return line.startsWith('"') ? JSON.parse(line) : line;
}

// A page built from a component passes its title and description as props.
function prop(source: string, key: string): string | undefined {
	const value = source.match(new RegExp(`\\s${key}="((?:[^"\\\\]|\\\\.)*)"`, "m"))?.[1];
	return value === undefined ? undefined : JSON.parse(`"${value}"`);
}

/** The home page, the other pages by path, then the blog posts newest first. */
export function pages(): Page[] {
	const found = Object.entries(sources).flatMap(([file, source]): Page[] => {
		const path = file.slice("../pages".length).replace(/\.(astro|mdx)$/, "");
		if (path === "/404" || path === "/index") return [];

		const mdx = file.endsWith(".mdx");
		const title = mdx ? frontmatter(source, "title") : prop(source, "title");
		if (!title) throw new Error(`pages: ${file} has no title`);

		return [
			{
				url: `${SITE}${path.replace(/\/index$/, "")}/`,
				title,
				description: (mdx ? frontmatter(source, "description") : prop(source, "description")) || undefined,
				date: mdx ? frontmatter(source, "date") : undefined,
				blog: path.startsWith("/blog/") && path !== "/blog/index",
			},
		];
	});

	const byUrl = (a: Page, b: Page) => a.url.localeCompare(b.url);
	const others = found.filter((page) => !page.blog).sort(byUrl);
	const posts = found
		.filter((page) => page.blog)
		.sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? "") || byUrl(a, b));

	return [
		{ url: `${SITE}/`, title: "Media over QUIC", description: SITE_DESCRIPTION, blog: false },
		...others,
		...posts,
	];
}
