// QUIC's per-packet crypto: every library's AES-128-GCM seal, as a ball bouncing once per packet.
import { createSignal, For, onCleanup, onMount } from "solid-js";
import { commit, days, Figure, frames, geomean, midscreen, name, reduced, time, times } from "./chart";
import data from "./data/libraries.json";

type Host = (typeof data.hosts)[number];
type Size = "32B" | "1350B";
const seal = (host: Host, size: Size) => host.times[`aes128-gcm/${size}`] as Record<string, number>;

// rind's speedup over aws-lc-rs sealing a packet.
const ratio = (h: Host, size: Size) => seal(h, size)["aws-lc-rs"] / seal(h, size).rind;
// Each library's full-packet seal, averaged over every CPU, so no one CPU picks the headline.
const AVERAGE = Object.fromEntries(
	data.libraries.map((lib) => {
		const ns = data.hosts.map((h) => seal(h, "1350B")[lib]);
		if (ns.some((n) => n === undefined)) throw new Error(`libraries.json lacks ${lib}'s seal on a host`);
		return [lib, geomean(ns)];
	}),
);
// One bounce is one packet sealed, slowed this much so the eye can follow.
const SLOW = 2e6;

const table = {
	head: ["Library", ...data.hosts.flatMap((h) => [`${h.name}, 32 B`, `${h.name}, 1350 B`])],
	rows: data.libraries.map((lib) => [
		name(lib),
		...data.hosts.flatMap((h) =>
			(["32B", "1350B"] as const).map((size) => (lib in seal(h, size) ? time(seal(h, size)[lib]) : "-")),
		),
	]),
};

const source = (
	<>
		AES-128-GCM seal, criterion's estimate from rind's benchmark report at {commit(data.source.rind)}, run{" "}
		{days(data.hosts)}: {data.hosts.map((h) => `${h.name} is ${h.source.cpu}`).join(", ")}. On Mac, rind holds DIT
		across the timed loop, as a caller batching packets does.
	</>
);

export default function Quic() {
	const lanes = Object.entries(AVERAGE).sort((a, b) => a[1] - b[1]);
	const [counts, setCounts] = createSignal(lanes.map(() => 0));
	const canvases: HTMLCanvasElement[] = [];
	let figure: HTMLElement | undefined;

	// Where a ball sits after `bounces` wall-to-wall trips: 0 at the left wall, 1 at the right.
	const at = (bounces: number) => {
		const n = Math.floor(bounces);
		return n % 2 ? 1 - (bounces - n) : bounces - n;
	};
	let elapsed = 0;
	const draw = (seconds: number) => {
		if (!figure) return;
		const style = getComputedStyle(figure);
		setCounts(
			lanes.map(([lib, ns], i) => {
				const canvas = canvases[i];
				const ctx = canvas.getContext("2d");
				const hz = 1e9 / ns / SLOW;
				const bounces = seconds * hz;
				const n = Math.floor(bounces);
				if (!ctx) return n;
				const d = devicePixelRatio;
				const { width: w, height: h } = canvas;
				const wall = 4 * d;
				const r = 6 * d;
				const x = (p: number) => wall + r + p * (w - 2 * wall - 2 * r);
				ctx.clearRect(0, 0, w, h);
				ctx.fillStyle = style.getPropertyValue(lib === "rind" ? "--rind" : "--ink-2");
				// A wall flashes for 150 ms after the ball leaves it.
				const glow = n > 0 ? Math.max(0, 1 - (bounces - n) / hz / 0.15) : 0;
				const hit = n % 2 ? w - wall : 0;
				for (const side of [0, w - wall]) {
					ctx.globalAlpha = 0.25 + (side === hit ? 0.75 * glow : 0);
					ctx.fillRect(side, 0, wall, h);
				}
				// A short motion trail, then the ball.
				for (let k = 6; k >= 0; k--) {
					ctx.globalAlpha = k ? (0.3 * (7 - k)) / 7 : 1;
					ctx.beginPath();
					ctx.arc(x(at(Math.max(0, bounces - k * hz * 0.018))), h / 2, r * (k ? 0.8 : 1), 0, 2 * Math.PI);
					ctx.fill();
				}
				ctx.globalAlpha = 1;
				return n;
			}),
		);
	};

	onMount(() => {
		const size = () => {
			for (const canvas of canvases) {
				canvas.width = canvas.clientWidth * devicePixelRatio;
				canvas.height = canvas.clientHeight * devicePixelRatio;
			}
			draw(elapsed);
		};
		size();
		addEventListener("resize", size);
		let cancel = () => {};
		onCleanup(() => {
			removeEventListener("resize", size);
			cancel();
		});
		if (figure && !reduced())
			midscreen(figure, () => {
				cancel = frames((seconds) => {
					elapsed = seconds;
					draw(seconds);
					return true;
				});
			});
	});

	return (
		<Figure
			ref={(el) => {
				figure = el;
			}}
			kicker={`Sealing 1350 B QUIC packets · one core, averaged over ${data.hosts.length} CPUs`}
			number={times(AVERAGE["aws-lc-rs"] / AVERAGE.rind)}
			headline={
				<>
					aws-lc-rs's
					<br />
					packets per core
				</>
			}
			label={`Packets sealed per second by each library, averaged over ${data.hosts.length} CPUs, drawn as balls bouncing once per packet.`}
			table={table}
			source={source}
		>
			<div class="lanes">
				<For each={lanes}>
					{([lib, ns], i) => (
						<div class={`lane${lib === "rind" ? " me" : ""}`}>
							<div class="who">
								{name(lib)}
								<small>{time(ns)}</small>
							</div>
							<canvas
								ref={(el) => {
									canvases[i()] = el;
								}}
							/>
							<div class="count">{counts()[i()].toLocaleString("en-US")}</div>
						</div>
					)}
				</For>
			</div>
			<p class="fine">
				AES-128-GCM, the geometric mean over CPUs.{" "}
				{data.hosts.map((h) => `${h.name}: ${times(ratio(h, "1350B"))}`).join(", ")}. aws-lc is Amazon's BoringSSL fork.
				On Mac, rind holds DIT (constant-time mode) across each batch.
			</p>
		</Figure>
	);
}
