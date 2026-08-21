#!/usr/bin/env bun
// Asserts every built page carries a social card that scrapers can actually render.
//
// Run in CI after `astro build`. It reads dist/, not src/, because the tags are
// assembled in the layout from frontmatter and only the built HTML shows what a
// scraper will really see.
//
// The bug that prompted this: a post shipped with `cover: ".../viewers-1000.svg"`.
// Nothing complained -- the file existed, the path was right, the page rendered --
// but no scraper renders SVG for a card, so the link unfurled bare. Biome and tsc
// can't see a problem like that, and neither can a build, so a check that opens
// the referenced image is the only thing that catches it.
//
// The rules below are what the major scrapers (X, Facebook, LinkedIn, Slack,
// Discord, iMessage) agree on, so they're deliberately loose: a page fails only
// when a card is genuinely broken, never on style.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";

// Every card needs these. og:image is the one that breaks loudly, but a missing
// title or url unfurls just as badly.
const REQUIRED = ["og:title", "og:description", "og:url", "og:image"];

// Raster only. SVG is the trap: it's a perfectly good image everywhere else on
// the site, and every scraper refuses it.
const RASTER = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

// X's floor for summary_large_image, which is the card type the layout asks for.
// Anything smaller silently downgrades to a thumbnail.
const MIN_WIDTH = 300;
const MIN_HEIGHT = 157;

/** Every .html file under dist, recursively. */
function pages(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return pages(path);
		return entry.name.endsWith(".html") ? [path] : [];
	});
}

/** The content of <meta property|name="..."> tags, keyed by property. */
function metas(html: string): Map<string, string> {
	const found = new Map<string, string>();
	const tag = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g;

	for (const [, key, value] of html.matchAll(tag)) {
		found.set(key, value);
	}

	return found;
}

/**
 * The pixel dimensions of a PNG or JPEG, or undefined for formats we don't
 * parse. Only the size matters here, so this reads headers rather than pulling
 * in an image library for a check that runs on a handful of files.
 */
function dimensions(path: string): { width: number; height: number } | undefined {
	const buf = readFileSync(path);

	// PNG: a fixed IHDR chunk, width and height as big-endian u32 at byte 16.
	if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}

	// JPEG: walk the segment chain to a start-of-frame marker, which carries the
	// dimensions. Segments are 0xFF, a marker byte, then a big-endian length.
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let at = 2;
		while (at + 9 < buf.length) {
			if (buf[at] !== 0xff) break;
			const marker = buf[at + 1];
			const length = buf.readUInt16BE(at + 2);

			// SOF0-SOF15, excluding the DHT/JPG/DAC markers interleaved among them.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
			}

			at += 2 + length;
		}
	}

	return undefined;
}

/**
 * What's wrong with one image reference. Errors mean the card is broken and the
 * image won't appear at all; warnings mean it still renders, just worse. Only
 * errors fail the build, because a small cover is a judgement call the author
 * gets to make and an unrenderable one isn't.
 */
function checkImage(key: string, value: string): { errors: string[]; warnings: string[] } {
	const none = { errors: [], warnings: [] };

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		// Relative paths resolve against the scraper's idea of the page, which is
		// often nothing at all. They have to be absolute.
		return { ...none, errors: [`${key} is not an absolute URL: ${value}`] };
	}

	if (url.protocol !== "https:") {
		return { ...none, errors: [`${key} is not https: ${value}`] };
	}

	const ext = (url.pathname.match(/\.[^./]+$/)?.[0] ?? "").toLowerCase();
	if (!RASTER.has(ext)) {
		return { ...none, errors: [`${key} is ${ext || "extensionless"}, which scrapers won't render: ${value}`] };
	}

	// Every image the sites reference is served from the same build, so the
	// pathname doubles as its location in dist. An off-origin image would need
	// fetching instead, and none exists yet.
	const path = join(DIST, url.pathname);
	if (!existsSync(path) || !statSync(path).isFile()) {
		return { ...none, errors: [`${key} has no file at ${path}: ${value}`] };
	}

	const size = dimensions(path);
	if (size && (size.width < MIN_WIDTH || size.height < MIN_HEIGHT)) {
		return {
			...none,
			warnings: [
				`${key} is ${size.width}x${size.height}, under the ${MIN_WIDTH}x${MIN_HEIGHT} needed for a large card, so it'll show as a thumbnail: ${value}`,
			],
		};
	}

	return none;
}

if (!existsSync(DIST)) {
	console.error(`no ${DIST}/ -- run \`astro build\` first`);
	process.exit(1);
}

const broken: string[] = [];
const degraded: string[] = [];
const files = pages(DIST);

for (const file of files) {
	const found = metas(readFileSync(file, "utf8"));
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const key of REQUIRED) {
		if (!found.get(key)) errors.push(`missing ${key}`);
	}

	// twitter:image is optional -- without it a card falls back to og:image, which
	// is fine. It just has to be valid when a page does set it.
	for (const key of ["og:image", "twitter:image"]) {
		const value = found.get(key);
		if (!value) continue;

		const result = checkImage(key, value);
		errors.push(...result.errors);
		warnings.push(...result.warnings);
	}

	const list = (problems: string[]) => `${file}\n${problems.map((p) => `  ${p}`).join("\n")}`;
	if (errors.length) broken.push(list(errors));
	if (warnings.length) degraded.push(list(warnings));
}

if (degraded.length) {
	console.warn(`Social cards that render smaller than they could, in ${degraded.length} of ${files.length} pages:\n`);
	console.warn(`${degraded.join("\n\n")}\n`);
}

if (broken.length) {
	console.error(`Broken social cards in ${broken.length} of ${files.length} pages:\n`);
	console.error(`${broken.join("\n\n")}\n`);
	process.exit(1);
}

console.log(`Social cards OK across ${files.length} pages.`);
