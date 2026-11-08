// The hero's fan-out map. Edge relays sit roughly where they would on a world map and
// link to their nearest neighbours. Publishers and viewers attach to their nearest edge;
// every frame goes up to the publisher's edge, along the shortest-path tree across the
// relay mesh, and gets copied at each relay toward every viewer's edge.
import { whileLive } from "@/lib/motion";

const SVG = "http://www.w3.org/2000/svg";

type Kind = "video" | "audio" | "control";

interface Point {
	x: number;
	y: number;
}

interface Relay extends Point {
	code: string;
	nx: number;
	ny: number;
	// Kept on narrow maps too.
	core: boolean;
	links: number[];
	pulse: number;
	el: SVGGElement;
}

interface Endpoint extends Point {
	nx: number;
	ny: number;
	// Where it sits on a narrow map instead, when the wide spot would crowd its label.
	narrow?: [number, number];
	label?: string;
	icon?: string;
	publishes?: Kind;
	subscribes: Endpoint[];
	relay: number;
	// 0..1 while the access link draws in, then 1; falls back to 0 as it leaves.
	join: number;
	leaving: boolean;
	pinned: boolean;
	flash: number;
	el: SVGGElement;
	line: SVGPathElement;
}

interface Packet {
	kind: Kind;
	source: Endpoint;
	children: Map<number, number[]>;
	from: Point;
	via?: Point;
	to: Point;
	length: number;
	t: number;
	// Where it lands: a relay index, or a viewer.
	relay?: number;
	viewer?: Endpoint;
	el: SVGElement;
}

const RELAYS: Omit<Relay, "x" | "y" | "links" | "pulse" | "el">[] = [
	{ code: "sjc", nx: 0.1, ny: 0.3, core: true },
	{ code: "dfw", nx: 0.22, ny: 0.55, core: false },
	{ code: "iad", nx: 0.33, ny: 0.3, core: false },
	{ code: "gru", nx: 0.33, ny: 0.84, core: true },
	{ code: "fra", nx: 0.54, ny: 0.2, core: true },
	{ code: "jnb", nx: 0.56, ny: 0.8, core: false },
	{ code: "bom", nx: 0.68, ny: 0.5, core: true },
	{ code: "sin", nx: 0.82, ny: 0.7, core: true },
	{ code: "nrt", nx: 0.9, ny: 0.28, core: true },
	{ code: "syd", nx: 0.94, ny: 0.92, core: true },
];

// Seconds between frames, per kind.
const EVERY: Record<Kind, number> = { video: 1.1, audio: 0.85, control: 1.5 };
const SPEED = 170; // px per second
const JOIN_EVERY = 2.4;
const JOIN_TIME = 0.6;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
	const node = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	return node;
}

