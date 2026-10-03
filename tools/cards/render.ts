#!/usr/bin/env bun
// Renders the announcement cards in cards.ts to PNG with the devshell's
// Playwright Chromium. Run from the devshell:
//
//   just cards            # every card -> tools/cards/out/<slug>.png
//   just cards e2ee   # one or more slugs
//   just cards --html     # also keep the HTML, to tweak in a browser
//
// The look is moq.pro's splash page, shared with moq.pro's copy of this tool:
// slate grid wash, bold system-font headline with moq.dev's hand-drawn
// green stroke, JetBrains Mono for code.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import { CARDS, type Card, type Lang } from "./cards.ts";

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
const STROKE = dataUrl(join(ROOT, "public/drawn/stroke-1.svg"), "image/svg+xml");

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
	return inline(text, "em").replace(
		/<em>(.*?)<\/em>/g,
		`<span class="emph">$1<img class="stroke" src="${STROKE}" alt=""></span>`,
	);
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
	const plain = card.title.replace(/\*\*/g, "");
	const titleSize = plain.length <= 24 ? 72 : plain.length <= 36 ? 60 : 50;
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
:root {
	--ink: #f1f5f9;
	--ink-soft: #9fb0c9;
	--ink-faint: #64748b;
	--green: #22c55e;
	--card: #16223f;
	--hair: rgba(238, 243, 251, 0.14);
	--grid: rgba(255, 255, 255, 0.035);
	--font-display: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	--font-mono: "JetBrains Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
body {
	position: relative;
	background: #0f172a;
	background-image: linear-gradient(var(--grid) 1px, transparent 1px),
		linear-gradient(90deg, var(--grid) 1px, transparent 1px);
	background-size: 34px 34px;
	color: var(--ink);
	font-family: var(--font-display);
	-webkit-font-smoothing: antialiased;
}
.glow {
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: radial-gradient(58% 60% at 50% -8%, rgba(34, 197, 94, 0.16), transparent 70%);
}
.card {
	position: relative;
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
.logo { height: 92px; width: auto; display: block; }
.eyebrow, .note, .url {
	font-family: var(--font-mono);
	font-size: 17px;
	font-weight: 700;
	color: var(--green);
	white-space: nowrap;
}
/* Slack splits above and below the body, so a one-line card sits centered. */
.body { margin: auto 0; padding: 32px 0 24px; }
h1 {
	font-size: ${titleSize}px;
	font-weight: 700;
	letter-spacing: -0.02em;
	line-height: 1.04;
	max-width: 1000px;
}
/* The hand-drawn stroke under "massive scale" on moq.dev's homepage, at the
   same proportions: 104% of the phrase, hanging just below the baseline. */
/* isolate + z-index -1 paints the stroke behind the phrase, not over it. */
.emph { position: relative; display: inline-block; white-space: nowrap; isolation: isolate; }
.stroke {
	position: absolute;
	left: -2%;
	bottom: -0.14em;
	width: 104%;
	height: 0.23em;
	z-index: -1;
	pointer-events: none;
}
.lead { display: flex; align-items: center; gap: 40px; }
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
	margin-top: 18px;
	font-size: 23px;
	line-height: 1.5;
	color: var(--ink-soft);
	max-width: 1020px;
}
.sub code, .sub strong {
	font-family: var(--font-mono);
	font-size: 0.92em;
	color: var(--ink);
}
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
<div class="glow"></div>
<div class="card">
	<div class="head">
		<img class="logo" src="${LOGO}" alt="moq.dev">
		${card.eyebrow ? `<div class="eyebrow">${escapeHtml(card.eyebrow)}</div>` : ""}
	</div>
	<div class="body">
		<div class="lead">
			<div>
				<h1>${title(card.title)}</h1>
				${card.sub ? `<p class="sub">${inline(card.sub, "strong")}</p>` : ""}
			</div>
			${card.image ? `<img class="shot" src="${dataUrl(join(HERE, card.image), card.image.endsWith(".png") ? "image/png" : "image/jpeg")}" alt="">` : ""}
		</div>
		${tiles(card)}
		${codeLines.length ? `<pre>${codeLines.map((l) => codeLine(l, card.lang ?? "shell")).join("\n")}</pre>` : ""}
	</div>
	<div class="foot">
		<div class="url">moq.dev</div>
		${card.note ? `<div class="note">${escapeHtml(card.note)}</div>` : ""}
	</div>
</div>
</body>
</html>`;
}

async function main() {
	const args = process.argv.slice(2);
	const flags = args.filter((a) => a.startsWith("-"));
	const bad = flags.find((f) => f !== "--html");
	if (bad) throw new Error(`unknown flag ${bad}; the only flag is --html`);
	const keepHtml = flags.includes("--html");
	const slugs = args.filter((a) => !a.startsWith("-"));
	const cards = slugs.length ? slugs.map((s) => CARDS.find((c) => c.slug === s) ?? unknown(s)) : CARDS;

	// The devshell's Playwright, not a node_modules copy, so the library and its
	// Chromium come from the same nixpkgs pin.
	const nodePath = process.env.PLAYWRIGHT_NODE_PATH;
	if (!nodePath) throw new Error("PLAYWRIGHT_NODE_PATH is unset; run inside the devshell (nix develop)");
	const { chromium } = await import(join(nodePath, "playwright"));

	mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });
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
			await page.screenshot({ path });
			console.log(path);
		}
	} finally {
		await browser.close();
	}
}

function unknown(slug: string): never {
	throw new Error(`no card named ${slug}; see tools/cards/cards.ts`);
}

await main();
