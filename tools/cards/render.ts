#!/usr/bin/env bun
// Renders the announcement cards in cards.ts to PNG with the devshell's
// Playwright Chromium. Run from the devshell:
//
//   just cards            # every card -> tools/cards/out/<slug>.png
//   just cards e2ee   # one or more slugs
//   just cards --html     # also keep the HTML, to tweak in a browser
//
// The look is moq.pro's splash page, shared with moq.pro's copy of this tool:
// slate grid wash, bold system-font headline, JetBrains Mono for code.
//
//   just og               # every OG card -> public/og/ and public/layout/og.png

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import { CARDS, type Card, type Lang } from "./cards.ts";
import { fingerprint, LOCK, ogCards } from "./og.ts";

// X renders summary_large_image at 1200x675; every other network is happy with
// 16:9 too. 2x device pixels so the text stays crisp when the network re-encodes.
const WIDTH = 1200;
const HEIGHT = 675;
const SCALE = 2;

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "out");

// Static assets are inlined as data URLs so the page is one self-contained
// string: no server, and `--html` output opens from anywhere.
function dataUrl(path: string, type: string): string {
	return `data:${type};base64,${readFileSync(path).toString("base64")}`;
}

const LOGO = dataUrl(join(ROOT, "public/home/logo.svg"), "image/svg+xml");
const FONT = dataUrl(join(HERE, "jetbrains-mono-latin.woff2"), "font/woff2");
const FONT_DISPLAY = dataUrl(join(ROOT, "src/assets/fonts/bricolage-grotesque-latin.woff2"), "font/woff2");
const FONT_SANS = dataUrl(join(ROOT, "src/assets/fonts/dm-sans-latin.woff2"), "font/woff2");
const FONT_DM_MONO = dataUrl(join(ROOT, "src/assets/fonts/dm-mono-500-latin.woff2"), "font/woff2");

function svgData(relPath: string): string {
	return dataUrl(join(ROOT, "public", relPath), "image/svg+xml");
}

