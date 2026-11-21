// The hero's fan-out map. Edge relays sit roughly where they would on a world map and
// link to their nearest neighbours. Publishers and viewers attach to their nearest edge;
// every frame goes up to the publisher's edge, along the shortest-path tree across the
// relay mesh, and gets copied at each relay toward every viewer's edge.
//
// Every publisher streams at once, in short bursts. A broadcast's frames, label, viewers,
// and the links its frames just crossed all share its color, so each one can be followed.
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
	links: number[];
	pulse: number;
	ring: SVGCircleElement;
	el: SVGGElement;
}

interface Endpoint extends Point {
	nx: number;
	ny: number;
	// Where it sits on a narrow map instead, when the wide spot would crowd its label.
	narrow?: [number, number];
	label?: string;
	// Label under the icon, for when its access link would run through a label beside it.
	under?: boolean;
	icon?: string;
	publishes?: Kind;
	// A source's own color, or for a viewer the color of what it watches.
	color: string;
	subscribes: Endpoint[];
	relay: number;
	// 0..1 while the access link draws in, then 1; falls back to 0 as it leaves.
	join: number;
	leaving: boolean;
	pinned: boolean;
	// 1 as a frame lands or leaves, then decays; drives the ripple.
	flash: number;
	// Burst schedule for a publisher: seconds to the next frame, frames left in the burst.
	next: number;
	left: number;
	el: SVGGElement;
	ring: SVGCircleElement;
	line: SVGPathElement;
	glow: SVGPathElement;
	heat: number;
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
	// The link it lights up on the way, if it's crossing the mesh.
	link?: string;
	head: SVGElement;
	tail: SVGLineElement;
}

interface Glow {
	el: SVGPathElement;
	heat: number;
}

const RELAYS: Omit<Relay, "x" | "y" | "links" | "pulse" | "ring" | "el">[] = [
	{ code: "sjc", nx: 0.14, ny: 0.36 },
	{ code: "gru", nx: 0.3, ny: 0.86 },
	{ code: "fra", nx: 0.5, ny: 0.3 },
	{ code: "sin", nx: 0.74, ny: 0.76 },
	{ code: "nrt", nx: 0.88, ny: 0.36 },
];

// A publisher sends a burst of frames GAP apart, then waits out the rest of PERIOD.
const BURST: Record<Kind, number> = { video: 3, audio: 4, control: 2 };
const GAP = 0.09;
const PERIOD = 1.15;
const SPEED = 360; // px per second
const TAIL = 26; // px of comet tail behind each frame
const JOIN_EVERY = 1.5;
const JOIN_TIME = 0.4;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pair = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

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

