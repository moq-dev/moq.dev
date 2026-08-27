import rss from "@astrojs/rss";

export async function GET(context) {
	// Get all blog posts
	const posts = await import.meta.glob("./blog/*.{md,mdx}", { eager: true });

	// Convert to array and sort by date (newest first)
	const sortedPosts = Object.values(posts)
		.filter((post) => post.frontmatter) // Ensure frontmatter exists
		.sort((a, b) => {
			const dateA = new Date(a.frontmatter.date);
			const dateB = new Date(b.frontmatter.date);
			return dateB - dateA; // Newest first
		})
		.map((post) => ({
			title: post.frontmatter.title,
			description: post.frontmatter.description,
			author: post.frontmatter.author,
			pubDate: new Date(post.frontmatter.date),
			link: post.url,
		}));

	return rss({
		title: "moq.dev | Blog",
		description: "Latest posts about Media over QUIC and real-time media streaming",
		site: context.site,
		items: sortedPosts,
		customData: "<language>en-us</language>",
	});
}
