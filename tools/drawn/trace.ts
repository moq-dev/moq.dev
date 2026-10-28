#!/usr/bin/env bun
// Traces hand-drawn art into an SVG of flat colour layers, keeping the drawn
// look while dropping the baked background and the antialiasing:
//
//   just trace public/blog/foo/bar.png          # writes bar.svg beside it
//   SIGMA=12 just trace --crop public/drawn/icon-*.svg   # rewrites in place
//
// Each colour is found from the flat regions of the drawing, snapped to the
// site palette when close, and traced on its own: upscale, blur, threshold,
// and potrace. The SVG keeps the input's size so layout does not shift.
// --crop trims to the drawing instead, for icons traced on a loose canvas.
//
// SIGMA (default 0.75, in input pixels) sets how much smooths away. Icons take
// far more, since their canvas is ~1600px: much past 12 starts merging nearby
// shapes, like a Game Boy's screen and D-pad.

import { readFileSync, writeFileSync } from "node:fs";

type RGB = [number, number, number];

// Close enough to these and a colour snaps to them, so every drawing shares
// the site's green and white instead of the drawing app's antialiased shades.
const PALETTE: RGB[] = [
	[0xfa, 0xfa, 0xfa],
	[0x00, 0xbe, 0x2d],
	[0xa3, 0xa5, 0xa8],
	[0x00, 0x00, 0x00],
];
const SNAP = 30;

// Flat pixels closer than this are one colour. The background takes only its
// own noise: dark fills like a grey hair on slate sit just past MERGE from it.
const MERGE = 24;
const BACKGROUND = 12;

const sigma = Number(process.env.SIGMA ?? 0.75);
const crop = process.argv.includes("--crop");
const files = process.argv.slice(2).filter((arg) => arg !== "--crop");
if (files.length === 0) throw new Error("usage: trace.ts [--crop] <file.png|file.svg>...");

