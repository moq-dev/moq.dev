#!/usr/bin/env bun
// Sends a Resend broadcast for each newly added blog post listed in new_posts.txt
// (paths relative to repo root, one per line). Invoked by the GitHub Action
// .github/workflows/notify-new-post.yml on push to main.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const SITE = "https://moq.dev";
const FROM = "Media over QUIC <blog@moq.dev>";

const apiKey = requireEnv("RESEND_API_KEY");
const segmentId = requireEnv("RESEND_SEGMENT_ID");

const newPostsList = readFileSync("new_posts.txt", "utf8").trim();
if (!newPostsList) {
	console.log("No new posts. Exiting.");
	process.exit(0);
}

const paths = newPostsList.split("\n").filter(Boolean);
console.log(`Found ${paths.length} new post(s): ${paths.join(", ")}`);

for (const path of paths) {
	const slug = basename(path, ".mdx");
	const fm = parseFrontmatter(readFileSync(path, "utf8"));
	const title = fm.title ?? slug;
	const description = fm.description ?? "";
	const url = `${SITE}/blog/${slug}`;

	console.log(`Creating broadcast for "${title}" → ${url}`);

	const create = await fetch("https://api.resend.com/broadcasts", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			segment_id: segmentId,
			from: FROM,
			subject: title,
			html: renderHtml({ title, description, url }),
		}),
	});

	if (!create.ok) {
		const err = await create.text();
		throw new Error(`Resend broadcast create failed (${create.status}): ${err}`);
	}

	const { id } = (await create.json()) as { id: string };

	const send = await fetch(`https://api.resend.com/broadcasts/${id}/send`, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	if (!send.ok) {
		const err = await send.text();
		throw new Error(`Resend broadcast send failed (${send.status}): ${err}`);
	}

	console.log(`✓ Sent broadcast ${id} for "${title}"`);
}

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var: ${name}`);
	return v;
}

function parseFrontmatter(source: string): Record<string, string> {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return {};
	const out: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
	}
	return out;
}

function renderHtml({ title, description, url }: { title: string; description: string; url: string }): string {
	const safeTitle = escapeHtml(title);
	const safeDescription = escapeHtml(description);
	return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #1f2937;">
  <h1 style="margin: 0 0 16px;">${safeTitle}</h1>
  ${safeDescription ? `<p style="font-size: 16px; color: #4b5563;">${safeDescription}</p>` : ""}
  <p style="margin: 24px 0;">
    <a href="${url}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px;">Read it on moq.dev →</a>
  </p>
  <p style="font-size: 13px; color: #6b7280;">Or open it directly: <a href="${url}">${url}</a></p>
</body></html>`;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}