// A link bows a little to one side, by an amount fixed per pair, so the mesh looks drawn.
function bow(a: Point, b: Point, seed: number): Point {
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const len = dist(a, b) || 1;
	const k = (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.22 * len;
	return { x: mx - ((b.y - a.y) / len) * k, y: my + ((b.x - a.x) / len) * k };
}

function along(p: Packet): Point {
	const t = p.t;
	if (!p.via) return { x: p.from.x + (p.to.x - p.from.x) * t, y: p.from.y + (p.to.y - p.from.y) * t };
	const u = 1 - t;
	return {
		x: u * u * p.from.x + 2 * u * t * p.via.x + t * t * p.to.x,
		y: u * u * p.from.y + 2 * u * t * p.via.y + t * t * p.to.y,
	};
}

export function mount(figure: HTMLElement) {
	const svg = figure.querySelector("svg");
	if (!svg) throw new Error("fan-out map has no svg");

	const layers = {
		mesh: el("g", { class: "mesh" }),
		access: el("g", { class: "access" }),
		packets: el("g", { class: "packets" }),
		nodes: el("g", { class: "nodes" }),
	};
	svg.append(layers.mesh, layers.access, layers.packets, layers.nodes);

	let w = 0;
	let h = 0;
	let relays: Relay[] = [];
	let packets: Packet[] = [];
	const endpoints: Endpoint[] = [];
	const clock: Record<string, number> = {};
	let joinIn = JOIN_EVERY;

	const pad = () => (w < 480 ? 26 : 34);
	const place = (p: { nx: number; ny: number }): Point => ({
		x: pad() + p.nx * (w - 2 * pad()),
		y: pad() + p.ny * (h - 2 * pad() - 10),
	});
	const spot = (e: Endpoint) => (w < 480 && e.narrow ? place({ nx: e.narrow[0], ny: e.narrow[1] }) : place(e));
	const nearest = (p: Point) => {
		let best = 0;
		for (let i = 1; i < relays.length; i++) if (dist(p, relays[i]) < dist(p, relays[best])) best = i;
		return best;
	};

	function addEndpoint(spec: Partial<Endpoint> & { nx: number; ny: number }, join = 1) {
		const e: Endpoint = {
			subscribes: [],
			relay: 0,
			join,
			leaving: false,
			pinned: false,
			flash: 0,
			x: 0,
			y: 0,
			...spec,
			el: el("g", { class: "endpoint" }),
			line: el("path", { class: "access-link", pathLength: 1 }),
		};
		endpoints.push(e);
		layers.access.append(e.line);
		layers.nodes.append(e.el);
		drawEndpoint(e);
		return e;
	}

	function drawEndpoint(e: Endpoint) {
		e.el.replaceChildren();
		const size = w < 480 ? 24 : 30;
		if (e.icon) {
			e.el.append(el("image", { href: e.icon, x: -size / 2, y: -size / 2, width: size, height: size }));
		} else {
			e.el.append(el("circle", { r: e.publishes ? 4.5 : 3.5, class: e.publishes ? "dot-pub" : "dot-sub" }));
		}
		if (e.label) {
			const right = e.nx < 0.82;
			const dx = (e.icon ? size / 2 : 5) + 5;
			const text = el("text", {
				x: right ? dx : -dx,
				y: 4,
				"text-anchor": right ? "start" : "end",
				class: "label-end",
			});
			text.textContent = e.label;
			e.el.append(text);
		}
	}

	function layout() {
		const box = svg?.getBoundingClientRect();
		if (!box || !svg) return;
		w = box.width;
		h = box.height;
		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		const narrow = w < 480;
		relays = RELAYS.filter((r) => r.core || !narrow).map((r) => ({
			...r,
			...place(r),
			links: [],
			pulse: 0,
			el: el("g"),
		}));

		// Each relay links to its two nearest, then any islands join at their closest pair.
		const pairs = new Set<string>();
		const link = (a: number, b: number) => {
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (pairs.has(key)) return;
			pairs.add(key);
			relays[a].links.push(b);
			relays[b].links.push(a);
		};
		relays.forEach((r, i) => {
			const near = relays
				.map((o, j) => [j, dist(r, o)] as const)
				.filter(([j]) => j !== i)
				.sort((a, b) => a[1] - b[1]);
			for (const [j] of near.slice(0, 2)) link(i, j);
		});
		for (;;) {
			const seen = new Set([0]);
			const stack = [0];
			while (stack.length)
				for (const n of relays[stack.pop() as number].links) if (!seen.has(n) && seen.add(n)) stack.push(n);
			if (seen.size === relays.length) break;
			let best: [number, number, number] = [0, 0, Number.POSITIVE_INFINITY];
			for (const a of seen)
				for (let b = 0; b < relays.length; b++)
					if (!seen.has(b) && dist(relays[a], relays[b]) < best[2]) best = [a, b, dist(relays[a], relays[b])];
			link(best[0], best[1]);
		}

		layers.mesh.replaceChildren();
		for (const key of pairs) {
			const [a, b] = key.split("-").map(Number);
			const c = bow(relays[a], relays[b], a * 31 + b);
			const d = `M${relays[a].x},${relays[a].y} Q${c.x},${c.y} ${relays[b].x},${relays[b].y}`;
			layers.mesh.append(el("path", { d, class: "mesh-link" }), el("path", { d, class: "mesh-link-2" }));
		}

		const globe = narrow ? 26 : 32;
		for (const r of relays) {
			r.el.append(
				el("circle", { r: globe / 2 + 3, class: "relay-pad" }),
				el("circle", { r: globe / 2 + 3, class: "relay-pulse" }),
				el("image", { href: "/drawn/icon-globe.svg", x: -globe / 2, y: -globe / 2, width: globe, height: globe }),
			);
			const text = el("text", { y: globe / 2 + 15, "text-anchor": "middle", class: "label-relay" });
			text.textContent = `relay.${r.code}`;
			r.el.append(text);
			r.el.setAttribute("transform", `translate(${r.x} ${r.y})`);
		}
		for (const g of layers.nodes.querySelectorAll(":scope > g.relay")) g.remove();
		for (const r of relays) {
			r.el.classList.add("relay");
			layers.nodes.prepend(r.el);
		}

		for (const e of endpoints) {
			Object.assign(e, spot(e));
			e.relay = nearest(e);
			drawEndpoint(e);
		}
		for (const p of packets) p.el.remove();
		packets = [];
	}

	// The relays a broadcast has to reach: every edge with a viewer, plus the path back to
	// the publisher's edge. Returns each relay's next hops.
	function tree(source: Endpoint) {
		const root = source.relay;
		const parent = new Map([[root, -1]]);
		const queue = [root];
		while (queue.length) {
			const a = queue.shift() as number;
			for (const b of relays[a].links) {
				if (parent.has(b)) continue;
				parent.set(b, a);
				queue.push(b);
			}
		}
		const children = new Map<number, number[]>();
		const need = new Set<number>();
		for (const e of endpoints) {
			if (e.join < 1 || e.leaving || !e.subscribes.includes(source)) continue;
			for (let r = e.relay; r !== -1 && !need.has(r); r = parent.get(r) ?? -1) {
				need.add(r);
				const up = parent.get(r) ?? -1;
				if (up !== -1) children.set(up, [...(children.get(up) ?? []), r]);
			}
		}
		return children;
	}

	function send(
		kind: Kind,
		source: Endpoint,
		children: Map<number, number[]>,
		from: Point,
		to: Point,
		land: { relay?: number; viewer?: Endpoint },
		via?: Point,
	) {
		const shape =
			kind === "video"
				? el("rect", { width: 6, height: 6, x: -3, y: -3, rx: 1, class: "pk-video" })
				: el("circle", { r: kind === "audio" ? 2.6 : 2.4, class: kind === "audio" ? "pk-audio" : "pk-control" });
		layers.packets.append(shape);
		const length = via ? (dist(from, via) + dist(via, to) + dist(from, to)) / 2 : dist(from, to);
		packets.push({ kind, source, children, from, via, to, length: Math.max(length, 1), t: 0, ...land, el: shape });
	}

	function arrive(p: Packet) {
		if (p.viewer) {
			p.viewer.flash = 1;
			return;
		}
		const at = p.relay as number;
		const r = relays[at];
		let copies = 0;
		for (const next of p.children.get(at) ?? []) {
			send(
				p.kind,
				p.source,
				p.children,
				r,
				relays[next],
				{ relay: next },
				bow(r, relays[next], Math.min(at, next) * 31 + Math.max(at, next)),
			);
			copies++;
		}
		for (const e of endpoints) {
			if (e.relay !== at || e.join < 1 || e.leaving || !e.subscribes.includes(p.source)) continue;
			send(p.kind, p.source, p.children, r, e, { viewer: e });
			copies++;
		}
		if (copies > 1) r.pulse = 1;
	}

	function emit(source: Endpoint) {
		const kind = source.publishes as Kind;
		const children = tree(source);
		if (
			!children.size &&
			!endpoints.some((e) => e.relay === source.relay && e.subscribes.includes(source) && e.join >= 1)
		)
			return;
		send(kind, source, children, source, relays[source.relay], { relay: source.relay });
	}

	// A new viewer turns up somewhere with room and attaches to its nearest edge.
	function join() {
		const viewers = endpoints.filter((e) => !e.pinned && !e.leaving);
		const cap = w < 480 ? 6 : 11;
		if (viewers.length >= cap) viewers[0].leaving = true;
		for (let tries = 0; tries < 40; tries++) {
			// Somewhere near an edge, so the access link stays short.
			const hub = relays[Math.floor(Math.random() * relays.length)];
			const angle = rand(0, Math.PI * 2);
			const reach = rand(48, w < 480 ? 72 : 96);
			const at = { x: hub.x + Math.cos(angle) * reach, y: hub.y + Math.sin(angle) * reach };
			if (at.x < 10 || at.x > w - 10 || at.y < 10 || at.y > h - 10) continue;
			if (
				relays.some((r) => dist(r, at) < 46 || (Math.abs(r.x - at.x) < 48 && at.y - r.y > 8 && at.y - r.y < 42)) ||
				endpoints.some((e) => dist(e, at) < (e.label ? 64 : 30))
			)
				continue;
			const where = { nx: (at.x - pad()) / (w - 2 * pad()), ny: (at.y - pad()) / (h - 2 * pad() - 10) };
			const pubs = endpoints.filter((e) => e.publishes && e.publishes !== "control");
			const pick = Math.random();
			const watch = pick < 0.6 ? pubs[0] : pick < 0.85 ? pubs[1] : pubs[2];
			const e = addEndpoint({ ...where, ...at, subscribes: [watch] }, 0);
			e.relay = nearest(e);
			return;
		}
	}

	function step(dt: number) {
		for (const e of endpoints) {
			if (e.publishes) {
				const key = e.label ?? "";
				clock[key] = (clock[key] ?? rand(0, EVERY[e.publishes])) - dt;
				if (clock[key] <= 0) {
					clock[key] += EVERY[e.publishes] * rand(0.85, 1.15);
					emit(e);
				}
			}
			if (e.leaving) e.join = Math.max(0, e.join - dt / JOIN_TIME);
			else if (e.join < 1) {
				e.join = Math.min(1, e.join + dt / JOIN_TIME);
				// The edge rings once as a new viewer snaps onto it.
				if (e.join === 1) relays[e.relay].pulse = 1;
			}
			e.flash = Math.max(0, e.flash - dt * 2.2);
		}
		for (let i = endpoints.length - 1; i >= 0; i--) {
			const e = endpoints[i];
			if (!e.leaving || e.join > 0) continue;
			e.el.remove();
			e.line.remove();
			endpoints.splice(i, 1);
		}
		for (const r of relays) r.pulse = Math.max(0, r.pulse - dt * 1.6);

		joinIn -= dt;
		if (joinIn <= 0) {
			joinIn = JOIN_EVERY * rand(0.8, 1.2);
			join();
		}

		const landed: Packet[] = [];
		packets = packets.filter((p) => {
			p.t += (SPEED * dt) / p.length;
			if (p.t < 1) return true;
			p.el.remove();
			landed.push(p);
			return false;
		});
		for (const p of landed) arrive(p);
	}

	function render() {
		for (const p of packets) {
			const at = along(p);
			p.el.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
		}
		for (const e of endpoints) {
			const r = relays[e.relay];
			e.line.setAttribute("d", `M${e.x},${e.y} L${r.x},${r.y}`);
			e.line.style.strokeDashoffset = String(1 - e.join);
			e.el.setAttribute("transform", `translate(${e.x} ${e.y}) scale(${(0.4 + 0.6 * e.join).toFixed(3)})`);
			e.el.style.opacity = e.join.toFixed(3);
			e.el.classList.toggle("lit", e.flash > 0.5);
		}
		for (const r of relays) {
			const ring = r.el.querySelector<SVGCircleElement>(".relay-pulse");
			if (!ring) continue;
			ring.style.opacity = (r.pulse * 0.8).toFixed(3);
			ring.setAttribute("r", String(18 + (1 - r.pulse) * 12));
		}
	}

	layout();

	// The cast that's always on: three broadcasts and a robot driven by a remote operator.
	addEndpoint({
		nx: 0.02,
		ny: 0.06,
		label: "camera",
		icon: "/icons/use-case/voice-video-ai.svg",
		publishes: "video",
		pinned: true,
	});
	const mic = addEndpoint({
		nx: 0.62,
		ny: 0.03,
		narrow: [0.48, 0.02],
		label: "mic",
		icon: "/icons/cards/mic.svg",
		publishes: "audio",
		pinned: true,
	});
	const robot = addEndpoint({
		nx: 0.99,
		ny: 0.05,
		label: "robot",
		icon: "/icons/use-case/robotics.svg",
		publishes: "video",
		pinned: true,
	});
	const operator = addEndpoint({
		nx: 0.12,
		ny: 0.78,
		narrow: [0.03, 0.64],
		label: "operator",
		icon: "/icons/use-case/interactive.svg",
		publishes: "control",
		subscribes: [robot],
		pinned: true,
	});
	robot.subscribes.push(operator);
	addEndpoint({ nx: 0.7, ny: 0.94, label: "agent", subscribes: [mic], pinned: true });
	for (const e of endpoints) {
		Object.assign(e, spot(e));
		e.relay = nearest(e);
	}
	for (let i = 0; i < (w < 480 ? 4 : 8); i++) {
		join();
		const e = endpoints[endpoints.length - 1];
		if (e) e.join = 1;
	}

	// A paused map is a frozen frame from a few seconds in, so traffic is mid-flight.
	for (let i = 0; i < 240; i++) step(1 / 60);
	render();

	let frame = 0;
	let last = 0;
	const tick = (now: number) => {
		step(Math.min(0.05, (now - last) / 1000));
		last = now;
		render();
		frame = requestAnimationFrame(tick);
	};
	whileLive(figure, (live) => {
		cancelAnimationFrame(frame);
		if (!live) return;
		last = performance.now();
		frame = requestAnimationFrame(tick);
	});

	let width = w;
	new ResizeObserver(() => {
		const box = svg.getBoundingClientRect();
		if (Math.abs(box.width - width) < 1 && Math.abs(box.height - h) < 1) return;
		width = box.width;
		layout();
		render();
	}).observe(svg);
}
