// Full-bleed interactive hero relay mesh.
// Relays form a connected backbone; publishers and viewers attach to their
// nearest online edge relay. Traffic is typed (video frames, audio waveforms,
// data/control pulses) and fans out along shortest-path trees.
//
// Interactive:
// - Hover a node to inspect its live fan-out tree.
// - Click an endpoint to publish a live burst in the selected media kind.
// - Click empty space to spawn a new viewer that auto-connects to its nearest edge.
// - Click a relay to toggle it offline/online and watch endpoints fail over.
// - Drag any relay or endpoint to rewire the mesh in real time.
import { drawIcon, loadIcon } from "@/components/home/icons";
import { whileLive } from "@/lib/motion";

export type Kind = "video" | "audio" | "data";

const KINDS: Record<Kind, { rgb: string; hex: string }> = {
	video: { rgb: "74, 222, 128", hex: "#4ade80" },
	audio: { rgb: "125, 211, 252", hex: "#7dd3fc" },
	data: { rgb: "252, 211, 77", hex: "#fcd34d" },
};

const KIND_LIST: Kind[] = ["video", "audio", "data"];

const RELAY_NAMES = [
	"relay.sjc",
	"relay.iad",
	"relay.fra",
	"relay.nrt",
	"relay.lhr",
	"relay.sin",
	"relay.gru",
	"relay.ord",
	"relay.syd",
];

const RELAY_ICON = "/drawn/icon-globe.svg";

const FEATURED_ENDPOINTS: Array<{ label: string; icon: string; kind: Kind }> = [
	{ label: "cam-01", icon: "/icons/cards/snapshot.svg", kind: "video" },
	{ label: "moq-boy", icon: "/demo/moqboy.svg", kind: "data" },
	{ label: "carla-sim", icon: "/demo/carla.svg", kind: "video" },
	{ label: "voice-ai", icon: "/voice/ai.svg", kind: "audio" },
	{ label: "robot-07", icon: "/icons/use-case/robotics.svg", kind: "video" },
	{ label: "mic-04", icon: "/icons/cards/mic.svg", kind: "audio" },
	{ label: "obs-ingest", icon: "/icons/use-case/contribution.svg", kind: "video" },
	{ label: "browser-12", icon: "/icons/cards/window.svg", kind: "video" },
	{ label: "bunny-live", icon: "/demo/bunny.svg", kind: "video" },
	{ label: "hang-room", icon: "/icons/use-case/conferencing.svg", kind: "audio" },
	{ label: "gamepad-1", icon: "/icons/use-case/interactive.svg", kind: "data" },
	{ label: "hls-edge", icon: "/icons/cards/hls.svg", kind: "video" },
];

const PEER_ICONS = [
	"/blog/open-for-business/viewers-1.svg",
	"/voice/you.svg",
	"/icons/cards/window.svg",
	"/icons/cards/android.svg",
	"/icons/cards/apple.svg",
	"/icons/cards/linux.svg",
	"/icons/cards/mic.svg",
	"/icons/cards/snapshot.svg",
	"/icons/use-case/conferencing.svg",
];

const WORDS = ["subscribe", "announce", "keyframe", "steer", "gop", "ack", "sync", "join", "ping", "live"];

const PAN = 26;
const MAX_PACKETS = 320;
const MAX_USER_NODES = 14;
const FANOUT_SPEED = 245; // px/s

interface RelayNode {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	label: string;
	online: boolean;
	flash: number;
	flashRgb: string;
	links: number[];
}

interface EndpointNode {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	label: string | null;
	icon: string;
	kind: Kind;
	relay: number;
	birth: number;
	handoff: number;
	flash: number;
	flashRgb: string;
	user: boolean;
}

interface LinkHeat {
	heat: number;
	rgb: string;
}

interface Packet {
	kind: Kind;
	word: string | null;
	from: { x: number; y: number };
	to: { x: number; y: number };
	via?: { x: number; y: number };
	fromRef: { kind: "relay"; id: number } | { kind: "endpoint"; id: number };
	toRef: { kind: "relay"; id: number } | { kind: "endpoint"; id: number };
	t: number;
	speed: number; // progress per second
	phase: number;
	big: number;
	linkKey?: string;
	// Pub/sub tree fanout
	burst?: Set<number>;
	depth?: number;
	// Point-to-point relay route
	path?: number[];
	hop?: number;
	destEndpoint?: number;
}

interface Ring {
	x: number;
	y: number;
	r: number;
	maxR: number;
	a: number;
	rgb: string;
	width: number;
}

