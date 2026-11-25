// Interactive Global Edge / Anycast Constellation behind the Self-host or Managed slice.
// Move pointer to snap to the nearest online edge PoP with live simulated RTT and
// shortest-path cluster routing. Click anywhere to fire a global broadcast wave;
// click any PoP to simulate a region outage and live failover.
import { drawIcon, loadIcon } from "@/components/home/icons";
import { whileLive } from "@/lib/motion";

const RELAY_ICON = "/drawn/icon-globe.svg";
const CLIENT_ICON = "/blog/open-for-business/viewers-1.svg";

interface Pop {
	code: string;
	nx: number;
	ny: number;
	x: number;
	y: number;
	online: boolean;
	flash: number;
	links: number[];
}

interface Pulse {
	from: { x: number; y: number };
	to: { x: number; y: number };
	toPop?: number;
	t: number;
	speed: number;
	rgb: string;
	visited?: Set<number>;
}

interface Ring {
	x: number;
	y: number;
	r: number;
	maxR: number;
	a: number;
	rgb: string;
}

const POP_SPECS: Array<{ code: string; nx: number; ny: number }> = [
	{ code: "SJC", nx: 0.14, ny: 0.4 },
	{ code: "IAD", nx: 0.27, ny: 0.41 },
	{ code: "GRU", nx: 0.34, ny: 0.75 },
	{ code: "LHR", nx: 0.48, ny: 0.29 },
	{ code: "FRA", nx: 0.53, ny: 0.33 },
	{ code: "SIN", nx: 0.77, ny: 0.61 },
	{ code: "NRT", nx: 0.86, ny: 0.41 },
	{ code: "SYD", nx: 0.88, ny: 0.79 },
];

const BACKBONE_INDICES: Array<[number, number]> = [
	[0, 1], // SJC - IAD
	[0, 2], // SJC - GRU
	[1, 2], // IAD - GRU
	[1, 3], // IAD - LHR
	[2, 3], // GRU - LHR
	[3, 4], // LHR - FRA
	[4, 5], // FRA - SIN
	[4, 6], // FRA - NRT
	[5, 6], // SIN - NRT
	[5, 7], // SIN - SYD
	[6, 7], // NRT - SYD
];

// Simplified landmass outlines in normalized [0..1, 0..1] map coordinates for the subtle dot matrix.
const CONTINENTS: Array<Array<[number, number]>> = [
	// North America
	[
		[0.06, 0.2],
		[0.22, 0.17],
		[0.33, 0.24],
		[0.31, 0.39],
		[0.24, 0.51],
		[0.19, 0.52],
		[0.14, 0.43],
		[0.09, 0.31],
	],
	// South America
	[
		[0.25, 0.55],
		[0.34, 0.58],
		[0.39, 0.68],
		[0.34, 0.85],
		[0.29, 0.9],
		[0.26, 0.75],
		[0.24, 0.62],
	],
	// Europe
	[
		[0.45, 0.22],
		[0.57, 0.19],
		[0.61, 0.31],
		[0.56, 0.39],
		[0.46, 0.38],
		[0.44, 0.3],
	],
	// Africa
	[
		[0.45, 0.42],
		[0.57, 0.42],
		[0.62, 0.53],
		[0.58, 0.76],
		[0.52, 0.82],
		[0.47, 0.67],
		[0.43, 0.52],
	],
	// Asia
	[
		[0.58, 0.2],
		[0.86, 0.22],
		[0.91, 0.36],
		[0.84, 0.53],
		[0.76, 0.62],
		[0.68, 0.52],
		[0.6, 0.43],
		[0.58, 0.32],
	],
	// Australia
	[
		[0.79, 0.69],
		[0.91, 0.69],
		[0.93, 0.81],
		[0.85, 0.85],
		[0.78, 0.78],
	],
];

function pointInPoly(x: number, y: number, poly: Array<[number, number]>) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function arcControl(a: { x: number; y: number }, b: { x: number; y: number }) {
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const d = Math.hypot(b.x - a.x, b.y - a.y);
	return { x: mx, y: my - Math.min(54, d * 0.16) };
}

function alongQuad(a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number) {
	const u = 1 - t;
	return {
		x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
		y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
	};
}

