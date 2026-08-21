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
 * The pixel dimensions of an image, or undefined when its bytes don't match the
 * extension. Only the size matters here, so this validates headers rather than
 * pulling in an image library for a check that runs on a handful of files.
 */
export function dimensions(path: string, ext: string): { width: number; height: number } | undefined {
	const buf = readFileSync(path);

	// PNG: a fixed IHDR chunk, width and height as big-endian u32 at byte 16.
	if (
		ext === ".png" &&
		buf.length >= 24 &&
		buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
		buf.toString("ascii", 12, 16) === "IHDR"
	) {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}

	// JPEG: walk the segment chain to a start-of-frame marker, which carries the
	// dimensions. Segments are 0xFF, a marker byte, then a big-endian length.
	if ((ext === ".jpg" || ext === ".jpeg") && buf[0] === 0xff && buf[1] === 0xd8) {
		let at = 2;
		while (at < buf.length) {
			while (buf[at] === 0xff) at++;
			const marker = buf[at++];
			if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
			if (at + 2 > buf.length) break;

			const length = buf.readUInt16BE(at);
			if (length < 2 || at + length > buf.length) break;

			// SOF0-SOF15, excluding the DHT/JPG/DAC markers interleaved among them.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				if (length < 7) break;
				return { height: buf.readUInt16BE(at + 3), width: buf.readUInt16BE(at + 5) };
			}

			at += length;
		}
	}

	// GIF: the logical screen width and height follow the GIF87a/GIF89a header.
	if (ext === ".gif" && buf.length >= 10 && ["GIF87a", "GIF89a"].includes(buf.toString("ascii", 0, 6))) {
		return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
	}

	// WebP: validate the RIFF container and read dimensions from the payload used
	// by its lossy, lossless, or extended encoding.
	if (
		ext === ".webp" &&
		buf.length >= 20 &&
		buf.toString("ascii", 0, 4) === "RIFF" &&
		buf.toString("ascii", 8, 12) === "WEBP"
	) {
		const chunk = buf.toString("ascii", 12, 16);
		if (chunk === "VP8 " && buf.length >= 30 && buf.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
			return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
		}
		if (chunk === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
			return {
				width: 1 + buf[21] + ((buf[22] & 0x3f) << 8),
				height: 1 + ((buf[22] & 0xc0) >> 6) + (buf[23] << 2) + ((buf[24] & 0x0f) << 10),
			};
		}
		if (chunk === "VP8X" && buf.length >= 30) {
			return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
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

	const size = dimensions(path, ext);
	if (!size || size.width === 0 || size.height === 0) {
		return { ...none, errors: [`${key} is not a valid ${ext.slice(1).toUpperCase()} file: ${value}`] };
	}

	if (size.width < MIN_WIDTH || size.height < MIN_HEIGHT) {
		return {
			...none,
			warnings: [
				`${key} is ${size.width}x${size.height}, under the ${MIN_WIDTH}x${MIN_HEIGHT} needed for a large card, so it'll show as a thumbnail: ${value}`,
			],
		};
	}

	return none;
}

function main(): number {
	if (!existsSync(DIST)) {
		console.error(`no ${DIST}/ -- run \`astro build\` first`);
		return 1;
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
		return 1;
	}

	console.log(`Social cards OK across ${files.length} pages.`);
	return 0;
}

if (import.meta.main) process.exit(main());
