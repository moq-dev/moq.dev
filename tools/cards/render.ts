#!/usr/bin/env bun
// Renders the announcement cards in cards.ts to PNG with the devshell's
// Playwright Chromium. Run from the devshell:
//
//   just cards            # every card -> tools/cards/out/<slug>.png
//   just cards e2ee   # one or more slugs
//   just cards --html     # also keep the HTML, to tweak in a browser
//
// The look is moq.pro's splash page, shared with moq.pro's copy of this tool:
// slate grid wash, bold system-font headline with the hand-drawn green
// underline, JetBrains Mono for code.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
// Inlined rather than an <img> so it can stretch: the drawing is scaled to the
// underlined phrase's width and a fixed height, which an image's aspect ratio
// would refuse.
const UNDERLINE = readFileSync(join(HERE, "underline.svg"), "utf8")
	.trim()
	.replace(/^[\s\S]*?<svg/, "<svg")
	.replace("<svg", '<svg class="mark" preserveAspectRatio="none"');

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
	return inline(text, "em").replace(/<em>(.*?)<\/em>/g, `<span class="emph">$1${UNDERLINE}</span>`);
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
.logo { height: 60px; width: auto; display: block; }
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
.emph { position: relative; white-space: nowrap; }
.mark {
	position: absolute;
	left: 50%;
	bottom: -0.12em;
	/* Wider and thicker than the splash's: a headline needs a heavier stroke,
	   and a fixed overhang past the phrase reads as a marker, not a rule. */
	width: calc(100% + 0.4em);
	height: 0.45em;
	transform: translateX(-50%);
	pointer-events: none;
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
		<h1>${title(card.title)}</h1>
		${card.sub ? `<p class="sub">${inline(card.sub, "strong")}</p>` : ""}
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
			const overflow = await page.evaluate(() => {
				const over = (el: Element) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
				const pre = document.querySelector("pre");
				return over(document.body) || (pre !== null && over(pre));
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