function run(cmd: string[], stdin?: Uint8Array): Buffer {
	const proc = Bun.spawnSync(cmd, { stdin, stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(`${cmd[0]} failed: ${proc.stderr.toString()}`);
	return proc.stdout;
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

for (const file of files) {
	// SVG renders at its viewBox size; rsvg is the renderer the site's browsers agree with.
	const svg = file.endsWith(".svg");
	const png = svg ? run(["rsvg-convert", file]) : readFileSync(file);
	const [width, height] = run(["magick", "png:-", "-format", "%w %h", "info:"], png).toString().split(" ").map(Number);
	const rgba = run(["magick", "png:-", "-depth", "8", "rgba:-"], png);
	const n = width * height;
	const at = (i: number): RGB => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];

	// A drawing with any transparency is already on nothing; otherwise the
	// background is the most common colour along the border.
	let transparent = false;
	for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 255) transparent = true;
	let background: RGB = [0, 0, 0];
	if (!transparent) {
		const border = new Map<number, number>();
		for (let i = 0; i < n; i++) {
			const x = i % width;
			const y = (i - x) / width;
			if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
			const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
			border.set(key, (border.get(key) ?? 0) + 1);
		}
		const key = [...border].sort((a, b) => b[1] - a[1])[0][0];
		background = [key >> 16, (key >> 8) & 0xff, key & 0xff];
	}

	// Ink colours come from flat pixels, whose 3x3 neighbourhood is one opaque
	// colour: antialiasing is a gradient, so it never is.
	const flat = new Map<number, number>();
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			if (rgba[i * 4 + 3] < 250) continue;
			const c = at(i);
			let same = true;
			for (let dy = -1; dy <= 1 && same; dy++) {
				for (let dx = -1; dx <= 1 && same; dx++) {
					const j = i + dy * width + dx;
					same = rgba[j * 4 + 3] >= 250 && dist(c, at(j)) < 12;
				}
			}
			if (!same) continue;
			const key = (c[0] << 16) | (c[1] << 8) | c[2];
			flat.set(key, (flat.get(key) ?? 0) + 1);
		}
	}
	const clusters: { colour: RGB; count: number }[] = [];
	for (const [key, count] of [...flat].sort((a, b) => b[1] - a[1])) {
		const c: RGB = [key >> 16, (key >> 8) & 0xff, key & 0xff];
		if (!transparent && dist(c, background) < BACKGROUND) continue;
		const near = clusters.find((cluster) => dist(cluster.colour, c) < MERGE);
		if (near) near.count += count;
		else clusters.push({ colour: c, count });
	}
	const inks = clusters
		.filter((cluster) => cluster.count >= 8)
		.map(({ colour }) => PALETTE.find((p) => dist(p, colour) < SNAP) ?? colour)
		.filter((colour, i, all) => all.findIndex((c) => dist(c, colour) === 0) === i);

	// Label every pixel with its nearest colour, 0 being the background.
	const label = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		if (transparent && rgba[i * 4 + 3] === 0) continue;
		const c = at(i);
		let best = transparent ? Number.POSITIVE_INFINITY : dist(c, background);
		for (let k = 0; k < inks.length; k++) {
			const d = dist(c, inks[k]);
			if (d < best) {
				best = d;
				label[i] = k + 1;
			}
		}
	}

	// An edge blended halfway into the background lands on some other colour:
	// white over slate is the site grey. Those regions are thin everywhere, so
	// drop any region without a 3x3 core and hand its pixels to the colour beside it.
	const core = new Uint8Array(n);
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			if (!label[i]) continue;
			let same = true;
			for (let dy = -1; dy <= 1 && same; dy++) {
				for (let dx = -1; dx <= 1 && same; dx++) same = label[i + dy * width + dx] === label[i];
			}
			core[i] = same ? 1 : 0;
		}
	}
	const neighbours = (i: number) => {
		const x = i % width;
		const out: number[] = [];
		if (x > 0) out.push(i - 1);
		if (x < width - 1) out.push(i + 1);
		if (i >= width) out.push(i - width);
		if (i < n - width) out.push(i + width);
		return out;
	};
	const kept = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		if (!core[i] || kept[i]) continue;
		const stack = [i];
		kept[i] = 1;
		while (stack.length) {
			for (const j of neighbours(stack.pop() as number)) {
				if (!kept[j] && label[j] === label[i]) {
					kept[j] = 1;
					stack.push(j);
				}
			}
		}
	}
	// Reassign within 3px of a kept colour; an isolated thin line keeps its own.
	let frontier: number[] = [];
	for (let i = 0; i < n; i++) if (kept[i]) frontier.push(i);
	for (let step = 0; step < 3 && frontier.length; step++) {
		const next: number[] = [];
		for (const i of frontier) {
			for (const j of neighbours(i)) {
				if (label[j] && !kept[j]) {
					label[j] = label[i];
					kept[j] = 1;
					next.push(j);
				}
			}
		}
		frontier = next;
	}

	// An antialiased pixel is a blend of two colours: its own and the neighbour,
	// or background, it best lies between. Splitting it between both keeps every
	// edge subpixel, ink against ink as well as ink against background.
	const colour = (k: number) => (k ? inks[k - 1] : background);
	const weight = Array.from(inks, () => new Float32Array(n));
	for (let i = 0; i < n; i++) {
		const alpha = transparent ? rgba[i * 4 + 3] / 255 : 1;
		if (!alpha) continue;
		const a = label[i];
		const c = at(i);
		let mix = 1;
		let other = 0;
		let best = Number.POSITIVE_INFINITY;
		const candidates = transparent ? neighbours(i).map((j) => label[j]) : [0, ...neighbours(i).map((j) => label[j])];
		for (const b of candidates) {
			if (b === a || (transparent && !b)) continue;
			const [p, q] = [colour(a), colour(b)];
			let dot = 0;
			let len = 0;
			for (let ch = 0; ch < 3; ch++) {
				dot += (c[ch] - q[ch]) * (p[ch] - q[ch]);
				len += (p[ch] - q[ch]) ** 2;
			}
			const t = Math.min(1, Math.max(0, dot / len));
			const residual = Math.hypot(...[0, 1, 2].map((ch) => c[ch] - q[ch] - t * (p[ch] - q[ch])));
			if (residual < best) [best, mix, other] = [residual, t, b];
		}
		if (a) weight[a - 1][i] += alpha * mix;
		if (other) weight[other - 1][i] += alpha * (1 - mix);
	}
	const ink = new Float32Array(n);
	for (const w of weight) for (let i = 0; i < n; i++) ink[i] += w[i];

	// Biggest colour at the back. Each layer reaches 1px under the layers drawn
	// over it, so two colours meeting don't leave a seam of background between them.
	const area = weight.map((w) => w.reduce((sum, v) => sum + v, 0));
	const order = inks.map((_, k) => k).sort((a, b) => area[b] - area[a]);

	// Upscale so the threshold and potrace work below the input's pixel grid.
	const scale = Math.max(1, Math.round(3200 / Math.max(width, height)));
	let bbox = { x: 0, y: 0, w: width, h: height };
	if (crop) {
		let [x0, y0, x1, y1] = [width, height, 0, 0];
		for (let i = 0; i < n; i++) {
			if (ink[i] < 0.5) continue;
			const x = i % width;
			const y = (i - x) / width;
			[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
		}
		const pad = Math.round(Math.max(width, height) / 64);
		bbox = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 1 + 2 * pad, h: y1 - y0 + 1 + 2 * pad };
	}

	const layers: string[] = [];
	for (const [rank, k] of order.entries()) {
		const above = order.slice(rank + 1).map((j) => weight[j]);
		const mask = new Uint8Array(n);
		for (let i = 0; i < n; i++) mask[i] = Math.round(weight[k][i] * 255);
		for (let i = 0; i < n; i++) {
			if (weight[k][i] < 0.5) continue;
			for (const j of neighbours(i)) {
				if (above.some((w) => w[j] > 0)) mask[j] = Math.max(mask[j], Math.round(Math.min(1, ink[j]) * 255));
			}
		}

		const bitmap = run(
			[
				"magick",
				"-size",
				`${width}x${height}`,
				"-depth",
				"8",
				"gray:-",
				"-background",
				"black",
				"-extent",
				`${bbox.w}x${bbox.h}${bbox.x < 0 ? "" : "+"}${bbox.x}${bbox.y < 0 ? "" : "+"}${bbox.y}`,
				"-filter",
				"Triangle",
				"-resize",
				`${scale * 100}%`,
				"-blur",
				`0x${sigma * scale}`,
				"-threshold",
				"50%",
				"-negate",
				"pbm:-",
			],
			mask,
		);
		const traced = run(
			["potrace", "-", "-s", "-r", `${72 * scale}`, "-a", "1.0", "-O", "0.4", "-t", `${4 * scale * scale}`, "-u", "4"],
			bitmap,
		).toString();
		const paths = traced.match(/<g [\s\S]*<\/g>/)?.[0];
		if (!paths) continue;
		const fill = hex(inks[k]);
		layers.push(`<g fill="${fill}">\n${paths.replace(/\s+fill="#000000"|\s+stroke="none"/g, "")}\n</g>`);
	}

	const title = svg ? readFileSync(file, "utf8").match(/<title>[^<]*<\/title>/)?.[0] : undefined;
	const out = file.replace(/\.(png|svg)$/, ".svg");
	writeFileSync(
		out,
		[
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bbox.w} ${bbox.h}">`,
			...(title ? [`  ${title}`] : []),
			...layers,
			"</svg>",
			"",
		].join("\n"),
	);
	console.log(`${out}: ${order.map((k) => hex(inks[k])).join(" ")}`);
}