const MIME_BY_EXT: Record<string, string> = {
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

function publicDataUrl(relPath: string): string {
	const clean = relPath.replace(/^\/+/, "");
	const ext = extname(clean).toLowerCase();
	const mime = MIME_BY_EXT[ext];
	if (!mime) throw new Error(`unsupported cover format ${ext} for ${relPath}`);
	return dataUrl(join(ROOT, "public", clean), mime);
}

// Deterministic hand-drawn relay mesh artwork for the site's default og:image,
// mirroring the live interactive hero mesh on moq.dev.
function meshArt(): string {
	type Relay = { x: number; y: number; label: string; glow?: string; rings?: number[] };
	type Peer = { x: number; y: number; icon: string; kind: "video" | "audio" | "data"; label?: string; relay: number };

	const RGB = { video: "74, 222, 128", audio: "125, 211, 252", data: "252, 211, 77" } as const;
	const HEX = { video: "#4ade80", audio: "#7dd3fc", data: "#fcd34d" } as const;

	const relays: Relay[] = [
		{ x: 642, y: 122, label: "relay.iad" },
		{ x: 774, y: 344, label: "relay.lhr", glow: RGB.video, rings: [42, 62] },
		{ x: 1054, y: 178, label: "relay.fra", glow: RGB.audio, rings: [38] },
		{ x: 1034, y: 492, label: "relay.sin", glow: RGB.data, rings: [40] },
		{ x: 724, y: 586, label: "relay.ord" },
	];

	const backbone: Array<{ a: number; b: number; qx: number; qy: number; glow?: "video" | "audio" | "data" }> = [
		{ a: 0, b: 1, qx: 690, qy: 238, glow: "video" },
		{ a: 0, b: 2, qx: 860, qy: 120 },
		{ a: 1, b: 2, qx: 918, qy: 235, glow: "audio" },
		{ a: 1, b: 3, qx: 912, qy: 444, glow: "data" },
		{ a: 2, b: 3, qx: 1074, qy: 336, glow: "video" },
		{ a: 1, b: 4, qx: 730, qy: 468 },
		{ a: 4, b: 3, qx: 888, qy: 562, glow: "video" },
	];

	const peers: Peer[] = [
		{ x: 878, y: 84, icon: "icons/cards/snapshot.svg", kind: "video", label: "cam-01", relay: 0 },
		{ x: 938, y: 312, icon: "demo/moqboy.svg", kind: "data", label: "moq-boy", relay: 1 },
		{ x: 918, y: 582, icon: "demo/carla.svg", kind: "video", label: "carla-sim", relay: 3 },
		{ x: 1084, y: 342, icon: "voice/ai.svg", kind: "audio", label: "voice-ai", relay: 2 },
		{ x: 644, y: 470, icon: "icons/cards/mic.svg", kind: "audio", label: "mic-04", relay: 1 },
		{ x: 1122, y: 84, icon: "icons/cards/window.svg", kind: "video", relay: 2 },
		{ x: 1138, y: 586, icon: "blog/open-for-business/viewers-1.svg", kind: "video", relay: 3 },
		{ x: 804, y: 196, icon: "icons/use-case/robotics.svg", kind: "video", label: "robot-07", relay: 1 },
		{ x: 1022, y: 66, icon: "icons/use-case/contribution.svg", kind: "video", relay: 2 },
		{ x: 834, y: 480, icon: "icons/cards/linux.svg", kind: "audio", relay: 4 },
		{ x: 1140, y: 244, icon: "icons/cards/apple.svg", kind: "audio", relay: 2 },
		{ x: 992, y: 404, icon: "icons/use-case/conferencing.svg", kind: "audio", relay: 3 },
	];

	const quadPt = (ax: number, ay: number, qx: number, qy: number, bx: number, by: number, t: number) => {
		const u = 1 - t;
		return { x: u * u * ax + 2 * u * t * qx + t * t * bx, y: u * u * ay + 2 * u * t * qy + t * t * by };
	};

	const videoTrain = (ax: number, ay: number, qx: number, qy: number, bx: number, by: number, t: number) => {
		const at = quadPt(ax, ay, qx, qy, bx, by, t);
		const prev = quadPt(ax, ay, qx, qy, bx, by, Math.max(0, t - 0.04));
		const angle = (Math.atan2(at.y - prev.y, at.x - prev.x) * 180) / Math.PI;
		const len = Math.hypot(at.x - prev.x, at.y - prev.y) || 1;
		const ux = (at.x - prev.x) / len;
		const uy = (at.y - prev.y) / len;
		return [0, 1, 2]
			.map((i) => {
				const fx = at.x - ux * i * 11;
				const fy = at.y - uy * i * 11;
				return `<rect x="${(fx - 5).toFixed(1)}" y="${(fy - 3.6).toFixed(1)}" width="10" height="7.2" rx="1.5" fill="${HEX.video}" opacity="${(0.95 - i * 0.28).toFixed(2)}" transform="rotate(${angle.toFixed(1)} ${fx.toFixed(1)} ${fy.toFixed(1)})"/>`;
			})
			.join("");
	};

	const audioWave = (ax: number, ay: number, qx: number, qy: number, bx: number, by: number, t: number) => {
		const at = quadPt(ax, ay, qx, qy, bx, by, t);
		const prev = quadPt(ax, ay, qx, qy, bx, by, Math.max(0, t - 0.05));
		const len = Math.hypot(at.x - prev.x, at.y - prev.y) || 1;
		const ux = (at.x - prev.x) / len;
		const uy = (at.y - prev.y) / len;
		const pts: string[] = [];
		for (let i = 0; i <= 30; i += 2) {
			const off = Math.sin(i * 0.65) * Math.sin((i / 30) * Math.PI) * 5.8;
			const px = at.x - ux * i - uy * off;
			const py = at.y - uy * i + ux * off;
			pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
		}
		return `<path d="${pts.join(" ")}" fill="none" stroke="${HEX.audio}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${at.x.toFixed(1)}" cy="${at.y.toFixed(1)}" r="3" fill="${HEX.audio}"/>`;
	};

	const dataComet = (
		ax: number,
		ay: number,
		qx: number,
		qy: number,
		bx: number,
		by: number,
		t: number,
		word: string,
	) => {
		const at = quadPt(ax, ay, qx, qy, bx, by, t);
		const tail = quadPt(ax, ay, qx, qy, bx, by, Math.max(0, t - 0.22));
		return `<line x1="${tail.x.toFixed(1)}" y1="${tail.y.toFixed(1)}" x2="${at.x.toFixed(1)}" y2="${at.y.toFixed(1)}" stroke="${HEX.data}" stroke-width="2.6" stroke-linecap="round" opacity="0.72"/><circle cx="${at.x.toFixed(1)}" cy="${at.y.toFixed(1)}" r="3.4" fill="${HEX.data}"/><text x="${(at.x + 8).toFixed(1)}" y="${(at.y - 7).toFixed(1)}" fill="${HEX.data}" font-family="'DM Mono', monospace" font-size="12" font-weight="500">${word}</text>`;
	};

	const accessSvg = peers
		.map((p) => {
			const r = relays[p.relay];
			return `<line x1="${p.x}" y1="${p.y}" x2="${r.x}" y2="${r.y}" stroke="rgba(${RGB[p.kind]},0.34)" stroke-width="1.4"/>`;
		})
		.join("");

	const backboneSvg = backbone
		.map((e) => {
			const a = relays[e.a];
			const b = relays[e.b];
			const d = `M${a.x},${a.y} Q${e.qx},${e.qy} ${b.x},${b.y}`;
			const glow = e.glow
				? `<path d="${d}" fill="none" stroke="rgba(${RGB[e.glow]},0.52)" stroke-width="3" filter="url(#og-glow)"/>`
				: "";
			return `<path d="${d}" fill="none" stroke="rgba(100,116,139,0.42)" stroke-width="1.6"/>${glow}`;
		})
		.join("");

	const packetsSvg = [
		videoTrain(relays[0].x, relays[0].y, 690, 238, relays[1].x, relays[1].y, 0.56),
		videoTrain(relays[2].x, relays[2].y, 1074, 336, relays[3].x, relays[3].y, 0.44),
		videoTrain(relays[4].x, relays[4].y, 888, 562, relays[3].x, relays[3].y, 0.62),
		audioWave(relays[1].x, relays[1].y, 918, 235, relays[2].x, relays[2].y, 0.58),
		audioWave(
			peers[4].x,
			peers[4].y,
			(peers[4].x + relays[1].x) / 2,
			(peers[4].y + relays[1].y) / 2,
			relays[1].x,
			relays[1].y,
			0.56,
		),
		dataComet(relays[1].x, relays[1].y, 912, 444, relays[3].x, relays[3].y, 0.54, "subscribe"),
		dataComet(
			peers[1].x,
			peers[1].y,
			(peers[1].x + relays[1].x) / 2,
			(peers[1].y + relays[1].y) / 2,
			relays[1].x,
			relays[1].y,
			0.48,
			"live",
		),
	].join("");

	const globeHref = svgData("drawn/icon-globe.svg");
	const peersSvg = peers
		.map((p) => {
			const size = p.label ? 30 : 24;
			const padR = size * 0.56 + 4;
			const href = svgData(p.icon);
			const label = p.label
				? `<text x="${(p.x + padR + 6).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" fill="rgba(203,213,225,0.88)" font-family="'DM Mono', monospace" font-size="12" font-weight="500">${p.label}</text>`
				: "";
			return `<g><circle cx="${p.x}" cy="${p.y}" r="${padR.toFixed(1)}" fill="rgba(15,23,42,0.9)" stroke="rgba(${RGB[p.kind]},0.48)" stroke-width="1.3"/><image href="${href}" x="${(p.x - size / 2).toFixed(1)}" y="${(p.y - size / 2).toFixed(1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>${label}</g>`;
		})
		.join("");

	const relaysSvg = relays
		.map((r) => {
			const size = 36;
			const padR = 25;
			const rings = (r.rings ?? [])
				.map(
					(rad, idx) =>
						`<circle cx="${r.x}" cy="${r.y}" r="${rad}" fill="none" stroke="rgba(${r.glow ?? RGB.video},${idx === 0 ? 0.55 : 0.25})" stroke-width="${idx === 0 ? 2 : 1.4}"/>`,
				)
				.join("");
			const halo = r.glow ? `<circle cx="${r.x}" cy="${r.y}" r="${padR + 10}" fill="rgba(${r.glow},0.18)"/>` : "";
			return `<g>${rings}${halo}<circle cx="${r.x}" cy="${r.y}" r="${padR}" fill="rgba(15,23,42,0.94)" stroke="${r.glow ? `rgba(${r.glow},0.85)` : "rgba(44,58,87,0.95)"}" stroke-width="1.8"/><image href="${globeHref}" x="${r.x - size / 2}" y="${r.y - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/><text x="${r.x + padR + 7}" y="${r.y + 4}" fill="rgba(226,232,240,0.94)" font-family="'DM Mono', monospace" font-size="12.5" font-weight="500">${r.label}</text></g>`;
		})
		.join("");

	return `<svg class="mesh-art" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" aria-hidden="true">
		<defs>
			<filter id="og-glow" x="-30%" y="-30%" width="160%" height="160%">
				<feGaussianBlur stdDeviation="4" result="b"/>
				<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
			</filter>
			<radialGradient id="og-aura" cx="76%" cy="46%" r="48%">
				<stop offset="0%" stop-color="rgba(34,197,94,0.16)"/>
				<stop offset="55%" stop-color="rgba(56,189,248,0.05)"/>
				<stop offset="100%" stop-color="rgba(15,23,42,0)"/>
			</radialGradient>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-aura)"/>
		${accessSvg}
		${backboneSvg}
		${packetsSvg}
		${peersSvg}
		${relaysSvg}
	</svg>
	<div class="mesh-scrim"></div>`;
}

// `shell` highlights the command as bash and draws the `$ ` prompt itself: the
// shell grammar reads a `# ` line as a root prompt, not a comment. highlight.js
// ships TOML as an alias of its ini grammar.
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);
const GRAMMAR: Record<Lang, string> = { shell: "bash", rust: "rust", toml: "ini", ts: "typescript" };

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The inline markup cards.ts documents: `mono` and **green**. In the title the
// bold form is the underlined phrase instead.
function inline(text: string, strong: string): string {
	return escapeHtml(text)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, `<${strong}>$1</${strong}>`);
}

