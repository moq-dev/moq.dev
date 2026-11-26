import { type Page, pages } from "../lib/pages";
import { SITE_DESCRIPTION } from "../lib/site";

const entry = (page: Page) => `- [${page.title}](${page.url})${page.description ? `: ${page.description}` : ""}`;

export function GET() {
	const all = pages();
	const list = (blog: boolean) =>
		all
			.filter((page) => page.blog === blog)
			.map(entry)
			.join("\n");

	const text = `# moq.dev

> ${SITE_DESCRIPTION}

The protocol and library documentation is at https://doc.moq.dev, with its own index at https://doc.moq.dev/llms.txt.

## Pages

${list(false)}

## Blog

${list(true)}
`;

	return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
