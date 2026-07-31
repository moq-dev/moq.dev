#!/usr/bin/env bun
// Sends a Resend broadcast for each blog post that goes live in a deploy.
//
// Invoked by `just deploy live` in two phases, around the wrangler upload:
//
//   snapshot - records which posts the live site already serves
//   send     - mails every post in the new build that the snapshot didn't have
//
// Deploys are manual, so there is no push event to diff against. Both sides of
// the diff are RSS feeds instead: the live one for what subscribers have already
// been told about, and the freshly built dist/rss.xml for what this deploy puts
// up. Reading the build rather than src/pages/blog keeps the mail honest, since
// it announces what actually shipped and reuses the exact title and description
// the feed carries.
//
// Only the `live` env notifies; staging is a no-op. Anything that leaves us
// unsure which posts are new (unreachable feed, missing snapshot, missing build)
// skips sending rather than guessing, because a broadcast cannot be recalled.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SITE = "https://moq.dev";
const FROM = "Media over QUIC <blog@moq.dev>";
const BUILT_FEED = "dist/rss.xml";
const SNAPSHOT = join(tmpdir(), "moq-dev-published-slugs.json");

// A snapshot only describes the feed at the moment it was taken. Past this, assume
// the site moved on under us and refuse to treat it as "what was already live".
const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 15000;

interface Post {
	slug: string;
	title: string;
	description: string;
	url: string;
}

const [phase, ...rest] = process.argv.slice(2);
const env = flag(rest, "--env") ?? "staging";

if (phase === "snapshot") {
	await snapshot();
} else if (phase === "send") {
	await send();
} else {
	console.error("Usage: notify-subscribers.ts <snapshot|send> --env <name>");
	process.exit(2);
}

// Record the slugs the live site serves right now, before the deploy replaces it.
async function snapshot() {
	// Leave nothing behind for `send` to misread as this deploy's baseline.
	rmSync(SNAPSHOT, { force: true });

	if (env !== "live") {
		console.log(`[notify] env=${env}, skipping (only live announces).`);
		return;
	}

	let slugs: string[];
	try {
		const res = await fetch(`${SITE}/rss.xml`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		slugs = parseFeed(await res.text()).map((p) => p.slug);
	} catch (err) {
		// Deploying is still the right thing to do; we just can't safely say what's new.
		console.warn(`[notify] could not read ${SITE}/rss.xml: ${err instanceof Error ? err.message : err}`);
		console.warn("[notify] no announcement will be sent for this deploy.");
		return;
	}

	// An empty feed is far more likely to be a broken site than a blog with no posts,
	// and treating it as "nothing is live" would mail the entire back catalogue.
	if (slugs.length === 0) {
		console.warn("[notify] live feed listed no posts, refusing to treat that as an empty blog.");
		console.warn("[notify] no announcement will be sent for this deploy.");
		return;
	}

	writeFileSync(SNAPSHOT, JSON.stringify({ at: Date.now(), slugs }));
	console.log(`[notify] ${slugs.length} post(s) already live.`);
}

// Mail every post this deploy added.
async function send() {
	if (env !== "live") return;

	if (!existsSync(SNAPSHOT)) {
		console.warn("[notify] no snapshot from this deploy, skipping the announcement.");
		return;
	}

	const { at, slugs } = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { at: number; slugs: string[] };

	// Consume it either way: a snapshot must never outlive the deploy that took it.
	rmSync(SNAPSHOT, { force: true });

	if (Date.now() - at > SNAPSHOT_MAX_AGE_MS) {
		console.warn("[notify] snapshot is stale, skipping the announcement.");
		return;
	}

	if (!existsSync(BUILT_FEED)) {
		console.warn(`[notify] ${BUILT_FEED} is missing, skipping the announcement.`);
		return;
	}

	const published = new Set(slugs);
	const added = parseFeed(readFileSync(BUILT_FEED, "utf8")).filter((p) => !published.has(p.slug));

	if (added.length === 0) {
		console.log("[notify] no new posts.");
		return;
	}

	console.log(`[notify] announcing ${added.length} new post(s): ${added.map((p) => p.slug).join(", ")}`);

	// Deploy already succeeded, so surface a missing key loudly instead of failing quietly.
	const apiKey = requireEnv("RESEND_API_KEY");
	const segmentId = requireEnv("RESEND_SEGMENT_ID");

	for (const post of added) {
		console.log(`Creating broadcast for "${post.title}" → ${post.url}`);

		const create = await fetch("https://api.resend.com/broadcasts", {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				segment_id: segmentId,
				from: FROM,
				subject: post.title,
				html: renderHtml(post),
			}),
		});

		if (!create.ok) {
			const err = await create.text();
			throw new Error(`Resend broadcast create failed (${create.status}): ${err}`);
		}

		const { id } = (await create.json()) as { id: string };

		const sent = await fetch(`https://api.resend.com/broadcasts/${id}/send`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		if (!sent.ok) {
			const err = await sent.text();
			throw new Error(`Resend broadcast send failed (${sent.status}): ${err}`);
		}

		console.log(`✓ Sent broadcast ${id} for "${post.title}"`);
	}
}

// Pull the blog items out of an RSS feed. Both the live feed and the built one are
// generated by src/pages/rss.xml.js, so the same shape parses either.
function parseFeed(xml: string): Post[] {
	const posts: Post[] = [];

	for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
		const body = item[1];
		const url = tag(body, "link");
		if (!url) continue;

		const slug = url.match(/\/blog\/([^/]+)\/?$/)?.[1];
		if (!slug) continue;

		posts.push({
			slug: decodeURIComponent(slug),
			title: unescapeXml(tag(body, "title") ?? slug),
			description: unescapeXml(tag(body, "description") ?? ""),
			url,
		});
	}

	return posts;
}

function tag(xml: string, name: string): string | undefined {
	// CDATA is not emitted today, but @astrojs/rss switches to it whenever a value
	// contains markup, so handle both rather than silently dropping such a post.
	const match = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${name}>`));
	return match ? (match[1] ?? match[2]) : undefined;
}

function unescapeXml(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

function flag(argv: string[], name: string): string | undefined {
	const i = argv.indexOf(name);
	return i === -1 ? undefined : argv[i + 1];
}

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var: ${name} (the deploy succeeded; the announcement did not go out)`);
	return v;
}

function renderHtml({ title, description, url }: Post): string {
	const safeTitle = escapeHtml(title);
	const safeDescription = escapeHtml(description);
	const safeUrl = escapeHtml(url);
	return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #1f2937;">
  <h1 style="margin: 0 0 16px;">${safeTitle}</h1>
  ${safeDescription ? `<p style="font-size: 16px; color: #4b5563;">${safeDescription}</p>` : ""}
  <p style="margin: 24px 0;">
    <a href="${safeUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px;">Read it on moq.dev →</a>
  </p>
  <p style="font-size: 13px; color: #6b7280;">Or open it directly: <a href="${safeUrl}">${safeUrl}</a></p>
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
