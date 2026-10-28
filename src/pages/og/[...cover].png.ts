import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";

// Scrapers won't render an SVG cover, so global.astro points og:image here and
// each one is rendered to PNG on the site's background at build time.
export const getStaticPaths = (() => {
	const posts = import.meta.glob<{ frontmatter: { cover?: string } }>("../blog/*.mdx", { eager: true });
	return Object.values(posts)
		.map((post) => post.frontmatter.cover)
		.filter((cover): cover is string => cover?.endsWith(".svg") ?? false)
		.map((cover) => ({ params: { cover: cover.slice(1, -".svg".length) } }));
}) satisfies GetStaticPaths;

// The width every scraper's large card is laid out for.
const WIDTH = 1200;

export const GET: APIRoute = async ({ params }) => {
	const svg = `public/${params.cover}.svg`;
	const { width } = await sharp(svg).metadata();
	if (!width) throw new Error(`${svg} has no width`);
	const png = await sharp(svg, { density: (72 * WIDTH) / width })
		.flatten({ background: "#0f172a" })
		.png()
		.toBuffer();
	return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
