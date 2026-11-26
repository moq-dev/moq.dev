import { pages } from "../lib/pages";

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function GET() {
	const urls = pages().map(
		(page) => `<url><loc>${xml(page.url)}</loc>${page.date ? `<lastmod>${page.date}</lastmod>` : ""}</url>`,
	);

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
		{ headers: { "content-type": "application/xml; charset=utf-8" } },
	);
}