type HitTarget = { type: "relay"; node: RelayNode } | { type: "endpoint"; node: EndpointNode };

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function bowControl(a: { x: number; y: number }, b: { x: number; y: number }, seed: number) {
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const len = dist(a, b) || 1;
	const k = (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.14 * len;
	return { x: mx - ((b.y - a.y) / len) * k, y: my + ((b.x - a.x) / len) * k };
}

function pointAlong(
	a: { x: number; y: number },
	b: { x: number; y: number },
	via: { x: number; y: number } | undefined,
	t: number,
) {
	if (!via) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
	const u = 1 - t;
	return {
		x: u * u * a.x + 2 * u * t * via.x + t * t * b.x,
		y: u * u * a.y + 2 * u * t * via.y + t * t * b.y,
	};
}

function curveLength(a: { x: number; y: number }, b: { x: number; y: number }, via?: { x: number; y: number }) {
	if (!via) return Math.max(1, dist(a, b));
	return Math.max(1, (dist(a, via) + dist(via, b) + dist(a, b)) / 2);
}

export function mount(root: HTMLElement) {
	const foundCanvas = root.querySelector<HTMLCanvasElement>("[data-mesh-canvas]");
	if (!foundCanvas) throw new Error("fan-out mesh has no canvas");
	const foundCtx = foundCanvas.getContext("2d");
	if (!foundCtx) throw new Error("fan-out mesh could not acquire 2d context");
	const canvas: HTMLCanvasElement = foundCanvas;
	const ctx: CanvasRenderingContext2D = foundCtx;

	// Interactive surface is the enclosing hero section so clicks in whitespace work while links/text remain usable.
	const surface = root.closest("section") ?? root;
	const kindButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-kind]"));
	const failoverBtn = root.querySelector<HTMLButtonElement>("[data-failover-btn]");
	const statusEl = root.querySelector<HTMLElement>("[data-mesh-status]");

	let w = 0;
	let h = 0;
	let dpr = 1;
	let isLive = false;
	let frame = 0;
	let last = 0;
	let nextEndpointId = 1;
	let activeKind: Kind = "video";

	let relays: RelayNode[] = [];
	let endpoints: EndpointNode[] = [];
	let packets: Packet[] = [];
	let rings: Ring[] = [];
	let backbonePairs: Array<[number, number]> = [];
	const linkHeat = new Map<string, LinkHeat>();

	let autoBurstIn = 0.6;
	let autoRouteIn = 0.35;

	// Pointer, hover, and drag state
	const pan = { x: 0, y: 0, tx: 0, ty: 0 };
	const finePointer = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
	let pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
	let hovered: HitTarget | null = null;
	let dragging: {
		target: HitTarget;
		pointerId: number;
		startX: number;
		startY: number;
		moved: boolean;
	} | null = null;
	let pendingTap: { pointerId: number; x: number; y: number; moved: boolean } | null = null;

	const relayById = (id: number) => relays.find((r) => r.id === id);
	const endpointById = (id: number) => endpoints.find((e) => e.id === id);
	const repaint = () => {
		if (!isLive) render();
	};

	function updateStatus() {
		const offlineRelays = relays.filter((r) => !r.online);
		const online = relays.length - offlineRelays.length;
		const total = relays.length;
		if (failoverBtn) {
			const hasOffline = offlineRelays.length > 0;
			failoverBtn.setAttribute("aria-pressed", String(hasOffline));
			failoverBtn.dataset.active = hasOffline ? "true" : "false";
			failoverBtn.textContent = hasOffline ? "restore" : "failover";
		}
		if (!statusEl) return;
		if (offlineRelays.length > 0) {
			const names = offlineRelays.map((r) => r.label).join(", ");
			statusEl.textContent = `${online}/${total} relays · ${names} offline`;
			statusEl.dataset.degraded = "true";
		} else {
			statusEl.textContent = `${online} relays · ${endpoints.length} peers`;
			delete statusEl.dataset.degraded;
		}
	}

	function setActiveKind(kind: Kind, burst = false) {
		activeKind = kind;
		for (const btn of kindButtons) {
			const selected = btn.dataset.kind === kind;
			btn.setAttribute("aria-pressed", String(selected));
			btn.dataset.active = selected ? "true" : "false";
		}
		if (burst && endpoints.length) {
			// Pick a visible endpoint on the right half when available so the feedback is immediate.
			const right = endpoints.filter((e) => e.x > w * 0.42 && e.x < w - 50 && e.y > 40 && e.y < h - 60);
			const source = right.length ? pick(right) : pick(endpoints);
			publishFromEndpoint(source, kind, true);
			if (!isLive) render();
		}
	}

	for (const btn of kindButtons) {
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			const k = btn.dataset.kind as Kind | undefined;
			if (k && k in KINDS) setActiveKind(k, true);
		});
	}
	failoverBtn?.addEventListener("click", (e) => {
		e.stopPropagation();
		const offline = relays.filter((r) => !r.online);
		if (offline.length > 0) {
			for (const r of offline) r.online = true;
			computeTopology();
			updateStatus();
			for (const r of offline) publishFromRelay(r, activeKind, true);
		} else if (relays.length > 1) {
			// Pick a prominent visible relay on the right half when available.
			const candidate = relays.find((r) => r.online && r.x > w * 0.48 && r.x < w - 60) ?? relays.find((r) => r.online);
			if (candidate) toggleRelay(candidate);
		}
		if (!isLive) render();
	});
	setActiveKind("video", false);

	function nearestOnlineRelay(pt: { x: number; y: number }, excludeId = -1): RelayNode | null {
		let best: RelayNode | null = null;
		let bestD = Number.POSITIVE_INFINITY;
		for (const r of relays) {
			if (!r.online || r.id === excludeId) continue;
			const d = dist(pt, r);
			if (d < bestD) {
				bestD = d;
				best = r;
			}
		}
		return best;
	}

	function isPacketLinkValid(p: Packet): boolean {
		const fromRelay = p.fromRef.kind === "relay" ? relayById(p.fromRef.id) : null;
		const toRelay = p.toRef.kind === "relay" ? relayById(p.toRef.id) : null;
		if (p.fromRef.kind === "relay" && !fromRelay?.online) return false;
		if (p.toRef.kind === "relay" && !toRelay?.online) return false;
		if (fromRelay && toRelay) return fromRelay.links.includes(toRelay.id);
		if (fromRelay && p.toRef.kind === "endpoint") {
			const e = endpointById(p.toRef.id);
			return Boolean(e && e.relay === fromRelay.id);
		}
		if (p.fromRef.kind === "endpoint" && toRelay) {
			const e = endpointById(p.fromRef.id);
			return Boolean(e && e.relay === toRelay.id);
		}
		return false;
	}

	function pruneInvalidPackets() {
		packets = packets.filter(isPacketLinkValid);
	}

	function computeTopology() {
		for (const r of relays) r.links = [];
		const online = relays.filter((r) => r.online);
		const pairSet = new Set<string>();
		backbonePairs = [];

		const addEdge = (a: RelayNode, b: RelayNode) => {
			const k = pairKey(a.id, b.id);
			if (pairSet.has(k)) return;
			pairSet.add(k);
			a.links.push(b.id);
			b.links.push(a.id);
			backbonePairs.push([a.id, b.id]);
		};

		// Connect each online relay to its 2 nearest online relays plus close neighbors.
		const reach = Math.min(340, Math.max(210, w * 0.28));
		for (const a of online) {
			const sorted = online
				.filter((b) => b.id !== a.id)
				.map((b) => ({ b, d: dist(a, b) }))
				.sort((u, v) => u.d - v.d);
			for (let i = 0; i < sorted.length; i++) {
				if (i < 2 || (i < 4 && sorted[i].d < reach)) addEdge(a, sorted[i].b);
			}
		}

		// Ensure the online relay backbone is one connected graph by bridging components.
		if (online.length > 1) {
			const visited = new Set<number>();
			const dfs = (start: number) => {
				const stack = [start];
				visited.add(start);
				while (stack.length) {
					const cur = stack.pop() as number;
					const node = relayById(cur);
					if (!node) continue;
					for (const nxt of node.links) {
						if (!visited.has(nxt)) {
							visited.add(nxt);
							stack.push(nxt);
						}
					}
				}
			};
			dfs(online[0].id);
			while (visited.size < online.length) {
				let bestA: RelayNode | null = null;
				let bestB: RelayNode | null = null;
				let bestD = Number.POSITIVE_INFINITY;
				for (const a of online) {
					if (!visited.has(a.id)) continue;
					for (const b of online) {
						if (visited.has(b.id)) continue;
						const d = dist(a, b);
						if (d < bestD) {
							bestD = d;
							bestA = a;
							bestB = b;
						}
					}
				}
				if (!bestA || !bestB) break;
				addEdge(bestA, bestB);
				dfs(bestB.id);
			}
		}

		// Attach every endpoint to its nearest online relay; trigger handoff flash if changed.
		for (const e of endpoints) {
			const target = nearestOnlineRelay(e);
			if (!target) continue;
			if (e.relay !== -1 && e.relay !== target.id) {
				e.handoff = 1;
				e.flash = Math.max(e.flash, 0.75);
				e.flashRgb = KINDS[e.kind].rgb;
				target.flash = Math.max(target.flash, 0.65);
				target.flashRgb = KINDS[e.kind].rgb;
			}
			e.relay = target.id;
		}
		pruneInvalidPackets();
	}

	function seed() {
		relays = [];
		endpoints = [];
		packets = [];
		rings = [];
		linkHeat.clear();
		nextEndpointId = 1;

		const relayCount = w < 640 ? 5 : w < 1024 ? 7 : 9;
		const cols = 3;
		const rows = Math.ceil(relayCount / cols);
		const padX = Math.max(88, w * 0.085);
		const padTop = 82;
		const padBottom = 114;

		// Stratified 3-row placement (staggered horizontally per row) so relays fill the middle-right cleanly
		// and never collide with the bottom HUD bar.
		for (let i = 0; i < relayCount; i++) {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const cellW = (w - 2 * padX) / (cols - 1);
			const cellH = (h - padTop - padBottom) / Math.max(1, rows - 1);
			const stagger = row % 2 === 1 ? cellW * 0.14 : -cellW * 0.06;
			const baseX = padX + col * cellW + stagger;
			const baseY = rows === 1 ? h / 2 : padTop + row * cellH;
			const jitterX = (Math.random() - 0.5) * Math.min(72, cellW * 0.28);
			const jitterY = (Math.random() - 0.5) * Math.min(44, cellH * 0.34);
			const x = Math.min(w - padX, Math.max(padX, baseX + jitterX));
			const y = Math.min(h - padBottom, Math.max(padTop, baseY + jitterY));
			relays.push({
				id: i,
				x,
				y,
				vx: (Math.random() - 0.5) * 7,
				vy: (Math.random() - 0.5) * 7,
				label: RELAY_NAMES[i % RELAY_NAMES.length],
				online: true,
				flash: 0,
				flashRgb: KINDS.video.rgb,
				links: [],
			});
		}

		const endpointCount = Math.round(Math.min(26, Math.max(12, (w * h) / 36000)));
		for (let i = 0; i < endpointCount; i++) {
			// Bias ~62% of endpoints into the open right/outer hero area on wide screens.
			const preferRight = w >= 900 && i < Math.floor(endpointCount * 0.62);
			const x = preferRight ? w * (0.42 + Math.random() * 0.52) : padX * 0.65 + Math.random() * (w - padX * 1.3);
			const y = padTop * 0.85 + Math.random() * (h - padTop - padBottom * 0.75);
			const featured = i < FEATURED_ENDPOINTS.length ? FEATURED_ENDPOINTS[i] : null;
			const kind = featured ? featured.kind : KIND_LIST[i % KIND_LIST.length];
			const icon = featured ? featured.icon : PEER_ICONS[i % PEER_ICONS.length];
			const label = featured ? featured.label : null;
			endpoints.push({
				id: nextEndpointId++,
				x,
				y,
				vx: (Math.random() - 0.5) * 10,
				vy: (Math.random() - 0.5) * 10,
				label,
				icon,
				kind,
				relay: -1,
				birth: 1,
				handoff: 0,
				flash: 0,
				flashRgb: KINDS[kind].rgb,
				user: false,
			});
		}

		computeTopology();
		updateStatus();
	}

	function heatLink(key: string, rgb: string, amount = 1) {
		const cur = linkHeat.get(key);
		if (cur) {
			cur.heat = Math.max(cur.heat, amount);
			cur.rgb = rgb;
		} else {
			linkHeat.set(key, { heat: amount, rgb });
		}
	}

	function spawnRing(x: number, y: number, rgb: string, maxR = 38, width = 1.8) {
		if (!isLive) rings = [];
		else if (rings.length >= 48) rings.shift();
		rings.push({ x, y, r: 5, maxR, a: 0.9, rgb, width });
	}

	function sendPacket(spec: Omit<Packet, "t" | "speed" | "phase"> & { pace: number }) {
		if (!isLive || packets.length >= MAX_PACKETS) return;
		const len = curveLength(spec.from, spec.to, spec.via);
		packets.push({
			kind: spec.kind,
			word: spec.word,
			from: { ...spec.from },
			to: { ...spec.to },
			via: spec.via ? { ...spec.via } : undefined,
			fromRef: spec.fromRef,
			toRef: spec.toRef,
			t: 0,
			speed: spec.pace / len,
			phase: Math.random() * Math.PI * 2,
			big: spec.big,
			linkKey: spec.linkKey,
			burst: spec.burst,
			depth: spec.depth,
			path: spec.path,
			hop: spec.hop,
			destEndpoint: spec.destEndpoint,
		});
	}

	function publishFromEndpoint(source: EndpointNode, kind: Kind, userTriggered = false) {
		const relay = relayById(source.relay);
		if (!relay?.online) return;
		const rgb = KINDS[kind].rgb;
		source.flash = 1;
		source.flashRgb = rgb;
		spawnRing(source.x, source.y, rgb, userTriggered ? 42 : 24, userTriggered ? 2.2 : 1.5);
		const word = kind === "data" ? pick(WORDS) : null;
		const pace = userTriggered ? FANOUT_SPEED * 1.15 : FANOUT_SPEED;
		sendPacket({
			kind,
			word,
			from: source,
			to: relay,
			fromRef: { kind: "endpoint", id: source.id },
			toRef: { kind: "relay", id: relay.id },
			pace,
			big: userTriggered ? 1.45 : 1.15,
			burst: new Set([relay.id]),
			depth: userTriggered ? 5 : 3,
		});
	}

	function publishFromRelay(relay: RelayNode, kind: Kind, userTriggered = false) {
		if (!relay.online) return;
		const rgb = KINDS[kind].rgb;
		relay.flash = 1;
		relay.flashRgb = rgb;
		spawnRing(relay.x, relay.y, rgb, userTriggered ? 48 : 34, userTriggered ? 2.2 : 1.6);
		const visited = new Set([relay.id]);
		const word = kind === "data" ? pick(WORDS) : null;
		fanoutFromRelay(relay, kind, word, visited, userTriggered ? 4 : 3, userTriggered ? 1.4 : 1.15);
	}

	function fanoutFromRelay(
		relay: RelayNode,
		kind: Kind,
		word: string | null,
		visited: Set<number>,
		depth: number,
		big: number,
	) {
		const rgb = KINDS[kind].rgb;
		let copies = 0;

		if (depth > 0) {
			for (const nextId of relay.links) {
				if (visited.has(nextId)) continue;
				const next = relayById(nextId);
				if (!next?.online) continue;
				visited.add(nextId);
				const key = pairKey(relay.id, nextId);
				const seed = Math.min(relay.id, nextId) * 31 + Math.max(relay.id, nextId);
				const via = bowControl(relay, next, seed);
				heatLink(key, rgb, big > 1.25 ? 1 : 0.78);
				sendPacket({
					kind,
					word,
					from: relay,
					to: next,
					via,
					fromRef: { kind: "relay", id: relay.id },
					toRef: { kind: "relay", id: nextId },
					pace: FANOUT_SPEED * (big > 1.25 ? 1.1 : 1),
					big,
					linkKey: key,
					burst: visited,
					depth: depth - 1,
				});
				copies++;
			}
		}

		// Fan out to local subscribed endpoints attached to this relay.
		const local = endpoints.filter((e) => e.relay === relay.id && (e.kind === kind || big > 1.25));
		const maxLocal = big > 1.25 ? 5 : 3;
		for (let i = 0; i < Math.min(local.length, maxLocal); i++) {
			const e = local[i];
			sendPacket({
				kind,
				word: null,
				from: relay,
				to: e,
				fromRef: { kind: "relay", id: relay.id },
				toRef: { kind: "endpoint", id: e.id },
				pace: FANOUT_SPEED * 1.05,
				big: Math.max(1, big * 0.92),
			});
			copies++;
		}

		if (copies > 0) {
			spawnRing(relay.x, relay.y, rgb, big > 1.25 ? 44 : 30, big > 1.25 ? 2 : 1.4);
		}
	}

	function routePointToPoint() {
		const online = relays.filter((r) => r.online);
		if (online.length < 2 || endpoints.length < 2) return;
		const src = pick(endpoints);
		const dst = pick(endpoints);
		if (src.id === dst.id || src.relay === dst.relay) return;
		const path = shortestRelayPath(src.relay, dst.relay);
		if (!path || path.length < 2) return;
		const firstRelay = relayById(path[0]);
		if (!firstRelay) return;
		const kind = src.kind;
		const word = kind === "data" && Math.random() < 0.45 ? pick(WORDS) : null;
		src.flash = 0.85;
		src.flashRgb = KINDS[kind].rgb;
		sendPacket({
			kind,
			word,
			from: src,
			to: firstRelay,
			fromRef: { kind: "endpoint", id: src.id },
			toRef: { kind: "relay", id: firstRelay.id },
			pace: 175 + Math.random() * 85,
			big: 1,
			path,
			hop: 0,
			destEndpoint: dst.id,
		});
	}

	function shortestRelayPath(startId: number, endId: number): number[] | null {
		if (startId === endId) return [startId];
		const prev = new Map<number, number>([[startId, -1]]);
		const queue = [startId];
		while (queue.length) {
			const cur = queue.shift() as number;
			if (cur === endId) break;
			const r = relayById(cur);
			if (!r?.online) continue;
			for (const nxt of r.links) {
				if (prev.has(nxt)) continue;
				const nr = relayById(nxt);
				if (!nr?.online) continue;
				prev.set(nxt, cur);
				queue.push(nxt);
			}
		}
		if (!prev.has(endId)) return null;
		const path: number[] = [];
		for (let c: number | undefined = endId; c !== undefined && c !== -1; c = prev.get(c)) path.unshift(c);
		return path;
	}

	function arrive(p: Packet) {
		const rgb = KINDS[p.kind].rgb;
		if (p.toRef.kind === "endpoint") {
			const e = endpointById(p.toRef.id);
			if (e) {
				e.flash = 1;
				e.flashRgb = rgb;
				if (p.big > 1.2) spawnRing(e.x, e.y, rgb, 22, 1.3);
			}
			return;
		}
		const r = relayById(p.toRef.id);
		if (!r?.online) return;
		r.flash = 1;
		r.flashRgb = rgb;

		if (p.path && p.hop !== undefined) {
			const nextHop = p.hop + 1;
			if (nextHop < p.path.length) {
				const next = relayById(p.path[nextHop]);
				if (!next?.online || !r.links.includes(next.id)) return;
				const key = pairKey(r.id, next.id);
				const seed = Math.min(r.id, next.id) * 31 + Math.max(r.id, next.id);
				const via = bowControl(r, next, seed);
				heatLink(key, rgb, 0.72);
				sendPacket({
					kind: p.kind,
					word: p.word,
					from: r,
					to: next,
					via,
					fromRef: { kind: "relay", id: r.id },
					toRef: { kind: "relay", id: next.id },
					pace: 215,
					big: p.big,
					linkKey: key,
					path: p.path,
					hop: nextHop,
					destEndpoint: p.destEndpoint,
				});
				return;
			}
			if (p.destEndpoint !== undefined) {
				const dst = endpointById(p.destEndpoint);
				if (dst && dst.relay === r.id) {
					sendPacket({
						kind: p.kind,
						word: p.word,
						from: r,
						to: dst,
						fromRef: { kind: "relay", id: r.id },
						toRef: { kind: "endpoint", id: dst.id },
						pace: 215,
						big: p.big,
					});
				}
			}
			return;
		}

		if (p.burst && p.depth !== undefined) {
			fanoutFromRelay(r, p.kind, p.word, p.burst, p.depth, p.big);
		}
	}

	function toggleRelay(relay: RelayNode) {
		const onlineCount = relays.filter((r) => r.online).length;
		if (relay.online && onlineCount <= 1) {
			// Keep at least one relay alive; pulse it to signal it's the last edge.
			publishFromRelay(relay, activeKind, true);
			return;
		}
		relay.online = !relay.online;
		computeTopology();
		updateStatus();
		if (!relay.online) {
			spawnRing(relay.x, relay.y, "251, 113, 133", 56, 2.4);
			// Trigger a failover burst from a nearby surviving relay so routing recovery is obvious.
			const backup = nearestOnlineRelay(relay, relay.id);
			if (backup) publishFromRelay(backup, activeKind, true);
		} else {
			spawnRing(relay.x, relay.y, KINDS.video.rgb, 52, 2.2);
			publishFromRelay(relay, activeKind, true);
		}
	}

	function spawnUserEndpoint(x: number, y: number) {
		const userNodes = endpoints.filter((e) => e.user);
		if (userNodes.length >= MAX_USER_NODES) {
			const oldest = userNodes[0];
			const idx = endpoints.indexOf(oldest);
			if (idx !== -1) endpoints.splice(idx, 1);
		}
		const nearest = nearestOnlineRelay({ x, y });
		const id = nextEndpointId++;
		const node: EndpointNode = {
			id,
			x,
			y,
			vx: (Math.random() - 0.5) * 9,
			vy: (Math.random() - 0.5) * 9,
			label: `peer-${id}`,
			icon: pick(PEER_ICONS),
			kind: activeKind,
			relay: nearest ? nearest.id : -1,
			birth: 0,
			handoff: 1,
			flash: 1,
			flashRgb: KINDS[activeKind].rgb,
			user: true,
		};
		endpoints.push(node);
		updateStatus();
		publishFromEndpoint(node, activeKind, true);
	}

	function hitTest(x: number, y: number): HitTarget | null {
		let best: HitTarget | null = null;
		let bestD = 30;
		for (const r of relays) {
			const d = Math.hypot(r.x - x, r.y - y);
			if (d < bestD) {
				bestD = d;
				best = { type: "relay", node: r };
			}
		}
		for (const e of endpoints) {
			const d = Math.hypot(e.x - x, e.y - y);
			if (d < Math.min(bestD, 24)) {
				bestD = d;
				best = { type: "endpoint", node: e };
			}
		}
		return best;
	}

	function step(dt: number) {
		// Smooth parallax pan.
		if (pan.x !== pan.tx || pan.y !== pan.ty) {
			const ease = Math.min(1, dt * 3.2);
			pan.x += (pan.tx - pan.x) * ease;
			pan.y += (pan.ty - pan.y) * ease;
			if (Math.abs(pan.tx - pan.x) < 0.05 && Math.abs(pan.ty - pan.y) < 0.05) {
				pan.x = pan.tx;
				pan.y = pan.ty;
			}
			canvas.style.transform = `translate3d(${pan.x.toFixed(2)}px, ${pan.y.toFixed(2)}px, 0)`;
		}

		// Gentle drift + soft relay repulsion so hubs stay nicely spaced.
		const marginX = 76;
		const marginTop = 76;
		const marginBottom = 108;
		for (let i = 0; i < relays.length; i++) {
			const r = relays[i];
			const isDragged = dragging?.target.type === "relay" && dragging.target.node.id === r.id;
			if (!isDragged) {
				for (let j = i + 1; j < relays.length; j++) {
					const o = relays[j];
					const dx = r.x - o.x;
					const dy = r.y - o.y;
					const d = Math.hypot(dx, dy) || 1;
					const minGap = Math.min(170, w * 0.18);
					if (d < minGap) {
						const push = ((minGap - d) / minGap) * 18 * dt;
						const nx = dx / d;
						const ny = dy / d;
						r.vx += nx * push;
						r.vy += ny * push;
						o.vx -= nx * push;
						o.vy -= ny * push;
					}
				}
				const spd = Math.hypot(r.vx, r.vy);
				if (spd > 11) {
					r.vx = (r.vx / spd) * 11;
					r.vy = (r.vy / spd) * 11;
				}
				r.x += r.vx * dt;
				r.y += r.vy * dt;
				if (r.x < marginX || r.x > w - marginX) {
					r.vx *= -1;
					r.x = Math.min(w - marginX, Math.max(marginX, r.x));
				}
				if (r.y < marginTop || r.y > h - marginBottom) {
					r.vy *= -1;
					r.y = Math.min(h - marginBottom, Math.max(marginTop, r.y));
				}
			}
			r.flash = Math.max(0, r.flash - dt * 1.9);
		}

		for (let i = 0; i < endpoints.length; i++) {
			const e = endpoints[i];
			const isDragged = dragging?.target.type === "endpoint" && dragging.target.node.id === e.id;
			if (!isDragged) {
				// Gentle spacing so hand-drawn peer icons don't stack over each other or relays.
				for (let j = i + 1; j < endpoints.length; j++) {
					const o = endpoints[j];
					const dx = e.x - o.x;
					const dy = e.y - o.y;
					const d = Math.hypot(dx, dy) || 1;
					if (d < 54) {
						const push = ((54 - d) / 54) * 20 * dt;
						e.vx += (dx / d) * push;
						e.vy += (dy / d) * push;
						o.vx -= (dx / d) * push;
						o.vy -= (dy / d) * push;
					}
				}
				for (const r of relays) {
					const dx = e.x - r.x;
					const dy = e.y - r.y;
					const d = Math.hypot(dx, dy) || 1;
					if (d < 58) {
						const push = ((58 - d) / 58) * 26 * dt;
						e.vx += (dx / d) * push;
						e.vy += (dy / d) * push;
					}
				}
				const spd = Math.hypot(e.vx, e.vy);
				if (spd > 15) {
					e.vx = (e.vx / spd) * 15;
					e.vy = (e.vy / spd) * 15;
				}
				e.x += e.vx * dt;
				e.y += e.vy * dt;
				if (e.x < 44 || e.x > w - 44) {
					e.vx *= -1;
					e.x = Math.min(w - 44, Math.max(44, e.x));
				}
				if (e.y < 48 || e.y > h - 84) {
					e.vy *= -1;
					e.y = Math.min(h - 84, Math.max(48, e.y));
				}
			}
			e.birth = Math.min(1, e.birth + dt * 3.8);
			e.handoff = Math.max(0, e.handoff - dt * 1.6);
			e.flash = Math.max(0, e.flash - dt * 2.1);
		}

		computeTopology();

		for (const [k, v] of linkHeat) {
			v.heat = Math.max(0, v.heat - dt * 1.25);
			if (v.heat <= 0.01) linkHeat.delete(k);
		}

		// Scheduled ambient traffic.
		autoBurstIn -= dt;
		if (autoBurstIn <= 0 && endpoints.length) {
			autoBurstIn = 1.25 + Math.random() * 0.9;
			const src = pick(endpoints);
			publishFromEndpoint(src, src.kind, false);
		}
		autoRouteIn -= dt;
		if (autoRouteIn <= 0) {
			autoRouteIn = 0.35 + Math.random() * 0.45;
			routePointToPoint();
		}

		// Keep packets glued to moving/dragged node positions and drop any whose link vanished.
		const arrived: Packet[] = [];
		packets = packets.filter((p) => {
			if (!isPacketLinkValid(p)) return false;
			const fromNode = p.fromRef.kind === "relay" ? relayById(p.fromRef.id) : endpointById(p.fromRef.id);
			const toNode = p.toRef.kind === "relay" ? relayById(p.toRef.id) : endpointById(p.toRef.id);
			if (!fromNode || !toNode) return false;
			p.from = fromNode;
			p.to = toNode;
			if (p.fromRef.kind === "relay" && p.toRef.kind === "relay") {
				const a = Math.min(p.fromRef.id, p.toRef.id);
				const b = Math.max(p.fromRef.id, p.toRef.id);
				p.via = bowControl(relayById(a) ?? fromNode, relayById(b) ?? toNode, a * 31 + b);
			}
			p.t += p.speed * dt;
			if (p.t >= 1) {
				arrived.push(p);
				return false;
			}
			return true;
		});
		for (const p of arrived) arrive(p);

		rings = rings.filter((r) => {
			r.r += 78 * dt;
			r.a = Math.max(0, (1 - r.r / r.maxR) * 0.85);
			return r.r < r.maxR && r.a > 0.02;
		});
	}

	function drawPacket(p: Packet) {
		const rgb = KINDS[p.kind].rgb;
		const at = pointAlong(p.from, p.to, p.via, p.t);
		const prev = pointAlong(p.from, p.to, p.via, Math.max(0, p.t - 0.03));
		const len = Math.hypot(at.x - prev.x, at.y - prev.y) || 1;
		const ux = (at.x - prev.x) / len;
		const uy = (at.y - prev.y) / len;
		const fullLen = curveLength(p.from, p.to, p.via);
		const distAlong = p.t * fullLen;

		if (p.kind === "audio") {
			// Tapered animated sine waveform trailing behind the packet head.
			ctx.beginPath();
			const waveLen = 22 * p.big;
			for (let i = 0; i <= waveLen && distAlong - i >= 0; i += 1.5) {
				const d = distAlong - i;
				const env = Math.sin((i / waveLen) * Math.PI) * Math.min(1, d / 12, (fullLen - d) / 12);
				const off = Math.sin(i * 0.65 + p.phase) * env * 4.2 * p.big;
				const px = at.x - ux * i - uy * off;
				const py = at.y - uy * i + ux * off;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
			ctx.lineWidth = 1.65 * p.big;
			ctx.stroke();
			ctx.fillStyle = `rgba(${rgb}, 1)`;
			ctx.beginPath();
			ctx.arc(at.x, at.y, 2 * p.big, 0, Math.PI * 2);
			ctx.fill();
			return;
		}

		if (p.kind === "video") {
			// Fading train of rectangular video frames aligned to travel direction.
			const angle = Math.atan2(uy, ux);
			for (let i = 0; i < 3 && distAlong - i * 8 >= 0; i++) {
				const fx = at.x - ux * i * 8;
				const fy = at.y - uy * i * 8;
				ctx.save();
				ctx.translate(fx, fy);
				ctx.rotate(angle);
				ctx.fillStyle = `rgba(${rgb}, ${0.95 - i * 0.28})`;
				const rw = 6 * p.big;
				const rh = 4.4 * p.big;
				ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
				ctx.restore();
			}
			return;
		}

		// Data / control: glowing comet tail + crisp dot + optional protocol word.
		const tailT = Math.max(0, p.t - (p.big > 1.2 ? 0.26 : 0.14));
		const tailPt = pointAlong(p.from, p.to, p.via, tailT);
		const grad = ctx.createLinearGradient(tailPt.x, tailPt.y, at.x, at.y);
		grad.addColorStop(0, `rgba(${rgb}, 0)`);
		grad.addColorStop(1, `rgba(${rgb}, 0.95)`);
		ctx.strokeStyle = grad;
		ctx.lineWidth = 2.2 * p.big;
		ctx.beginPath();
		ctx.moveTo(tailPt.x, tailPt.y);
		ctx.lineTo(at.x, at.y);
		ctx.stroke();

		ctx.fillStyle = `rgba(${rgb}, 1)`;
		ctx.beginPath();
		ctx.arc(at.x, at.y, 2.3 * p.big, 0, Math.PI * 2);
		ctx.fill();

		if (p.word) {
			ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
			ctx.fillStyle = `rgba(${rgb}, 0.9)`;
			ctx.fillText(p.word, at.x + 6, at.y - 5);
		}
	}

	function render() {
		if (!w || !h) return;
		ctx.clearRect(0, 0, w, h);

		// Subtle dot-grid texture baked into the parallax canvas so the whole field has depth.
		const spacing = 36;
		ctx.fillStyle = "rgba(148, 163, 184, 0.075)";
		for (let gx = spacing / 2; gx < w; gx += spacing) {
			for (let gy = spacing / 2; gy < h; gy += spacing) {
				ctx.fillRect(gx, gy, 1.2, 1.2);
			}
		}

		// Soft atmospheric glow near the active right-side cluster.
		const aura = ctx.createRadialGradient(w * 0.72, h * 0.48, 20, w * 0.72, h * 0.48, Math.max(w, h) * 0.55);
		aura.addColorStop(0, "rgba(34, 197, 94, 0.09)");
		aura.addColorStop(0.5, "rgba(56, 189, 248, 0.035)");
		aura.addColorStop(1, "rgba(15, 23, 42, 0)");
		ctx.fillStyle = aura;
		ctx.fillRect(0, 0, w, h);

		// Compute hovered shortest-path tree preview if hovering a node.
		const previewRelayEdges = new Set<string>();
		let previewRelayId = -1;
		if (hovered) {
			previewRelayId = hovered.type === "relay" ? hovered.node.id : hovered.node.relay;
			const start = relayById(previewRelayId);
			if (start?.online) {
				const seen = new Set([start.id]);
				const q = [start.id];
				while (q.length) {
					const cur = q.shift() as number;
					const r = relayById(cur);
					if (!r) continue;
					for (const nxt of r.links) {
						if (seen.has(nxt)) continue;
						seen.add(nxt);
						previewRelayEdges.add(pairKey(cur, nxt));
						q.push(nxt);
					}
				}
			}
		}

		// 1. Endpoint access links.
		for (const e of endpoints) {
			const r = relayById(e.relay);
			if (!r) continue;
			const isHighlighted =
				(hovered?.type === "endpoint" && hovered.node.id === e.id) ||
				(hovered?.type === "relay" && hovered.node.id === r.id);
			const alpha = isHighlighted ? 0.55 : e.handoff > 0.05 ? 0.65 * e.handoff : 0.2;
			ctx.strokeStyle =
				isHighlighted || e.handoff > 0.05
					? `rgba(${KINDS[e.kind].rgb}, ${alpha})`
					: `rgba(148, 163, 184, ${alpha * e.birth})`;
			ctx.lineWidth = isHighlighted || e.handoff > 0.05 ? 1.6 : 1;
			ctx.beginPath();
			ctx.moveTo(e.x, e.y);
			ctx.lineTo(r.x, r.y);
			ctx.stroke();
		}

		// 2. Relay backbone links (curved) + live heat glow overlay.
		for (const [aid, bid] of backbonePairs) {
			const a = relayById(aid);
			const b = relayById(bid);
			if (!a || !b) continue;
			const key = pairKey(aid, bid);
			const seed = Math.min(aid, bid) * 31 + Math.max(aid, bid);
			const via = bowControl(a, b, seed);
			const inPreview = previewRelayEdges.has(key);

			ctx.strokeStyle = inPreview ? "rgba(74, 222, 128, 0.42)" : "rgba(100, 116, 139, 0.34)";
			ctx.lineWidth = inPreview ? 2.2 : 1.35;
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.quadraticCurveTo(via.x, via.y, b.x, b.y);
			ctx.stroke();

			const heat = linkHeat.get(key);
			if (heat && heat.heat > 0.02) {
				ctx.save();
				ctx.strokeStyle = `rgba(${heat.rgb}, ${(heat.heat * 0.72).toFixed(3)})`;
				ctx.lineWidth = 2.6;
				ctx.shadowColor = `rgba(${heat.rgb}, 0.65)`;
				ctx.shadowBlur = 8;
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.quadraticCurveTo(via.x, via.y, b.x, b.y);
				ctx.stroke();
				ctx.restore();
			}
		}

		// 3. Packets in flight.
		for (const p of packets) drawPacket(p);

		// 4. Shockwave rings.
		for (const r of rings) {
			ctx.strokeStyle = `rgba(${r.rgb}, ${r.a.toFixed(3)})`;
			ctx.lineWidth = r.width;
			ctx.beginPath();
			ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
			ctx.stroke();
		}

		// 5. Endpoint nodes (hand-drawn icons on subtle dark pads).
		ctx.font = '500 10.5px "DM Mono", ui-monospace, monospace';
		for (const e of endpoints) {
			const rgb = KINDS[e.kind].rgb;
			const isHov = hovered?.type === "endpoint" && hovered.node.id === e.id;
			const scale = 0.35 + 0.65 * e.birth;
			const iconSize = (e.label ? 24 : 19) * scale * (isHov ? 1.15 : 1);
			const padR = iconSize * 0.56 + 3;

			if (e.flash > 0.05 || isHov) {
				const glowR = padR + (isHov ? 7 : 6 * e.flash);
				ctx.fillStyle = `rgba(${e.flashRgb || rgb}, ${(isHov ? 0.26 : 0.34 * e.flash).toFixed(3)})`;
				ctx.beginPath();
				ctx.arc(e.x, e.y, glowR, 0, Math.PI * 2);
				ctx.fill();
			}

			// Dark slate pad so access links tuck cleanly behind the hand-drawn strokes.
			ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
			ctx.beginPath();
			ctx.arc(e.x, e.y, padR, 0, Math.PI * 2);
			ctx.fill();

			ctx.strokeStyle = isHov
				? `rgba(${rgb}, 0.92)`
				: e.flash > 0.1
					? `rgba(${e.flashRgb || rgb}, ${(0.25 + 0.65 * e.flash).toFixed(3)})`
					: `rgba(${rgb}, ${e.label ? 0.35 : 0.2})`;
			ctx.lineWidth = isHov ? 1.6 : 1;
			ctx.beginPath();
			ctx.arc(e.x, e.y, padR, 0, Math.PI * 2);
			ctx.stroke();

			const drawn = drawIcon(ctx, e.icon, e.x, e.y, iconSize, repaint);
			if (!drawn) {
				ctx.fillStyle = `rgba(${rgb}, 0.85)`;
				ctx.beginPath();
				ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
				ctx.fill();
			}

			if (e.label || isHov) {
				const text = e.label ?? `viewer-${e.id}`;
				const lx = e.x + padR + 5;
				ctx.fillStyle = isHov ? "rgba(238, 242, 248, 0.96)" : "rgba(148, 163, 184, 0.8)";
				ctx.fillText(text, lx, e.y + 3.5);
				if (isHov) {
					ctx.fillStyle = `rgba(${KINDS[activeKind].rgb}, 0.88)`;
					ctx.fillText("click to publish", lx, e.y + 15.5);
				}
			}
		}

		// 6. Relay hubs (hand-drawn globes drawn on top so they read as the backbone anchors).
		for (const r of relays) {
			const isHov = hovered?.type === "relay" && hovered.node.id === r.id;
			const iconSize = isHov ? 32 : 28;
			const padR = iconSize * 0.56 + 4;

			if (r.online && (r.flash > 0.05 || isHov)) {
				ctx.fillStyle = `rgba(${r.flashRgb}, ${(isHov ? 0.24 : 0.36 * r.flash).toFixed(3)})`;
				ctx.beginPath();
				ctx.arc(r.x, r.y, padR + 8, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.save();
			ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
			ctx.strokeStyle = !r.online ? "rgba(251, 113, 133, 0.85)" : isHov ? "#4ade80" : "rgba(44, 58, 87, 0.95)";
			ctx.lineWidth = isHov ? 2 : 1.5;
			if (!r.online) ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.arc(r.x, r.y, padR, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();

			ctx.save();
			if (!r.online) ctx.globalAlpha = 0.28;
			const drawn = drawIcon(ctx, RELAY_ICON, r.x, r.y, iconSize, repaint);
			if (!drawn) {
				ctx.fillStyle = r.online ? "#4ade80" : "rgba(251, 113, 133, 0.8)";
				ctx.beginPath();
				ctx.arc(r.x, r.y, 4, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();

			if (!r.online) {
				ctx.strokeStyle = "rgba(251, 113, 133, 0.95)";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(r.x - 8, r.y - 8);
				ctx.lineTo(r.x + 8, r.y + 8);
				ctx.moveTo(r.x + 8, r.y - 8);
				ctx.lineTo(r.x - 8, r.y + 8);
				ctx.stroke();
			}

			const lx = r.x + padR + 6;
			ctx.font = '500 11px "DM Mono", ui-monospace, monospace';
			ctx.fillStyle = !r.online ? "rgba(251, 113, 133, 0.92)" : isHov ? "#eef2f8" : "rgba(203, 213, 225, 0.88)";
			ctx.fillText(r.online ? r.label : `${r.label} (offline)`, lx, r.y + 3.5);
			if (isHov) {
				ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
				ctx.fillStyle = r.online ? "rgba(251, 113, 133, 0.9)" : "rgba(74, 222, 128, 0.92)";
				ctx.fillText(r.online ? "click to fail over · drag" : "click to restore", lx, r.y + 15.5);
			}
		}

		// Subtle crosshair ring when hovering open canvas space (not over a node or button).
		if (pointer.inside && !hovered && !dragging && finePointer) {
			ctx.strokeStyle = `rgba(${KINDS[activeKind].rgb}, 0.22)`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		const prevW = w;
		const prevH = h;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		w = rect.width;
		h = rect.height;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (prevW < 1 || Math.abs(prevW - w) > 140 || Math.abs(prevH - h) > 140) {
			hovered = null;
			pendingTap = null;
			if (dragging) {
				try {
					surface.releasePointerCapture(dragging.pointerId);
				} catch {
					// Ignore if not captured.
				}
				dragging = null;
				surface.style.cursor = "";
			}
			seed();
			// Warm up the simulation so even a paused/initial frame is mid-fanout.
			const prevLive = isLive;
			isLive = true;
			for (let i = 0; i < 90; i++) step(1 / 60);
			isLive = prevLive;
		} else {
			const sx = w / prevW;
			const sy = h / prevH;
			for (const r of relays) {
				r.x *= sx;
				r.y *= sy;
			}
			for (const e of endpoints) {
				e.x *= sx;
				e.y *= sy;
			}
			computeTopology();
		}
		render();
	}

	function toCanvasPoint(e: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function isInteractiveControl(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest("a, button, input, summary, details, [data-no-canvas]"));
	}

	function isSelectableText(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest("h1, h2, h3, p, span, code, pre, li"));
	}

	surface.addEventListener("pointermove", (e) => {
		const pt = toCanvasPoint(e);
		pointer = { x: pt.x, y: pt.y, inside: true };

		if (finePointer && isLive && !dragging) {
			const srect = surface.getBoundingClientRect();
			const nx = ((e.clientX - srect.left) / Math.max(1, srect.width)) * 2 - 1;
			const ny = ((e.clientY - srect.top) / Math.max(1, srect.height)) * 2 - 1;
			pan.tx = -Math.max(-1, Math.min(1, nx)) * PAN;
			pan.ty = -Math.max(-1, Math.min(1, ny)) * PAN;
		}

		if (pendingTap && e.pointerId === pendingTap.pointerId) {
			if (Math.hypot(pt.x - pendingTap.x, pt.y - pendingTap.y) > 6) pendingTap.moved = true;
		}

		if (dragging && e.pointerId === dragging.pointerId) {
			if (Math.hypot(pt.x - dragging.startX, pt.y - dragging.startY) > 5) dragging.moved = true;
			if (dragging.moved) {
				dragging.target.node.x = Math.min(w - 28, Math.max(28, pt.x));
				dragging.target.node.y = Math.min(h - 32, Math.max(28, pt.y));
				computeTopology();
				if (!isLive) render();
			}
			return;
		}

		if (isInteractiveControl(e.target) || isSelectableText(e.target)) {
			hovered = null;
			surface.style.cursor = "";
			return;
		}

		hovered = hitTest(pt.x, pt.y);
		surface.style.cursor = hovered ? "grab" : "";
		if (!isLive) render();
	});

	surface.addEventListener("pointerleave", () => {
		pointer.inside = false;
		hovered = null;
		pendingTap = null;
		pan.tx = 0;
		pan.ty = 0;
		if (!dragging) surface.style.cursor = "";
		if (!isLive) render();
	});

	surface.addEventListener("pointerdown", (e) => {
		if (e.button !== 0 || isInteractiveControl(e.target) || isSelectableText(e.target)) return;
		const pt = toCanvasPoint(e);
		const hit = hitTest(pt.x, pt.y);
		if (hit) {
			dragging = { target: hit, pointerId: e.pointerId, startX: pt.x, startY: pt.y, moved: false };
			surface.style.cursor = "grabbing";
			e.preventDefault();
			try {
				surface.setPointerCapture(e.pointerId);
			} catch {
				// Synthetic or non-capturable pointer events can ignore capture.
			}
			return;
		}
		// Defer spawning until a confirmed tap (pointerup without scroll/drag).
		pendingTap = { pointerId: e.pointerId, x: pt.x, y: pt.y, moved: false };
	});

	const finishDrag = (e: PointerEvent) => {
		if (pendingTap && e.pointerId === pendingTap.pointerId) {
			const tap = pendingTap;
			pendingTap = null;
			if (!tap.moved) {
				spawnUserEndpoint(tap.x, tap.y);
				if (!isLive) render();
			}
			return;
		}
		if (!dragging || e.pointerId !== dragging.pointerId) return;
		const active = dragging;
		dragging = null;
		surface.style.cursor = hovered ? "grab" : "";
		try {
			surface.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore if not captured.
		}
		if (!active.moved) {
			if (active.target.type === "relay") toggleRelay(active.target.node);
			else publishFromEndpoint(active.target.node, activeKind, true);
		} else if (active.target.type === "relay" && active.target.node.online) {
			publishFromRelay(active.target.node, activeKind, false);
		} else if (active.target.type === "endpoint") {
			publishFromEndpoint(active.target.node, activeKind, false);
		}
		if (!isLive) render();
	};

	const cancelDrag = (e: PointerEvent) => {
		if (pendingTap && e.pointerId === pendingTap.pointerId) pendingTap = null;
		if (!dragging || e.pointerId !== dragging.pointerId) return;
		dragging = null;
		surface.style.cursor = hovered ? "grab" : "";
		try {
			surface.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore if not captured.
		}
		if (!isLive) render();
	};

	surface.addEventListener("pointerup", finishDrag);
	surface.addEventListener("pointercancel", cancelDrag);

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

	// Preload hand-drawn icons immediately so the first frame paints them cleanly.
	loadIcon(RELAY_ICON, repaint);
	for (const f of FEATURED_ENDPOINTS) loadIcon(f.icon, repaint);
	for (const src of PEER_ICONS) loadIcon(src, repaint);

	resize();
	new ResizeObserver(() => resize()).observe(surface);
}
