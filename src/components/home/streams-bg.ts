// Interactive QUIC multi-track stream lanes for the Features + Libraries slice.
// Each video group (keyframe + delta frames) rides on its own QUIC stream.
// Click and hold anywhere in the background to inject congestion/packet loss:
// - Frames inside a hit group stall and queue up while QUIC retransmits.
// - Brief loss recovers cleanly once the retransmit lands.
// - If congestion persists until the next group (new keyframe) catches up and
//   touches the stalled queue, MoQ resets/drops the stale group so live frames
//   keep moving with zero head-of-line blocking.
import { whileLive } from "@/lib/motion";

type TrackKind = "video" | "audio" | "data";

interface Lane {
	name: string;
	kind: TrackKind;
	priority: number;
	ny: number;
	amp: number;
	freq: number;
	phase: number;
	speed: number;
	rgb: string;
	nextGroupIn: number;
	groupId: number;
}

interface FrameNode {
	x: number;
	isKey: boolean;
}

interface StreamGroup {
	id: number;
	lane: number;
	frames: FrameNode[];
	stalled: boolean;
	stallTime: number;
	retransmitPhase: number;
	recoveredFlash: number;
	boost: number;
}

interface RetransmitPulse {
	lane: number;
	fromX: number;
	toX: number;
	t: number;
	rgb: string;
}

interface Spark {
	x: number;
	y: number;
	vx: number;
	vy: number;
	a: number;
	rgb: string;
}

interface FloatingTag {
	x: number;
	y: number;
	text: string;
	a: number;
	rgb: string;
}

interface LossZone {
	x: number;
	y: number;
	r: number;
	life: number;
	holding: boolean;
}

const LANE_SPECS: Array<Omit<Lane, "phase" | "nextGroupIn" | "groupId">> = [
	{ name: "audio/opus", kind: "audio", priority: 1, ny: 0.12, amp: 8, freq: 0.0045, speed: 132, rgb: "125, 211, 252" },
	{ name: "video/1080p", kind: "video", priority: 2, ny: 0.27, amp: 11, freq: 0.0038, speed: 112, rgb: "74, 222, 128" },
	{ name: "telemetry/imu", kind: "data", priority: 0, ny: 0.43, amp: 6, freq: 0.0052, speed: 160, rgb: "252, 211, 77" },
	{ name: "video/720p", kind: "video", priority: 3, ny: 0.59, amp: 10, freq: 0.0041, speed: 118, rgb: "74, 222, 128" },
	{ name: "audio/voice", kind: "audio", priority: 1, ny: 0.74, amp: 7, freq: 0.0048, speed: 140, rgb: "125, 211, 252" },
	{ name: "video/360p", kind: "video", priority: 4, ny: 0.88, amp: 9, freq: 0.0035, speed: 104, rgb: "74, 222, 128" },
];

const FRAME_GAP = 16;
const QUEUED_GAP = 7;

