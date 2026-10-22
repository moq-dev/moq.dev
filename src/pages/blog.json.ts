// Built with the site so the voice agent gets every post from the same release.
const posts = import.meta.glob<string>("./blog/*.mdx", {
	eager: true,
	query: "?raw",
	import: "default",
});

export function GET() {
	return Response.json({
		posts: Object.entries(posts)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([path, content]) => ({
				url: `https://moq.dev/blog/${path.slice("./blog/".length, -".mdx".length)}`,
				content,
			})),
	});
}