export function mount(root: HTMLElement) {
	const foundCanvas = root.querySelector<HTMLCanvasElement>("[data-edge-canvas]");
	if (!foundCanvas) throw new Error("edge background has no canvas");
	const foundCtx = foundCanvas.getContext("2d");
	if (!foundCtx) throw new Error("edge background could not acquire 2d context");
	const canvas: HTMLCanvasElement = foundCanvas;
	const ctx: CanvasRenderingContext2D = foundCtx;

	const surface = root.closest("section") ?? root;
	const readoutEl = root.querySelector<HTMLElement>("[data-edge-readout]");

	let w = 0;
	let h = 0;
	let dpr = 1;
	let isLive = false;
	let frame = 0;
	let last = 0;
	let autoWaveIn = 1.2;

	const pops: Pop[] = POP_SPECS.map((spec) => ({
		...spec,
		x: 0,
		y: 0,
		online: true,
		flash: 0,
		links: [],
	}));

	let landDots: Array<{ x: number; y: number }> = [];
	let activeEdges: Array<[number, number]> = [];
	let pulses: Pulse[] = [];
	let rings: Ring[] = [];

	const pointer = { x: 0, y: 0, inside: false };
	let hoveredPop = -1;

	function rebuildLinks() {
		for (const p of pops) p.links = [];
		activeEdges = [];
		const edgeSet = new Set<string>();
		const add = (a: number, b: number) => {
			if (!pops[a].online || !pops[b].online) return;
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (edgeSet.has(key)) return;
			edgeSet.add(key);
			pops[a].links.push(b);
			pops[b].links.push(a);
			activeEdges.push([a, b]);
		};
		for (const [a, b] of BACKBONE_INDICES) add(a, b);

		// Bridge any online PoP whose primary neighbors went offline.
		const online = pops.map((p, i) => (p.online ? i : -1)).filter((i) => i !== -1);
		for (const i of online) {
			if (pops[i].links.length > 0 || online.length <= 1) continue;
			const nearest = online
				.filter((j) => j !== i)
				.sort(
					(a, b) =>
						Math.hypot(pops[a].x - pops[i].x, pops[a].y - pops[i].y) -
						Math.hypot(pops[b].x - pops[i].x, pops[b].y - pops[i].y),
				)[0];
			if (nearest !== undefined) add(i, nearest);
		}
	}

	function nearestPop(x: number, y: number): { index: number; dist: number } | null {
		let best = -1;
		let bestD = Number.POSITIVE_INFINITY;
		for (let i = 0; i < pops.length; i++) {
			if (!pops[i].online) continue;
			const d = Math.hypot(pops[i].x - x, pops[i].y - y);
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		return best === -1 ? null : { index: best, dist: bestD };
	}

	function bfsEdges(startIndex: number): Set<string> {
		const edges = new Set<string>();
		if (!pops[startIndex]?.online) return edges;
		const seen = new Set([startIndex]);
		const queue = [startIndex];
		while (queue.length) {
			const cur = queue.shift() as number;
			for (const nxt of pops[cur].links) {
				if (seen.has(nxt)) continue;
				seen.add(nxt);
				edges.add(cur < nxt ? `${cur}-${nxt}` : `${nxt}-${cur}`);
				queue.push(nxt);
			}
		}
		return edges;
	}

	function broadcastFromPop(index: number, rgb = "74, 222, 128") {
		const p = pops[index];
		if (!p?.online) return;
		p.flash = 1;
		rings.push({ x: p.x, y: p.y, r: 5, maxR: 44, a: 0.9, rgb });
		const visited = new Set([index]);
		for (const nxt of p.links) {
			if (visited.has(nxt)) continue;
			visited.add(nxt);
			const target = pops[nxt];
			const len = Math.max(1, Math.hypot(target.x - p.x, target.y - p.y));
			pulses.push({ from: p, to: target, toPop: nxt, t: 0, speed: 290 / len, rgb, visited });
		}
	}

	function broadcastFromPoint(x: number, y: number) {
		const hit = nearestPop(x, y);
		if (!hit) return;
		const target = pops[hit.index];
		const rgb = "74, 222, 128";
		rings.push({ x, y, r: 4, maxR: 32, a: 0.85, rgb });
		const len = Math.max(1, Math.hypot(target.x - x, target.y - y));
		pulses.push({
			from: { x, y },
			to: target,
			toPop: hit.index,
			t: 0,
			speed: 340 / len,
			rgb,
			visited: new Set([hit.index]),
		});
	}

	function updateReadout() {
		if (!readoutEl) return;
		const offlineCount = pops.filter((p) => !p.online).length;
		if (pointer.inside) {
			const hit = nearestPop(pointer.x, pointer.y);
			if (hit) {
				const rtt = Math.max(6, Math.round((hit.dist / Math.max(w, 1)) * 110 + 7));
				readoutEl.textContent = `anycast → ${pops[hit.index].code} · ${rtt} ms${offlineCount ? ` · ${offlineCount} offline` : ""}`;
				readoutEl.dataset.active = "true";
				return;
			}
		}
		if (offlineCount > 0) {
			readoutEl.textContent = `${pops.length - offlineCount}/${pops.length} edges online · click PoP to restore`;
			readoutEl.dataset.active = "true";
		} else {
			readoutEl.textContent = "move for nearest edge · click PoP to fail over";
			delete readoutEl.dataset.active;
		}
	}

	function step(dt: number) {
		for (const p of pops) p.flash = Math.max(0, p.flash - dt * 1.8);

		autoWaveIn -= dt;
		if (autoWaveIn <= 0) {
			autoWaveIn = 2.1 + Math.random() * 1.4;
			const online = pops.map((p, i) => (p.online ? i : -1)).filter((i) => i !== -1);
			if (online.length) {
				const origin = online[Math.floor(Math.random() * online.length)];
				broadcastFromPop(origin, Math.random() < 0.7 ? "74, 222, 128" : "125, 211, 252");
			}
		}

		const landed: Pulse[] = [];
		pulses = pulses.filter((p) => {
			p.t += p.speed * dt;
			if (p.t >= 1) {
				landed.push(p);
				return false;
			}
			return true;
		});

		for (const p of landed) {
			if (p.toPop === undefined || !p.visited) continue;
			const pop = pops[p.toPop];
			if (!pop?.online) continue;
			pop.flash = 1;
			rings.push({ x: pop.x, y: pop.y, r: 5, maxR: 34, a: 0.75, rgb: p.rgb });
			for (const nxt of pop.links) {
				if (p.visited.has(nxt)) continue;
				p.visited.add(nxt);
				const target = pops[nxt];
				const len = Math.max(1, Math.hypot(target.x - pop.x, target.y - pop.y));
				pulses.push({ from: pop, to: target, toPop: nxt, t: 0, speed: 290 / len, rgb: p.rgb, visited: p.visited });
			}
		}

		rings = rings.filter((r) => {
			r.r += 72 * dt;
			r.a = Math.max(0, (1 - r.r / r.maxR) * 0.85);
			return r.r < r.maxR && r.a > 0.02;
		});
	}

	function render() {
		if (!w || !h) return;
		ctx.clearRect(0, 0, w, h);

		// 1. Stylized world dot-matrix silhouette.
		ctx.fillStyle = "rgba(148, 163, 184, 0.22)";
		for (const d of landDots) {
			ctx.fillRect(d.x - 1, d.y - 1, 2.2, 2.2);
		}

		// Compute pointer's nearest edge & shortest-path tree across the cluster.
		const hit = pointer.inside ? nearestPop(pointer.x, pointer.y) : null;
		const treeEdges = hit ? bfsEdges(hit.index) : new Set<string>();

		// 2. Global relay backbone arcs.
		for (const [ai, bi] of activeEdges) {
			const a = pops[ai];
			const b = pops[bi];
			const c = arcControl(a, b);
			const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
			const inTree = treeEdges.has(key);
			ctx.strokeStyle = inTree ? "rgba(74, 222, 128, 0.48)" : "rgba(100, 116, 139, 0.34)";
			ctx.lineWidth = inTree ? 2 : 1.25;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
			ctx.stroke();
		}

		// 3. Live anycast arc from cursor to nearest online edge PoP.
		const repaint = () => {
			if (!isLive) render();
		};
		if (pointer.inside && hit) {
			const target = pops[hit.index];
			const c = arcControl(pointer, target);
			ctx.save();
			ctx.strokeStyle = "rgba(74, 222, 128, 0.75)";
			ctx.lineWidth = 1.8;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(pointer.x, pointer.y);
			ctx.quadraticCurveTo(c.x, c.y, target.x, target.y);
			ctx.stroke();
			ctx.restore();

			// Hand-drawn MoQ cat client marker + live RTT label.
			ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
			ctx.beginPath();
			ctx.arc(pointer.x, pointer.y, 12, 0, Math.PI * 2);
			ctx.fill();
			if (!drawIcon(ctx, CLIENT_ICON, pointer.x, pointer.y, 20, repaint)) {
				ctx.fillStyle = "#4ade80";
				ctx.beginPath();
				ctx.arc(pointer.x, pointer.y, 3.2, 0, Math.PI * 2);
				ctx.fill();
			}

			const rtt = Math.max(6, Math.round((hit.dist / Math.max(w, 1)) * 110 + 7));
			ctx.font = '500 10.5px "DM Mono", ui-monospace, monospace';
			ctx.fillStyle = "rgba(74, 222, 128, 0.92)";
			ctx.fillText(`→ ${target.code} · ${rtt}ms`, pointer.x + 15, pointer.y - 10);
		}

		// 4. Traveling broadcast pulses.
		for (const p of pulses) {
			const c = arcControl(p.from, p.to);
			const at = alongQuad(p.from, c, p.to, p.t);
			const tail = alongQuad(p.from, c, p.to, Math.max(0, p.t - 0.16));
			const grad = ctx.createLinearGradient(tail.x, tail.y, at.x, at.y);
			grad.addColorStop(0, `rgba(${p.rgb}, 0)`);
			grad.addColorStop(1, `rgba(${p.rgb}, 0.95)`);
			ctx.strokeStyle = grad;
			ctx.lineWidth = 2.4;
			ctx.beginPath();
			ctx.moveTo(tail.x, tail.y);
			ctx.lineTo(at.x, at.y);
			ctx.stroke();

			ctx.fillStyle = `rgba(${p.rgb}, 1)`;
			ctx.beginPath();
			ctx.arc(at.x, at.y, 2.6, 0, Math.PI * 2);
			ctx.fill();
		}

		// 5. Shockwave rings.
		for (const r of rings) {
			ctx.strokeStyle = `rgba(${r.rgb}, ${r.a.toFixed(3)})`;
			ctx.lineWidth = 1.6;
			ctx.beginPath();
			ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
			ctx.stroke();
		}

		// 6. Edge PoP hand-drawn globes.
		ctx.font = '500 10.5px "DM Mono", ui-monospace, monospace';
		for (let i = 0; i < pops.length; i++) {
			const p = pops[i];
			const isNearest = hit?.index === i;
			const isHov = hoveredPop === i;
			const iconSize = isHov || isNearest ? 26 : 22;
			const padR = iconSize * 0.56 + 3;

			if (p.online && (p.flash > 0.05 || isNearest || isHov)) {
				ctx.fillStyle = `rgba(74, 222, 128, ${(isHov || isNearest ? 0.26 : 0.36 * p.flash).toFixed(3)})`;
				ctx.beginPath();
				ctx.arc(p.x, p.y, padR + 7, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.save();
			ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
			ctx.strokeStyle = p.online
				? isNearest || isHov
					? "#4ade80"
					: "rgba(44, 58, 87, 0.95)"
				: "rgba(251, 113, 133, 0.85)";
			ctx.lineWidth = isNearest || isHov ? 1.8 : 1.3;
			if (!p.online) ctx.setLineDash([2.5, 2.5]);
			ctx.beginPath();
			ctx.arc(p.x, p.y, padR, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();

			ctx.save();
			if (!p.online) ctx.globalAlpha = 0.25;
			if (!drawIcon(ctx, RELAY_ICON, p.x, p.y, iconSize, repaint)) {
				ctx.fillStyle = "#4ade80";
				ctx.beginPath();
				ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();

			if (!p.online) {
				ctx.strokeStyle = "rgba(251, 113, 133, 0.95)";
				ctx.lineWidth = 1.8;
				ctx.beginPath();
				ctx.moveTo(p.x - 6, p.y - 6);
				ctx.lineTo(p.x + 6, p.y + 6);
				ctx.moveTo(p.x + 6, p.y - 6);
				ctx.lineTo(p.x - 6, p.y + 6);
				ctx.stroke();
			}

			ctx.fillStyle = p.online
				? isNearest || isHov
					? "#eef2f8"
					: "rgba(196, 205, 220, 0.84)"
				: "rgba(251, 113, 133, 0.92)";
			ctx.fillText(p.online ? p.code : `${p.code} off`, p.x + padR + 5, p.y + 3.5);
		}
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		w = rect.width;
		h = rect.height;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const padX = Math.max(24, w * 0.05);
		const padY = 28;
		const mapW = w - padX * 2;
		const mapH = h - padY * 2;
		for (const p of pops) {
			p.x = padX + p.nx * mapW;
			p.y = padY + p.ny * mapH;
		}
		rebuildLinks();

		// Pre-sample stylized land dots on resize.
		landDots = [];
		const stepPx = w < 640 ? 18 : 16;
		for (let x = padX; x <= w - padX; x += stepPx) {
			for (let y = padY; y <= h - padY; y += stepPx) {
				const nx = (x - padX) / mapW;
				const ny = (y - padY) / mapH;
				if (CONTINENTS.some((poly) => pointInPoly(nx, ny, poly))) {
					landDots.push({ x, y });
				}
			}
		}

		updateReadout();
		render();
	}

	const toCanvas = (e: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	};

	const isControl = (target: EventTarget | null) =>
		target instanceof Element && Boolean(target.closest("a, button, input, [data-no-canvas]"));

	function popAt(x: number, y: number) {
		for (let i = 0; i < pops.length; i++) {
			if (Math.hypot(pops[i].x - x, pops[i].y - y) < 22) return i;
		}
		return -1;
	}

	surface.addEventListener("pointermove", (e) => {
		const pt = toCanvas(e);
		pointer.x = pt.x;
		pointer.y = pt.y;
		pointer.inside = true;
		hoveredPop = isControl(e.target) ? -1 : popAt(pt.x, pt.y);
		surface.style.cursor = hoveredPop !== -1 ? "pointer" : "";
		updateReadout();
		if (!isLive) render();
	});

	surface.addEventListener("pointerleave", () => {
		pointer.inside = false;
		hoveredPop = -1;
		surface.style.cursor = "";
		updateReadout();
		if (!isLive) render();
	});

	surface.addEventListener("pointerdown", (e) => {
		if (e.button !== 0 || isControl(e.target)) return;
		const pt = toCanvas(e);
		const hitIdx = popAt(pt.x, pt.y);
		if (hitIdx !== -1) {
			const pop = pops[hitIdx];
			const onlineCount = pops.filter((p) => p.online).length;
			if (pop.online && onlineCount <= 1) {
				broadcastFromPop(hitIdx);
			} else {
				pop.online = !pop.online;
				rebuildLinks();
				if (pop.online) {
					broadcastFromPop(hitIdx);
				} else {
					rings.push({ x: pop.x, y: pop.y, r: 5, maxR: 46, a: 0.9, rgb: "251, 113, 133" });
					const backup = nearestPop(pop.x, pop.y);
					if (backup) broadcastFromPop(backup.index);
				}
			}
			updateReadout();
			if (!isLive) render();
			return;
		}
		const overText = e.target instanceof Element && Boolean(e.target.closest("h2, h3, p, li, span, code"));
		if (overText) return;
		broadcastFromPoint(pt.x, pt.y);
		if (!isLive) render();
	});

	const tick = (now: number) => {
		const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
		last = now;
		step(dt);
		render();
		frame = requestAnimationFrame(tick);
	};

	whileLive(surface, (live) => {
		isLive = live;
		cancelAnimationFrame(frame);
		if (!live) {
			render();
			return;
		}
		last = performance.now();
		frame = requestAnimationFrame(tick);
	});

	loadIcon(RELAY_ICON, () => {
		if (!isLive) render();
	});
	loadIcon(CLIENT_ICON);

	resize();
	new ResizeObserver(() => resize()).observe(surface);
}