export function mount(root: HTMLElement) {
	const foundCanvas = root.querySelector<HTMLCanvasElement>("[data-streams-canvas]");
	if (!foundCanvas) throw new Error("streams background has no canvas");
	const foundCtx = foundCanvas.getContext("2d");
	if (!foundCtx) throw new Error("streams background could not acquire 2d context");
	const canvas: HTMLCanvasElement = foundCanvas;
	const ctx: CanvasRenderingContext2D = foundCtx;

	const surface = root.closest("section") ?? root;
	const counterEl = root.querySelector<HTMLElement>("[data-streams-dropped]");

	let w = 0;
	let h = 0;
	let dpr = 1;
	let isLive = false;
	let frame = 0;
	let last = 0;
	let time = 0;
	let droppedGroups = 0;
	let retransmitted = 0;

	const lanes: Lane[] = LANE_SPECS.map((spec, i) => ({
		...spec,
		phase: i * 1.15,
		nextGroupIn: 0.15 + i * 0.24,
		groupId: 1,
	}));

	let groups: StreamGroup[] = [];
	let retransmits: RetransmitPulse[] = [];
	let sparks: Spark[] = [];
	let tags: FloatingTag[] = [];
	let loss: LossZone | null = null;
	const pointer = { x: 0, y: 0, inside: false };

	function laneY(lane: Lane, x: number) {
		return lane.ny * h + Math.sin(x * lane.freq + lane.phase + time * 0.45) * lane.amp;
	}

	function spawnGroup(laneIdx: number) {
		const lane = lanes[laneIdx];
		const id = lane.groupId++;
		if (lane.kind === "video") {
			const frames: FrameNode[] = [{ x: -16, isKey: true }];
			for (let i = 1; i <= 4; i++) frames.push({ x: -16 - i * FRAME_GAP, isKey: false });
			groups.push({
				id,
				lane: laneIdx,
				frames,
				stalled: false,
				stallTime: 0,
				retransmitPhase: 0,
				recoveredFlash: 0,
				boost: 0,
			});
			return;
		}
		groups.push({
			id,
			lane: laneIdx,
			frames: [{ x: -20, isKey: true }],
			stalled: false,
			stallTime: 0,
			retransmitPhase: 0,
			recoveredFlash: 0,
			boost: 0,
		});
	}

	function updateCounter() {
		if (!counterEl) return;
		if (droppedGroups > 0 || retransmitted > 0) {
			const parts: string[] = [];
			if (retransmitted > 0) parts.push(`${retransmitted} retransmitted`);
			if (droppedGroups > 0) parts.push(`${droppedGroups} stale ${droppedGroups === 1 ? "group" : "groups"} dropped`);
			counterEl.textContent = parts.join(" · ");
			counterEl.dataset.active = "true";
		} else {
			counterEl.textContent = "click & hold to stall a flight";
			delete counterEl.dataset.active;
		}
	}

	function dropGroup(g: StreamGroup) {
		const lane = lanes[g.lane];
		droppedGroups++;
		updateCounter();
		const head = g.frames[0];
		const hy = laneY(lane, head.x);
		tags.push({ x: head.x, y: hy - 14, text: "reset_stream", a: 1, rgb: "251, 113, 133" });
		for (const f of g.frames) {
			const fy = laneY(lane, f.x);
			for (let s = 0; s < (f.isKey ? 6 : 3); s++) {
				sparks.push({
					x: f.x,
					y: fy,
					vx: (Math.random() - 0.35) * 70,
					vy: 15 + Math.random() * 80,
					a: 0.95,
					rgb: "251, 113, 133",
				});
			}
		}
	}

	function step(dt: number) {
		time += dt;

		for (let i = 0; i < lanes.length; i++) {
			const lane = lanes[i];
			lane.nextGroupIn -= dt;
			if (lane.nextGroupIn <= 0) {
				spawnGroup(i);
				lane.nextGroupIn = lane.kind === "video" ? 1.32 + Math.random() * 0.25 : 0.72 + Math.random() * 0.35;
			}
		}

		if (loss) {
			if (loss.holding) {
				loss.life = Math.min(1, loss.life + dt * 4);
				loss.r = 76 + Math.sin(time * 9) * 4;
			} else {
				loss.life = Math.max(0, loss.life - dt * 2.2);
				loss.r += 10 * dt;
				if (loss.life <= 0.01) loss = null;
			}
		}

		// Advance every independent QUIC stream / group.
		for (const g of groups) {
			const lane = lanes[g.lane];
			const head = g.frames[0];
			const headY = laneY(lane, head.x);
			const inLoss =
				loss !== null && loss.life > 0.2 && Math.hypot(head.x - loss.x, headY - loss.y) < loss.r && g.boost <= 0.05;

			if (inLoss) {
				if (!g.stalled) {
					g.stalled = true;
					g.stallTime = 0;
					g.retransmitPhase = 0;
				}
				g.stallTime += dt;
				g.retransmitPhase += dt;

				if (g.retransmitPhase >= 0.36) {
					g.retransmitPhase = 0;
					retransmits.push({
						lane: g.lane,
						fromX: Math.max(0, head.x - 54),
						toX: head.x,
						t: 0,
						rgb: "252, 211, 77",
					});
				}
			} else if (g.stalled) {
				// Loss cleared before the next flight caught up: retransmit succeeds and the queued group resumes.
				g.stalled = false;
				g.recoveredFlash = 1;
				retransmitted++;
				updateCounter();
				tags.push({ x: head.x, y: headY - 12, text: "retransmit ok", a: 0.9, rgb: "252, 211, 77" });
			}

			g.recoveredFlash = Math.max(0, g.recoveredFlash - dt * 2.1);
			g.boost = Math.max(0, g.boost - dt * 1.1);

			const speed = lane.speed * (1 + g.boost * 0.3);
			if (g.stalled) {
				// Leading lost frame stalls in place while trailing frames in the same QUIC stream queue up behind it.
				head.x += speed * 0.04 * dt;
				for (let i = 1; i < g.frames.length; i++) {
					const targetX = g.frames[i - 1].x - QUEUED_GAP;
					g.frames[i].x = Math.min(targetX, g.frames[i].x + speed * 0.92 * dt);
				}
			} else {
				head.x += speed * dt;
				// Smoothly relax queued frames back to normal spacing as the stream drains.
				for (let i = 1; i < g.frames.length; i++) {
					const idealX = g.frames[i - 1].x - FRAME_GAP;
					const cur = g.frames[i].x + speed * dt;
					g.frames[i].x = cur + (idealX - cur) * Math.min(1, dt * 6);
				}
			}
		}

		// Detect queue overflow across every track: when a newer flight catches up and touches
		// a stalled older flight on the same lane, MoQ resets/drops the stale flight so live media continues.
		const dropped = new Set<StreamGroup>();
		for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
			const lane = lanes[laneIdx];
			const tailPad = lane.kind === "video" ? 10 : lane.kind === "audio" ? 30 : 28;
			const laneGroups = groups.filter((g) => g.lane === laneIdx).sort((a, b) => a.id - b.id);
			for (let i = 0; i < laneGroups.length - 1; i++) {
				const older = laneGroups[i];
				const newer = laneGroups[i + 1];
				if (!older.stalled || dropped.has(older)) continue;
				const olderTailX = older.frames[older.frames.length - 1].x;
				const newerHeadX = newer.frames[0].x;
				if (newerHeadX >= olderTailX - tailPad) {
					dropped.add(older);
					dropGroup(older);
					// The fresh flight gets a clear pass so the viewer jumps straight to live.
					newer.stalled = false;
					newer.boost = 1;
					newer.recoveredFlash = 1;
				}
			}
		}

		groups = groups.filter((g) => !dropped.has(g) && g.frames[g.frames.length - 1].x < w + 48);

		retransmits = retransmits.filter((r) => {
			r.t += dt * 4.2;
			return r.t < 1;
		});

		sparks = sparks.filter((s) => {
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			s.vy += 120 * dt;
			s.a -= dt * 1.6;
			return s.a > 0.02;
		});

		tags = tags.filter((t) => {
			t.y -= 18 * dt;
			t.a -= dt * 1.15;
			return t.a > 0.02;
		});
	}

	function render() {
		if (!w || !h) return;
		ctx.clearRect(0, 0, w, h);

		let focusLane = -1;
		if (pointer.inside) {
			let bestD = 56;
			for (let i = 0; i < lanes.length; i++) {
				const d = Math.abs(laneY(lanes[i], pointer.x) - pointer.y);
				if (d < bestD) {
					bestD = d;
					focusLane = i;
				}
			}
		}

		// 1. Stream lane guide curves.
		for (let i = 0; i < lanes.length; i++) {
			const lane = lanes[i];
			const focused = i === focusLane;
			ctx.beginPath();
			const stepX = Math.max(16, w / 48);
			for (let x = 0; x <= w + stepX; x += stepX) {
				const y = laneY(lane, x);
				if (x === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.strokeStyle = focused ? `rgba(${lane.rgb}, 0.28)` : `rgba(${lane.rgb}, 0.08)`;
			ctx.lineWidth = focused ? 1.5 : 1;
			ctx.stroke();

			if (focused) {
				const lx = Math.min(w - 155, Math.max(18, pointer.x + 16));
				const ly = laneY(lane, lx);
				ctx.font = '500 10.5px "DM Mono", ui-monospace, monospace';
				ctx.fillStyle = `rgba(${lane.rgb}, 0.85)`;
				ctx.fillText(`${lane.name} · prio ${lane.priority}`, lx, ly - 8);
			}
		}

		// 2. Groups / flights riding each independent QUIC stream.
		for (const g of groups) {
			const lane = lanes[g.lane];
			const alpha = g.stalled || g.boost > 0.1 ? 0.96 : g.lane === focusLane ? 0.86 : 0.58;

			if (lane.kind === "audio") {
				const head = g.frames[0];
				ctx.beginPath();
				for (let k = 0; k <= 26; k += 2) {
					const px = head.x - k;
					const py = laneY(lane, px) + Math.sin(k * 0.65 + time * 10) * Math.sin((k / 26) * Math.PI) * 5.2;
					if (k === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				}
				ctx.strokeStyle = g.stalled ? `rgba(252, 211, 77, ${alpha})` : `rgba(${lane.rgb}, ${alpha})`;
				ctx.lineWidth = g.boost > 0.1 || g.stalled ? 2.2 : 1.5;
				ctx.stroke();
				if (g.stalled) {
					ctx.font = '500 9.5px "DM Mono", ui-monospace, monospace';
					ctx.fillStyle = "rgba(252, 211, 77, 0.9)";
					ctx.fillText("queued · retry", head.x - 28, laneY(lane, head.x) - 11);
				}
				continue;
			}

			if (lane.kind === "data") {
				const head = g.frames[0];
				const y = laneY(lane, head.x);
				const drawRgb = g.stalled ? "252, 211, 77" : lane.rgb;
				const grad = ctx.createLinearGradient(head.x - 28, y, head.x, y);
				grad.addColorStop(0, `rgba(${drawRgb}, 0)`);
				grad.addColorStop(1, `rgba(${drawRgb}, ${alpha})`);
				ctx.strokeStyle = grad;
				ctx.lineWidth = g.stalled || g.boost > 0.1 ? 2.4 : 2;
				ctx.beginPath();
				ctx.moveTo(head.x - 28, y);
				ctx.lineTo(head.x, y);
				ctx.stroke();
				ctx.fillStyle = `rgba(${drawRgb}, ${alpha})`;
				ctx.beginPath();
				ctx.arc(head.x, y, g.stalled ? 3.2 : 2.5, 0, Math.PI * 2);
				ctx.fill();
				if (g.stalled) {
					ctx.strokeStyle = "rgba(252, 211, 77, 0.85)";
					ctx.lineWidth = 1.4;
					ctx.beginPath();
					ctx.arc(head.x, y, 6.5, 0, Math.PI * 2);
					ctx.stroke();
					ctx.font = '500 9.5px "DM Mono", ui-monospace, monospace';
					ctx.fillStyle = "rgba(252, 211, 77, 0.9)";
					ctx.fillText("queued · retry", head.x - 26, y - 11);
				}
				continue;
			}

			// Video group: subtle connector bar linking frames of the same QUIC stream.
			const head = g.frames[0];
			const tail = g.frames[g.frames.length - 1];
			ctx.strokeStyle = g.stalled ? "rgba(252, 211, 77, 0.5)" : `rgba(${lane.rgb}, ${(alpha * 0.35).toFixed(3)})`;
			ctx.lineWidth = g.stalled ? 2 : 1.2;
			ctx.beginPath();
			ctx.moveTo(tail.x, laneY(lane, tail.x));
			ctx.lineTo(head.x, laneY(lane, head.x));
			ctx.stroke();

			for (const f of g.frames) {
				const y = laneY(lane, f.x);
				const fillRgb = g.stalled ? "252, 211, 77" : lane.rgb;
				if (f.isKey) {
					ctx.fillStyle = `rgba(${fillRgb}, ${alpha})`;
					ctx.fillRect(f.x - 5.5, y - 4, 11, 8);
					if (g.stalled || g.recoveredFlash > 0.1) {
						ctx.strokeStyle = g.stalled
							? "rgba(252, 211, 77, 0.85)"
							: `rgba(${lane.rgb}, ${(g.recoveredFlash * 0.85).toFixed(3)})`;
						ctx.lineWidth = 1.5;
						ctx.strokeRect(f.x - 8, y - 6.5, 16, 13);
					}
				} else {
					ctx.fillStyle = `rgba(${fillRgb}, ${(alpha * 0.72).toFixed(3)})`;
					ctx.fillRect(f.x - 2.5, y - 2.4, 5, 4.8);
				}
			}

			if (g.stalled) {
				const hy = laneY(lane, head.x);
				ctx.font = '500 9.5px "DM Mono", ui-monospace, monospace';
				ctx.fillStyle = "rgba(252, 211, 77, 0.9)";
				ctx.fillText("queued · retry", head.x - 26, hy - 11);
			}
		}

		// 3. QUIC retransmit arcs flying into stalled frames.
		for (const r of retransmits) {
			const lane = lanes[r.lane];
			const x = r.fromX + (r.toX - r.fromX) * r.t;
			const baseY = laneY(lane, x);
			const arcY = baseY - Math.sin(r.t * Math.PI) * 16;
			ctx.fillStyle = `rgba(${r.rgb}, ${(1 - r.t * 0.35).toFixed(3)})`;
			ctx.beginPath();
			ctx.arc(x, arcY, 2.6, 0, Math.PI * 2);
			ctx.fill();
		}

		// 4. Dropped group sparks & labels.
		for (const s of sparks) {
			ctx.fillStyle = `rgba(${s.rgb}, ${s.a.toFixed(3)})`;
			ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
		}
		ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
		for (const t of tags) {
			ctx.fillStyle = `rgba(${t.rgb}, ${t.a.toFixed(3)})`;
			ctx.fillText(t.text, t.x - 24, t.y);
		}

		// 5. Active packet-loss / congestion zone.
		if (loss) {
			ctx.save();
			const grad = ctx.createRadialGradient(loss.x, loss.y, 4, loss.x, loss.y, loss.r);
			grad.addColorStop(0, `rgba(251, 113, 133, ${(0.22 * loss.life).toFixed(3)})`);
			grad.addColorStop(1, "rgba(251, 113, 133, 0)");
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(loss.x, loss.y, loss.r, 0, Math.PI * 2);
			ctx.fill();

			ctx.strokeStyle = `rgba(251, 113, 133, ${(0.65 * loss.life).toFixed(3)})`;
			ctx.lineWidth = 1.4;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.arc(loss.x, loss.y, loss.r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();

			ctx.font = '500 10px "DM Mono", ui-monospace, monospace';
			ctx.fillStyle = `rgba(253, 164, 175, ${(0.92 * loss.life).toFixed(3)})`;
			ctx.fillText("packet loss", loss.x - 32, loss.y - loss.r - 6);
		}
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		const first = w < 1;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		w = rect.width;
		h = rect.height;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (first) {
			for (let i = 0; i < 180; i++) step(1 / 30);
		}
		render();
	}

	const toCanvas = (e: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	};

	const isControl = (target: EventTarget | null) =>
		target instanceof Element && Boolean(target.closest("a, button, input, [data-no-canvas]"));

	surface.addEventListener("pointermove", (e) => {
		const pt = toCanvas(e);
		pointer.x = pt.x;
		pointer.y = pt.y;
		pointer.inside = true;
		if (loss?.holding) {
			loss.x = pt.x;
			loss.y = pt.y;
		}
		if (!isLive) render();
	});

	surface.addEventListener("pointerleave", () => {
		pointer.inside = false;
		if (loss) loss.holding = false;
		if (!isLive) render();
	});

	surface.addEventListener("pointerdown", (e) => {
		if (e.button !== 0 || isControl(e.target)) return;
		const overText = e.target instanceof Element && Boolean(e.target.closest("h2, h3, p, span, code"));
		if (overText) return;
		const pt = toCanvas(e);
		loss = { x: pt.x, y: pt.y, r: 76, life: 1, holding: true };
		if (!isLive) {
			step(0.04);
			render();
		}
	});

	const releaseLoss = () => {
		if (loss) loss.holding = false;
	};
	surface.addEventListener("pointerup", releaseLoss);
	surface.addEventListener("pointercancel", releaseLoss);

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

	resize();
	new ResizeObserver(() => resize()).observe(surface);
}