function title(text: string): string {
	return inline(text, "em").replace(/<em>(.*?)<\/em>/g, `<span class="emph">$1</span>`);
}

// A tile icon is the site's hand-drawn `public/drawn/icon-<name>.svg` when
// there is one, else its traced drawing in `public/icons/cards/<name>.svg`.
// The drawn icons carry only a width and height, so the viewBox is made from those; without
// one the drawing would crop instead of scaling down.
function icon(name: string): string {
	const path = [join(ROOT, "public/drawn", `icon-${name}.svg`), join(ROOT, "public/icons/cards", `${name}.svg`)].find(
		existsSync,
	);
	if (!path)
		throw new Error(`no icon ${name}; draw public/drawn/icon-${name}.svg or add public/icons/cards/${name}.svg`);
	const svg = readFileSync(path, "utf8")
		.replace(/^[\s\S]*?<svg/, "<svg")
		.replace(/<title>[\s\S]*?<\/title>/, "")
		.trim();
	const root = svg.slice(0, svg.indexOf(">"));
	const width = root.match(/\swidth="([\d.]+)/)?.[1];
	const height = root.match(/\sheight="([\d.]+)/)?.[1];
	const viewBox = /viewBox=/.test(root) || !width || !height ? "" : ` viewBox="0 0 ${width} ${height}"`;
	return svg.replace("<svg", `<svg class="icon" aria-hidden="true"${viewBox}`);
}

// Four across at most; six and nine fill three columns evenly.
function columns(count: number): number {
	if (count <= 4) return count;
	return count % 3 === 0 && count <= 9 ? 3 : 4;
}

function tiles(card: Card): string {
	if (!card.tiles?.length) return "";
	const items = card.tiles.map(
		(t) =>
			`<div class="tile"><div class="name">${[t.icon ?? []].flat().map(icon).join("")}<span>${inline(t.name, "strong")}</span></div>${
				t.detail ? `<div class="detail">${inline(t.detail, "strong")}</div>` : ""
			}</div>`,
	);
	return `<div class="tiles" style="grid-template-columns: repeat(${columns(items.length)}, 1fr)">${items.join("")}</div>`;
}

function codeLine(line: string, lang: Lang): string {
	const prompt = lang === "shell" && line.startsWith("$ ");
	const body = prompt ? line.slice(2) : line;
	const highlighted = hljs.highlight(body, { language: GRAMMAR[lang] }).value;
	return prompt ? `<span class="prompt">$ </span>${highlighted}` : highlighted;
}

function html(card: Card): string {
	// Longer headlines step down so a two-line title never collides with the
	// code block; the breakpoints are the card lengths that fit at each size.
	// A card with nothing below the sub (the site's og:image) fills the space.
	const plain = card.title.replace(/\*\*/g, "");
	const bare = !card.tiles?.length && !card.code && !card.image;
	const mesh = Boolean(card.mesh);
	const pageOg = Boolean(card.art);
	const blogOg = Boolean(card.blogCover);
	const styledOg = mesh || pageOg || blogOg;
	const titleSize = mesh
		? 74
		: blogOg
			? plain.length <= 20
				? 64
				: plain.length <= 36
					? 52
					: plain.length <= 54
						? 42
						: 34
			: pageOg
				? plain.length <= 18
					? 78
					: 68
				: bare
					? 96
					: plain.length <= 24
						? 72
						: plain.length <= 36
							? 60
							: 50;
	const subLen = card.sub?.length ?? 0;
	const subSize = blogOg ? (subLen > 120 ? 21 : 24) : styledOg ? 27 : bare ? 34 : 23;
	const codeLines = card.code?.split("\n") ?? [];
	const longest = Math.max(0, ...codeLines.map((l) => l.length));
	const codeSize = longest > 72 || codeLines.length > 7 ? 17 : longest > 56 ? 19 : 22;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face {
	font-family: "JetBrains Mono";
	font-weight: 400 700;
	src: url("${FONT}") format("woff2");
}
@font-face {
	font-family: "Bricolage Grotesque";
	font-weight: 500 800;
	src: url("${FONT_DISPLAY}") format("woff2");
}
@font-face {
	font-family: "DM Sans";
	font-weight: 300 800;
	src: url("${FONT_SANS}") format("woff2");
}
@font-face {
	font-family: "DM Mono";
	font-weight: 500;
	src: url("${FONT_DM_MONO}") format("woff2");
}
:root {
	--ink: #eef2f8;
	--ink-soft: #c4cddc;
	--ink-faint: #8c99b0;
	--green: #22c55e;
	--card: #16223f;
	--hair: rgba(238, 243, 251, 0.14);
	--grid: rgba(255, 255, 255, 0.032);
	--font-display: ${styledOg ? '"Bricolage Grotesque", "DM Sans", system-ui, sans-serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};
	--font-body: ${styledOg ? '"DM Sans", system-ui, sans-serif' : "var(--font-display)"};
	--font-mono: ${styledOg ? '"DM Mono", "JetBrains Mono", ui-monospace, monospace' : '"JetBrains Mono", ui-monospace, monospace'};
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body {
	position: relative;
	background: #0f172a;
	background-image: ${styledOg ? "radial-gradient(rgba(148, 163, 184, 0.13) 1.2px, transparent 1.2px)" : "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)"};
	background-size: 34px 34px;
	color: var(--ink);
	font-family: var(--font-body);
	-webkit-font-smoothing: antialiased;
}
.mesh-art {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
}
.mesh-scrim {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background:
		radial-gradient(ellipse 60% 84% at 28% 50%, rgba(15, 23, 42, 0.97) 0%, rgba(15, 23, 42, 0.9) 48%, rgba(15, 23, 42, 0.28) 76%, rgba(15, 23, 42, 0) 96%),
		linear-gradient(to right, rgba(15, 23, 42, 0.92) 0%, rgba(15, 23, 42, 0.72) 38%, rgba(15, 23, 42, 0) 64%);
}
.page-art-aura {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: radial-gradient(40% 62% at 80% 52%, rgba(34, 197, 94, 0.15), rgba(56, 189, 248, 0.04) 55%, transparent 80%);
}
.glow {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: radial-gradient(58% 60% at 50% -8%, rgba(34, 197, 94, 0.16), transparent 70%);
}
.card {
	position: relative;
	z-index: 2;
	height: 100%;
	padding: 52px 64px 48px;
	display: flex;
	flex-direction: column;
}
.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.logo { height: ${styledOg ? 72 : 92}px; width: auto; display: block; }
.eyebrow, .note, .url {
	font-family: var(--font-mono);
	font-size: 17px;
	font-weight: 700;
	color: var(--green);
	white-space: nowrap;
}
.eyebrow {
	${pageOg || blogOg ? "font-size: 15px; letter-spacing: 0.09em; text-transform: uppercase; padding: 6px 14px; border-radius: 999px; background: rgba(34, 197, 94, 0.12); color: #4ade80;" : ""}
}
/* Slack splits above and below the body, so a one-line card sits centered. */
.body { margin: auto 0; padding: 32px 0 24px; }
h1 {
	font-family: var(--font-display);
	font-size: ${titleSize}px;
	font-weight: 700;
	letter-spacing: -0.025em;
	line-height: ${blogOg ? 1.22 : styledOg ? 1.12 : 1.08};
	max-width: ${blogOg ? 600 : styledOg ? 640 : 1000}px;
}
.emph, .blog-title {
	text-decoration-line: underline;
	text-decoration-color: var(--green);
	text-decoration-thickness: 0.085em;
	text-underline-offset: 0.14em;
	text-decoration-skip-ink: auto;
}
.lead { display: flex; align-items: center; justify-content: space-between; gap: 40px; }
.art-badge {
	flex: none;
	width: 310px;
	height: 310px;
	border-radius: 999px;
	background: radial-gradient(circle at 50% 45%, rgba(19, 29, 51, 0.96), rgba(15, 23, 42, 0.92));
	border: 1.5px solid rgba(44, 58, 87, 0.95);
	box-shadow: 0 0 0 18px rgba(34, 197, 94, 0.055), 0 0 0 38px rgba(34, 197, 94, 0.025);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 54px;
	overflow: hidden;
}
.art-badge img {
	max-width: 100%;
	max-height: 100%;
	width: auto;
	height: auto;
	object-fit: contain;
	filter: drop-shadow(0 0 24px rgba(34, 197, 94, 0.14));
}
.blog-frame {
	flex: none;
	width: 420px;
	height: 330px;
	border-radius: 20px;
	background: rgba(2, 6, 23, 0.72);
	border: 1.5px solid rgba(44, 58, 87, 0.95);
	box-shadow: 0 20px 54px rgba(0, 0, 0, 0.48), 0 0 0 10px rgba(34, 197, 94, 0.045);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	overflow: hidden;
}
.blog-frame img {
	max-width: 100%;
	max-height: 100%;
	width: auto;
	height: auto;
	object-fit: contain;
	border-radius: 10px;
}
.shot {
	flex: none;
	width: 420px;
	aspect-ratio: 16 / 9;
	object-fit: cover;
	border: 1px solid var(--hair);
	border-radius: 14px;
	box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}
.sub {
	margin-top: ${blogOg ? 22 : styledOg ? 26 : bare ? 32 : 18}px;
	font-size: ${subSize}px;
	line-height: 1.46;
	color: var(--ink-soft);
	max-width: ${blogOg ? 590 : styledOg ? 600 : 1020}px;
}
.legend {
	display: inline-flex;
	align-items: center;
	gap: 14px;
	padding: 6px 14px;
	border-radius: 999px;
	border: 1px solid rgba(44, 58, 87, 0.9);
	background: rgba(15, 23, 42, 0.78);
	font-family: var(--font-mono);
	font-size: 13px;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--ink-faint);
}
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { display: inline-block; width: 8px; height: 8px; }
.legend .v { border-radius: 2px; background: #4ade80; }
.legend .a { border-radius: 999px; background: #7dd3fc; }
.legend .d { border-radius: 999px; background: #fcd34d; }
.sub code, .sub strong {
	font-family: var(--font-mono);
	font-size: 0.92em;
	color: var(--ink);
}
/* A command breaking at its hyphen reads as two commands. */
.sub code { white-space: nowrap; }
.sub strong { color: var(--green); font-weight: 700; }
pre {
	margin-top: 28px;
	padding: 22px 30px;
	background: var(--card);
	border: 1px solid var(--hair);
	border-radius: 16px;
	font-family: var(--font-mono);
	font-size: ${codeSize}px;
	line-height: 1.55;
	color: var(--ink);
	white-space: pre;
	overflow: hidden;
}
.tiles {
	margin-top: 30px;
	display: grid;
	gap: 14px;
}
.tile {
	padding: 18px 22px;
	background: var(--card);
	border: 1px solid var(--hair);
	border-radius: 14px;
}
.tile .name {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 24px;
	font-weight: 700;
	letter-spacing: -0.01em;
}
.tile .icon {
	flex: none;
	width: 28px;
	height: 28px;
	font-size: 24px;
	line-height: 28px;
	text-align: center;
}
.tile .detail {
	margin-top: 6px;
	font-size: 17px;
	line-height: 1.45;
	color: var(--ink-soft);
}
.tile code, .tile strong {
	font-family: var(--font-mono);
	font-size: 0.92em;
	color: var(--ink-faint);
}
.tile strong { color: var(--green); }
.tile .name code { font-size: 1em; color: var(--ink); }
pre .prompt { color: var(--green); font-weight: 700; }
/* Token colors: atom-one-dark. */
.hljs-comment, .hljs-quote { color: #5c6370; font-style: italic; }
.hljs-keyword, .hljs-doctag, .hljs-formula { color: #c678dd; }
.hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #e06c75; }
.hljs-literal { color: #56b6c2; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta .hljs-string { color: #98c379; }
.hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number { color: #d19a66; }
.hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title { color: #61afef; }
.hljs-built_in, .hljs-title.class_, .hljs-class .hljs-title { color: #e6c07b; }
.foot {
	padding-top: 24px;
	display: flex;
	justify-content: space-between;
	align-items: baseline;
}
.url { color: var(--ink-faint); font-weight: 400; }
</style>
</head>
<body>
${mesh ? meshArt() : ""}
${pageOg || blogOg ? '<div class="page-art-aura"></div>' : ""}
<div class="glow"></div>
<div class="card">
	<div class="head">
		<img class="logo" src="${LOGO}" alt="moq.dev">
		${card.eyebrow ? `<div class="eyebrow">${escapeHtml(card.eyebrow)}</div>` : ""}
	</div>
	<div class="body">
		<div class="lead">
			<div>
				<h1${blogOg ? ' class="blog-title"' : ""}>${title(card.title)}</h1>
				${card.sub ? `<p class="sub">${inline(card.sub, "strong")}</p>` : ""}
			</div>
			${card.art ? `<div class="art-badge"><img src="${svgData(card.art)}" alt=""></div>` : ""}
			${card.blogCover ? `<div class="blog-frame"><img src="${publicDataUrl(card.blogCover)}" alt=""></div>` : ""}
			${card.image ? `<img class="shot" src="${dataUrl(join(HERE, card.image), card.image.endsWith(".png") ? "image/png" : "image/jpeg")}" alt="">` : ""}
		</div>
		${tiles(card)}
		${codeLines.length ? `<pre>${codeLines.map((l) => codeLine(l, card.lang ?? "shell")).join("\n")}</pre>` : ""}
	</div>
	<div class="foot">
		<div class="url">${escapeHtml(card.url ?? "moq.dev")}</div>
		${mesh ? '<div class="legend"><span><i class="v"></i>video</span><span><i class="a"></i>audio</span><span><i class="d"></i>data</span></div>' : card.note ? `<div class="note">${escapeHtml(card.note)}</div>` : ""}
	</div>
</div>
</body>
</html>`;
}

// The devshell's ImageMagick strips metadata and recompresses losslessly.
function optimizePng(filePath: string) {
	execFileSync("magick", [filePath, "-strip", "-define", "png:compression-level=9", filePath], { stdio: "inherit" });
}

async function main() {
	const args = process.argv.slice(2);
	const flags = args.filter((a) => a.startsWith("-"));
	const bad = flags.find((f) => f !== "--html" && f !== "--og");
	if (bad) throw new Error(`unknown flag ${bad}; allowed flags are --html and --og`);
	const keepHtml = flags.includes("--html");
	const syncOg = flags.includes("--og");
	const slugs = args.filter((a) => !a.startsWith("-"));
	// --og renders only the committed OG cards, so an announcement slug fails here.
	const catalog = syncOg ? ogCards() : CARDS;
	const cards = slugs.length ? slugs.map((s) => catalog.find((c) => c.slug === s) ?? unknown(s)) : catalog;
	const lock: Record<string, string> = syncOg && existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : {};

	// The devshell's Playwright, not a node_modules copy, so the library and its
	// Chromium come from the same nixpkgs pin.
	const nodePath = process.env.PLAYWRIGHT_NODE_PATH;
	if (!nodePath) throw new Error("PLAYWRIGHT_NODE_PATH is unset; run inside the devshell (nix develop)");
	const { chromium } = await import(join(nodePath, "playwright"));

	mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch();
	try {
		// OG cards render at 1x (1200x675) to stay compact for scrapers; social post cards stay 2x.
		const page = await browser.newPage({
			viewport: { width: WIDTH, height: HEIGHT },
			deviceScaleFactor: syncOg ? 1 : SCALE,
		});
		for (const card of cards) {
			const doc = html(card);
			if (keepHtml) writeFileSync(join(OUT, `${card.slug}.html`), doc);
			await page.setContent(doc, { waitUntil: "load" });
			await page.evaluate(() => document.fonts.ready);
			// The card is sized to the viewport, so anything past its edge is a
			// layout bug (a title that wrapped into the code block, a nowrap
			// eyebrow or note wider than the card, a code line wider than the
			// block), not a crop. Both axes: the nowrap runs overflow sideways.
			// A body that's too tall squeezes the footer into the bottom padding
			// before it leaves the page, so that counts too.
			const overflow = await page.evaluate(() => {
				const over = (el: Element) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
				const pre = document.querySelector("pre");
				const card = document.querySelector(".card") as HTMLElement;
				const foot = document.querySelector(".foot") as HTMLElement;
				const floor = card.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(card).paddingBottom);
				return over(document.body) || (pre !== null && over(pre)) || foot.getBoundingClientRect().bottom > floor + 0.5;
			});
			if (overflow) throw new Error(`${card.slug}: content overflows the ${WIDTH}x${HEIGHT} card; shorten it`);
			const path = join(OUT, `${card.slug}.png`);
			const raw = await page.screenshot();
			writeFileSync(path, raw);
			if (syncOg && card.ogOut) {
				const dest = join(ROOT, card.ogOut);
				mkdirSync(dirname(dest), { recursive: true });
				writeFileSync(dest, raw);
				optimizePng(dest);
				lock[card.ogOut] = fingerprint(card);
				const size = readFileSync(dest).length;
				console.log(`-> ${card.ogOut} (${Math.round(size / 1024)} KB)`);
			} else {
				console.log(path);
			}
		}
	} finally {
		await browser.close();
	}

	if (syncOg) {
		// Keep only live cards, in a stable order so the diff shows what changed.
		const live = new Set(catalog.map((c) => c.ogOut));
		const kept = Object.keys(lock)
			.filter((out) => live.has(out))
			.sort()
			.map((out) => [out, lock[out]]);
		writeFileSync(LOCK, `${JSON.stringify(Object.fromEntries(kept), null, "\t")}\n`);
	}
}

function unknown(slug: string): never {
	throw new Error(`no card named ${slug}; see tools/cards/cards.ts`);
}

await main();
