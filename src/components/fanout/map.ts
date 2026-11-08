// The hero's fan-out map. Edge relays sit roughly where they would on a world map and
// link to their nearest neighbours. Publishers and viewers attach to their nearest edge;
// every frame goes up to the publisher's edge, along the shortest-path tree across the
// relay mesh, and gets copied at each relay toward every viewer's edge.
//
// Sources take turns so one broadcast can be followed at a time: its frames carry its
// color, the links its tree uses light up, and endpoints with no part in it dim.
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
	el: SVGGElement;
}

interface Endpoint extends Point {
	nx: number;
	ny: number;
	// Where it sits on a narrow map instead, when the wide spot would crowd its label.
	narrow?: [number, number];
	label?: string;
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
	flash: number;
	// 1 while it takes part in the current turn, easing toward a dim level otherwise.
	focus: number;
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
	{ code: "sjc", nx: 0.12, ny: 0.34 },
	{ code: "gru", nx: 0.3, ny: 0.8 },
	{ code: "fra", nx: 0.5, ny: 0.24 },
	{ code: "sin", nx: 0.74, ny: 0.68 },
	{ code: "nrt", nx: 0.9, ny: 0.32 },
];

// Seconds between frames during a source's turn, per kind.
const EVERY: Record<Kind, number> = { video: 0.32, audio: 0.26, control: 0.5 };
// A turn sends frames for this long, then waits for them to land and rests.
const BURST = 1.4;
const REST = 0.5;
const DIM = 0.35;
const SPEED = 200; // px per second
const JOIN_EVERY = 3.2;
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
	let joinIn = JOIN_EVERY;
	// Each mesh link's two pen strokes, by relay pair.
	let mesh = new Map<string, SVGPathElement[]>();

	// Whose turn it is. Filled in once the cast exists.
	let turns: Endpoint[][] = [];
	// How many roaming viewers each broadcast draws, relative to the others.
	const WANT = new Map<Endpoint, number>();
	const turn = { at: 0, t: 0, rest: 0, next: new Map<Endpoint, number>(), hot: new Set<string>() };
	const current = () => turns[turn.at] ?? [];
	const involved = (e: Endpoint) => current().some((s) => s === e || e.subscribes.includes(s));
	const pair = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

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
			focus: 1,
			color: "",
			x: 0,
			y: 0,
			...spec,
			el: el("g", { class: "endpoint" }),
			line: el("path", { class: "access-link", pathLength: 1 }),
		};
		if (!e.color) e.color = e.subscribes[0]?.color ?? "";
		e.el.style.setProperty("--c", e.color);
		e.line.style.setProperty("--c", e.color);
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
			// Under the icon when its access link would run through a label beside it.
			const text = e.under
				? el("text", { y: size / 2 + 13, "text-anchor": "middle", class: "label-end" })
				: el("text", { x: right ? dx : -dx, y: 4, "text-anchor": right ? "start" : "end", class: "label-end" });
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
		relays = RELAYS.map((r) => ({
			...r,
			...place(r),
			links: [],
			pulse: 0,
			el: el("g"),
		}));

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
		turn.hot.clear();
		for (const key of pairs) {
			const [a, b] = key.split("-").map(Number);
			const c = bow(relays[a], relays[b], a * 31 + b);
			const d = `M${relays[a].x},${relays[a].y} Q${c.x},${c.y} ${relays[b].x},${relays[b].y}`;
			const strokes = [el("path", { d, class: "mesh-link" }), el("path", { d, class: "mesh-link-2" })];
			mesh.set(key, strokes);
			layers.mesh.append(...strokes);
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
		// Video frames are squares, audio and control are dots, all in their source's color.
		const shape =
			kind === "video"
				? el("rect", { width: 7, height: 7, x: -3.5, y: -3.5, rx: 1.2, class: "packet" })
				: el("circle", { r: 3.2, class: "packet" });
		shape.style.setProperty("--c", source.color);
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
		for (const [up, downs] of children) for (const down of downs) turn.hot.add(pair(up, down));
		paint();
		send(kind, source, children, source, relays[source.relay], { relay: source.relay });
	}

	// Lights the mesh links the current turn's trees use, in the turn's color.
	function paint() {
		layers.mesh.style.setProperty("--c", current()[0]?.color ?? "");
		for (const [key, strokes] of mesh) for (const s of strokes) s.classList.toggle("hot", turn.hot.has(key));
	}

	function advance() {
		turn.at = (turn.at + 1) % turns.length;
		turn.t = 0;
		turn.rest = 0;
		turn.hot.clear();
		turn.next = new Map(current().map((s, i) => [s, i * 0.2]));
		paint();
	}

	// A new viewer turns up somewhere with room and attaches to its nearest edge.
	function join() {
		const viewers = endpoints.filter((e) => !e.pinned && !e.leaving);
		const cap = w < 480 ? 3 : 4;
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
			// Watch whichever broadcast is furthest below its share, so every turn fans out.
			const share = (e: Endpoint) =>
				endpoints.filter((v) => !v.pinned && !v.leaving && v.subscribes.includes(e)).length / (WANT.get(e) ?? 1);
			const pubs = [...WANT.keys()].sort((a, b) => share(a) - share(b) || Math.random() - 0.5);
			const watch = pubs[0];
			const e = addEndpoint({ ...where, ...at, subscribes: [watch] }, 0);
			e.relay = nearest(e);
			return;
		}
	}

	function step(dt: number) {
		turn.t += dt;
		if (turn.t < BURST) {
			for (const [source, at] of turn.next) {
				if (turn.t < at) continue;
				turn.next.set(source, at + EVERY[source.publishes as Kind]);
				emit(source);
			}
		} else if (!packets.length || turn.t > BURST + 6) {
			turn.rest += dt;
			if (turn.rest >= REST) advance();
		}

		for (const e of endpoints) {
			const focus = involved(e) ? 1 : DIM;
			e.focus += (focus - e.focus) * Math.min(1, dt * 5);
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
			e.el.style.opacity = (e.join * e.focus).toFixed(3);
			e.el.classList.toggle("lit", e.flash > 0.5);
			e.line.style.opacity = e.focus.toFixed(3);
			e.line.classList.toggle("hot", e.focus > 0.9);
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
	const camera = addEndpoint({
		nx: 0.02,
		ny: 0.06,
		label: "camera",
		icon: "/icons/use-case/voice-video-ai.svg",
		publishes: "video",
		color: "#22c55e",
		pinned: true,
	});
	const mic = addEndpoint({
		nx: 0.62,
		ny: 0.03,
		narrow: [0.48, 0.02],
		label: "mic",
		icon: "/icons/cards/mic.svg",
		publishes: "audio",
		color: "#7dd3fc",
		pinned: true,
	});
	const robot = addEndpoint({
		nx: 0.99,
		ny: 0.05,
		label: "robot",
		icon: "/icons/use-case/robotics.svg",
		publishes: "video",
		color: "#fcd34d",
		pinned: true,
	});
	const operator = addEndpoint({
		nx: 0.12,
		ny: 0.78,
		narrow: [0.03, 0.64],
		label: "operator",
		under: true,
		icon: "/icons/use-case/interactive.svg",
		publishes: "control",
		color: "#f1f5f9",
		subscribes: [robot],
		pinned: true,
	});
	robot.subscribes.push(operator);
	addEndpoint({ nx: 0.7, ny: 0.94, label: "agent", subscribes: [mic], pinned: true });
	for (const e of endpoints) {
		Object.assign(e, spot(e));
		e.relay = nearest(e);
	}
	// The robot and its operator share a turn: video goes one way while control comes back.
	turns = [[camera], [mic], [robot, operator]];
	WANT.set(camera, 2).set(mic, 1).set(robot, 1);
	turn.at = -1;
	advance();
	for (let i = 0; i < (w < 480 ? 2 : 3); i++) {
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