function along(p: Packet, t: number): Point {
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
		glow: el("g", { class: "glow" }),
		packets: el("g", { class: "packets" }),
		nodes: el("g", { class: "nodes" }),
	};
	svg.append(layers.mesh, layers.access, layers.glow, layers.packets, layers.nodes);

	let w = 0;
	let h = 0;
	// Sizes scale with the map, so a phone gets a smaller drawing, not a cramped one.
	let s = 1;
	let relays: Relay[] = [];
	let packets: Packet[] = [];
	const endpoints: Endpoint[] = [];
	let joinIn = JOIN_EVERY;
	// Each mesh link's path, and its glow per color.
	let mesh = new Map<string, string>();
	let glows = new Map<string, Glow>();
	// How many roaming viewers each broadcast draws, relative to the others.
	const want = new Map<Endpoint, number>();

	const narrow = () => w < 480;
	const pad = () => 30 * s;
	const place = (p: { nx: number; ny: number }): Point => ({
		x: pad() + p.nx * (w - 2 * pad()),
		y: pad() + p.ny * (h - 2 * pad() - 14 * s),
	});
	const spot = (e: Endpoint) => (narrow() && e.narrow ? place({ nx: e.narrow[0], ny: e.narrow[1] }) : place(e));
	const nearest = (p: Point) => {
		let best = 0;
		for (let i = 1; i < relays.length; i++) if (dist(p, relays[i]) < dist(p, relays[best])) best = i;
		return best;
	};
	const icon = () => 46 * s;
	const globe = () => 46 * s;
	const dot = () => 6.5 * s;

	function addEndpoint(spec: Partial<Endpoint> & { nx: number; ny: number }, join = 1) {
		const e: Endpoint = {
			subscribes: [],
			relay: 0,
			join,
			leaving: false,
			pinned: false,
			flash: 0,
			next: 0,
			left: 0,
			heat: 0,
			color: "",
			x: 0,
			y: 0,
			...spec,
			el: el("g", { class: "endpoint" }),
			ring: el("circle", { class: "ripple" }),
			line: el("path", { class: "access-link", pathLength: 1 }),
			glow: el("path", { class: "glow-link" }),
		};
		if (!e.color) e.color = e.subscribes[0]?.color ?? "";
		e.left = e.publishes ? BURST[e.publishes] : 0;
		for (const node of [e.el, e.line, e.glow]) node.style.setProperty("--c", e.color);
		endpoints.push(e);
		layers.access.append(e.line);
		layers.glow.append(e.glow);
		layers.nodes.append(e.el);
		drawEndpoint(e);
		return e;
	}

	function drawEndpoint(e: Endpoint) {
		e.el.replaceChildren(e.ring);
		const size = icon();
		if (e.icon) {
			e.el.append(
				el("circle", { r: size / 2 + 2, class: "end-pad" }),
				el("image", { href: e.icon, x: -size / 2, y: -size / 2, width: size, height: size }),
			);
		} else {
			e.el.append(el("circle", { r: dot(), class: "dot" }));
		}
		if (e.label) {
			const right = e.nx < 0.82;
			const dx = (e.icon ? size / 2 : dot()) + 6;
			const text = e.under
				? el("text", { y: size / 2 + 15 * s, "text-anchor": "middle", class: "label-end" })
				: el("text", { x: right ? dx : -dx, y: 5, "text-anchor": right ? "start" : "end", class: "label-end" });
			text.textContent = e.label;
			e.el.append(text);
		}
	}

	function layout() {
		const box = svg?.getBoundingClientRect();
		if (!box || !svg) return;
		w = box.width;
		h = box.height;
		s = Math.min(1.15, Math.max(0.7, w / 640));
		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		svg.style.setProperty("--s", String(s));

		for (const r of relays) r.el.remove();
		relays = RELAYS.map((r) => ({ ...r, ...place(r), links: [], pulse: 0, ring: el("circle"), el: el("g") }));

		// Each relay links to its two nearest, then any islands join at their closest pair.
		const pairs = new Set<string>();
		const link = (a: number, b: number) => {
			const key = pair(a, b);
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
		mesh = new Map();
		for (const g of glows.values()) g.el.remove();
		glows = new Map();
		for (const key of pairs) {
			const [a, b] = key.split("-").map(Number);
			const c = bow(relays[a], relays[b], a * 31 + b);
			const d = `M${relays[a].x},${relays[a].y} Q${c.x},${c.y} ${relays[b].x},${relays[b].y}`;
			mesh.set(key, d);
			layers.mesh.append(el("path", { d, class: "mesh-link" }), el("path", { d, class: "mesh-link-2" }));
		}

		const size = globe();
		for (const r of relays) {
			r.ring = el("circle", { r: size / 2 + 4, class: "relay-pulse" });
			const text = el("text", { y: size / 2 + 16 * s, "text-anchor": "middle", class: "label-relay" });
			text.textContent = `relay.${r.code}`;
			r.el.append(
				r.ring,
				el("circle", { r: size / 2 + 4, class: "relay-pad" }),
				el("image", { href: "/drawn/icon-globe.svg", x: -size / 2, y: -size / 2, width: size, height: size }),
				text,
			);
			r.el.setAttribute("class", "relay");
			r.el.setAttribute("transform", `translate(${r.x} ${r.y})`);
			layers.nodes.prepend(r.el);
		}

		for (const e of endpoints) {
			Object.assign(e, spot(e));
			e.relay = nearest(e);
			drawEndpoint(e);
		}
		for (const p of packets) {
			p.head.remove();
			p.tail.remove();
		}
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

	function glow(link: string, color: string) {
		const key = `${link}|${color}`;
		let g = glows.get(key);
		if (!g) {
			g = { el: el("path", { d: mesh.get(link) ?? "", class: "glow-link" }), heat: 0 };
			g.el.style.setProperty("--c", color);
			layers.glow.append(g.el);
			glows.set(key, g);
		}
		g.heat = 1;
	}

	function send(p: Omit<Packet, "length" | "t" | "head" | "tail" | "from" | "to"> & { from: Point; to: Point }) {
		// Video frames are squares, audio and control are dots, all in their source's color.
		const r = (p.kind === "video" ? 4.6 : 4.2) * s;
		const head =
			p.kind === "video"
				? el("rect", { width: 2 * r, height: 2 * r, x: -r, y: -r, rx: 1.5, class: "packet" })
				: el("circle", { r, class: "packet" });
		const tail = el("line", { class: "packet-tail" });
		for (const node of [head, tail]) node.style.setProperty("--c", p.source.color);
		layers.packets.append(tail, head);
		const length = p.via ? (dist(p.from, p.via) + dist(p.via, p.to) + dist(p.from, p.to)) / 2 : dist(p.from, p.to);
		packets.push({ ...p, length: Math.max(length, 1), t: 0, head, tail });
	}

	function arrive(p: Packet) {
		if (p.viewer) {
			if (p.viewer.flash < 0.4) p.viewer.flash = 1;
			p.viewer.heat = 1;
			return;
		}
		const at = p.relay as number;
		const r = relays[at];
		let copies = 0;
		for (const next of p.children.get(at) ?? []) {
			const link = pair(at, next);
			send({
				kind: p.kind,
				source: p.source,
				children: p.children,
				from: r,
				to: relays[next],
				via: bow(relays[Math.min(at, next)], relays[Math.max(at, next)], Math.min(at, next) * 31 + Math.max(at, next)),
				relay: next,
				link,
			});
			glow(link, p.source.color);
			copies++;
		}
		for (const e of endpoints) {
			if (e.relay !== at || e.join < 1 || e.leaving || !e.subscribes.includes(p.source)) continue;
			e.glow.style.setProperty("--c", p.source.color);
			send({ kind: p.kind, source: p.source, children: p.children, from: r, to: e, viewer: e });
			copies++;
		}
		if (copies > 1 && r.pulse < 0.4) r.pulse = 1;
	}

	function emit(source: Endpoint) {
		const children = tree(source);
		const local = endpoints.some((e) => e.relay === source.relay && e.subscribes.includes(source) && e.join >= 1);
		if (!children.size && !local) return;
		if (source.flash < 0.4) source.flash = 1;
		source.heat = 1;
		source.glow.style.setProperty("--c", source.color);
		send({
			kind: source.publishes as Kind,
			source,
			children,
			from: source,
			to: relays[source.relay],
			relay: source.relay,
		});
	}

	// A new viewer turns up somewhere with room and attaches to its nearest edge.
	function join() {
		const viewers = endpoints.filter((e) => !e.pinned && !e.leaving);
		if (viewers.length >= (narrow() ? 4 : 6)) viewers[0].leaving = true;
		for (let tries = 0; tries < 40; tries++) {
			// Somewhere near an edge, so the access link stays short.
			const hub = relays[Math.floor(Math.random() * relays.length)];
			const angle = rand(0, Math.PI * 2);
			const reach = rand(56, 110) * s;
			const at = { x: hub.x + Math.cos(angle) * reach, y: hub.y + Math.sin(angle) * reach };
			const edge = 14 * s;
			if (at.x < edge || at.x > w - edge || at.y < edge || at.y > h - edge) continue;
			const clear = globe() / 2 + 16 * s;
			if (
				relays.some(
					(r) =>
						dist(r, at) < clear || (Math.abs(r.x - at.x) < 52 * s && at.y - r.y > 0 && at.y - r.y < clear + 26 * s),
				) ||
				endpoints.some((e) => dist(e, at) < (e.label ? 78 : 48) * s)
			)
				continue;
			const where = { nx: (at.x - pad()) / (w - 2 * pad()), ny: (at.y - pad()) / (h - 2 * pad() - 14 * s) };
			// Watch whichever broadcast is furthest below its share, so every one fans out.
			const share = (e: Endpoint) =>
				endpoints.filter((v) => !v.pinned && !v.leaving && v.subscribes.includes(e)).length / (want.get(e) ?? 1);
			const watch = [...want.keys()].sort((a, b) => share(a) - share(b) || Math.random() - 0.5)[0];
			const e = addEndpoint({ ...where, ...at, subscribes: [watch] }, 0);
			e.relay = nearest(e);
			return;
		}
	}

	function step(dt: number) {
		for (const e of endpoints) {
			if (e.publishes) {
				e.next -= dt;
				if (e.next <= 0) {
					emit(e);
					e.left--;
					if (e.left > 0) e.next += GAP;
					else {
						e.left = BURST[e.publishes];
						e.next += PERIOD * rand(0.9, 1.1) - GAP * (e.left - 1);
					}
				}
			}
			if (e.leaving) e.join = Math.max(0, e.join - dt / JOIN_TIME);
			else if (e.join < 1) {
				e.join = Math.min(1, e.join + dt / JOIN_TIME);
				// The edge rings once as a new viewer snaps onto it.
				if (e.join === 1) relays[e.relay].pulse = 1;
			}
			e.flash = Math.max(0, e.flash - dt * 2.4);
			e.heat = Math.max(0, e.heat - dt * 1.1);
		}
		for (let i = endpoints.length - 1; i >= 0; i--) {
			const e = endpoints[i];
			if (!e.leaving || e.join > 0) continue;
			e.el.remove();
			e.line.remove();
			e.glow.remove();
			endpoints.splice(i, 1);
		}
		for (const r of relays) r.pulse = Math.max(0, r.pulse - dt * 2);
		for (const g of glows.values()) g.heat = Math.max(0, g.heat - dt * 1.1);

		joinIn -= dt;
		if (joinIn <= 0) {
			joinIn = JOIN_EVERY * rand(0.8, 1.2);
			join();
		}

		const landed: Packet[] = [];
		packets = packets.filter((p) => {
			p.t += (SPEED * dt) / p.length;
			if (p.t < 1) return true;
			p.head.remove();
			p.tail.remove();
			landed.push(p);
			return false;
		});
		for (const p of landed) arrive(p);
	}

	function render() {
		for (const p of packets) {
			const at = along(p, p.t);
			const back = along(p, Math.max(0, p.t - (TAIL * s) / p.length));
			p.head.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
			p.tail.setAttribute("x1", back.x.toFixed(1));
			p.tail.setAttribute("y1", back.y.toFixed(1));
			p.tail.setAttribute("x2", at.x.toFixed(1));
			p.tail.setAttribute("y2", at.y.toFixed(1));
		}
		for (const e of endpoints) {
			const r = relays[e.relay];
			const d = `M${e.x},${e.y} L${r.x},${r.y}`;
			e.line.setAttribute("d", d);
			e.line.style.strokeDashoffset = String(1 - e.join);
			e.glow.setAttribute("d", d);
			e.glow.style.opacity = (e.heat * e.join).toFixed(3);
			e.el.setAttribute("transform", `translate(${e.x} ${e.y}) scale(${(0.4 + 0.6 * e.join).toFixed(3)})`);
			e.el.style.opacity = e.join.toFixed(3);
			const base = e.icon ? icon() / 2 + 2 : dot();
			e.ring.setAttribute("r", (base + (1 - e.flash) * 16 * s).toFixed(1));
			e.ring.style.opacity = (e.flash * 0.9).toFixed(3);
		}
		for (const g of glows.values()) g.el.style.opacity = g.heat.toFixed(3);
		for (const r of relays) {
			r.ring.style.opacity = (r.pulse * 0.9).toFixed(3);
			r.ring.setAttribute("r", (globe() / 2 + 4 + (1 - r.pulse) * 18 * s).toFixed(1));
		}
	}

	layout();

	// The cast that's always on: three broadcasts, a robot driven by a remote operator, and
	// an agent listening in.
	const camera = addEndpoint({
		nx: 0.02,
		ny: 0.02,
		label: "camera",
		icon: "/icons/use-case/voice-video-ai.svg",
		publishes: "video",
		color: "#22c55e",
		pinned: true,
	});
	const mic = addEndpoint({
		nx: 0.62,
		ny: 0,
		narrow: [0.5, 0],
		label: "mic",
		icon: "/icons/cards/mic.svg",
		publishes: "audio",
		color: "#7dd3fc",
		pinned: true,
	});
	const robot = addEndpoint({
		nx: 0.99,
		ny: 0.02,
		label: "robot",
		icon: "/icons/use-case/robotics.svg",
		publishes: "video",
		color: "#fcd34d",
		pinned: true,
	});
	const operator = addEndpoint({
		nx: 0.04,
		ny: 0.88,
		label: "operator",
		under: true,
		icon: "/icons/use-case/interactive.svg",
		publishes: "control",
		color: "#f1f5f9",
		subscribes: [robot],
		pinned: true,
	});
	robot.subscribes.push(operator);
	addEndpoint({ nx: 0.97, ny: 1, label: "agent", subscribes: [mic], pinned: true });
	want.set(camera, 2).set(mic, 1).set(robot, 1);
	// Stagger the bursts so the broadcasts overlap without marching in step.
	for (const [e, at] of [
		[camera, 0],
		[mic, 0.35],
		[robot, 0.7],
		[operator, 0.85],
	] as const)
		e.next = at;
	for (const e of endpoints) {
		Object.assign(e, spot(e));
		e.relay = nearest(e);
	}
	for (let i = 0; i < (narrow() ? 4 : 5); i++) {
		join();
		const e = endpoints[endpoints.length - 1];
		if (e) e.join = 1;
	}

	// A paused map is a frozen frame from a few seconds in, so traffic is mid-flight.
	for (let i = 0; i < 180; i++) step(1 / 60);
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
