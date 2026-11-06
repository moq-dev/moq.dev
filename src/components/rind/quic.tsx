// QUIC's per-packet crypto and handshakes: rind against aws-lc-rs (MoQ's old default) and ring, per CPU.
import { createSignal, For } from "solid-js";
import { Chart, commit, createTip, day, Toggle, time, times } from "./chart";
import json from "./data/quic.json";

interface Row {
	op: string;
	size: string;
	ns: Partial<Record<(typeof LIBS)[number], number>> & { rind: number; "aws-lc-rs": number };
}
interface Host {
	name: string;
	source: {
		rind: string;
		"aws-lc-rs": string;
		ring: string;
		rustls: string;
		cpu: string;
		core: number;
		date: string;
		load: number[]; // the 1-minute load average before and after
		logical_cpus: number;
		rounds: number;
		note: string;
	};
	rows: Row[];
}
const data = json as { hosts: Host[] };

const LIBS = ["rind", "aws-lc-rs", "ring"] as const;
const OPS = ["seal", "open", "header protection", "handshake"] as const;
type Op = (typeof OPS)[number];

// QUIC's sizes are whole datagrams; the two smallest are ACK-sized packets under a 13 B short header.
const SIZES: Record<string, string> = {
	"quic-32B": "32 B",
	"quic-64B": "64 B",
	"1200B": "1200 B",
	"1350B": "1350 B",
	"": "AES-128",
	X25519: "X25519",
	X25519MLKEM768: "X25519MLKEM768",
};

const NOTES: Record<Op, string> = {
	seal: "AES-128-GCM, encrypting one packet",
	open: "AES-128-GCM, decrypting one packet",
	"header protection": "masking one packet's header",
	handshake: "a full TLS 1.3 handshake through rustls, both peers",
};

const W = 640;
const LABEL = 112;
const RIGHT = 120;
const BAR = 9;
const STEP = BAR + 3;
const GROUP = LIBS.length * STEP + 14;

export default function Quic() {
	const [host, setHost] = createSignal(data.hosts[0].name);
	const [op, setOp] = createSignal<Op>("open");
	const { tip, on } = createTip();

	const current = () => data.hosts.find((h) => h.name === host()) ?? data.hosts[0];
	const rows = () => current().rows.filter((r) => r.op === op());
	const max = () => Math.max(...rows().flatMap((r) => LIBS.map((l) => r.ns[l] ?? 0)));
	const width = (ns: number) => (ns / max()) * (W - LABEL - RIGHT);
	const height = () => rows().length * GROUP + 4;

	return (
		<Chart
			title="QUIC's crypto"
			subtitle={`${NOTES[op()]}; shorter is faster`}
			controls={
				<>
					<Toggle label="CPU" options={data.hosts.map((h) => h.name)} value={host()} onChange={setHost} />
					<Toggle label="Operation" options={OPS} value={op()} onChange={setOp} />
				</>
			}
			legend={LIBS.map((lib) => ({
				color: `var(--${lib})`,
				label: lib === "aws-lc-rs" ? "aws-lc-rs (MoQ's old default)" : lib,
			}))}
			width={W}
			height={height()}
			tip={tip}
			label={`Time per ${op()} on ${host()} for rind, aws-lc-rs, and ring.`}
			table={{
				head: ["Operation", "Size", ...LIBS, "rind vs aws-lc-rs"],
				rows: current().rows.map((r) => [
					r.op,
					SIZES[r.size],
					...LIBS.map((l) => (r.ns[l] ? time(r.ns[l]) : "none")),
					times(r.ns["aws-lc-rs"] / r.ns.rind),
				]),
			}}
			source={
				<>
					{current().source.cpu}, rind {commit(current().source.rind)}, aws-lc-rs {current().source["aws-lc-rs"]}, ring{" "}
					{current().source.ring}, rustls {current().source.rustls}. rind-bench on one pinned core, the median of{" "}
					{current().source.rounds} criterion rounds, {day(current().source.date)}. {current().source.note}
				</>
			}
		>
			<For each={rows()}>
				{(row, i) => {
					const y = i() * GROUP + 4;
					const speedup = () => row.ns["aws-lc-rs"] / row.ns.rind;
					return (
						<>
							<text x={LABEL - 10} y={y + (LIBS.length * STEP) / 2 + 3} text-anchor="end" fill="var(--ink)">
								{SIZES[row.size]}
							</text>
							<For each={LIBS}>
								{(lib, j) => {
									const ns = row.ns[lib];
									if (ns === undefined)
										return (
											<text x={LABEL + 4} y={y + j() * STEP + BAR - 1} fill="var(--ink-3)" font-size="10">
												{lib} doesn't offer it
											</text>
										);
									return (
										<g
											{...on(() => ({
												x: LABEL + width(ns),
												y: y + j() * STEP,
												lines: [
													`${lib}: ${time(ns)}`,
													lib === "aws-lc-rs"
														? `${SIZES[row.size]} ${op()}`
														: `${times(row.ns["aws-lc-rs"] / ns)} aws-lc-rs's speed`,
												],
											}))}
										>
											<rect
												x={LABEL}
												y={y + j() * STEP - 1}
												width={W - LABEL - RIGHT}
												height={STEP}
												fill="transparent"
											/>
											<rect
												x={LABEL}
												y={y + j() * STEP}
												width={Math.max(2, width(ns))}
												height={BAR}
												rx="3"
												fill={`var(--${lib})`}
											/>
											{lib === "rind" && (
												<text x={LABEL + width(ns) + 6} y={y + j() * STEP + BAR - 1} fill="var(--ink-2)">
													{time(ns)}
												</text>
											)}
										</g>
									);
								}}
							</For>
							<text
								x={W - 4}
								y={y + (LIBS.length * STEP) / 2 + 4}
								text-anchor="end"
								fill={speedup() >= 1 ? "var(--rind)" : "var(--ink-2)"}
								font-weight="700"
								font-size="14"
							>
								{times(speedup())}
							</text>
						</>
					);
				}}
			</For>
			<text x={W - 4} y={height() - 1} text-anchor="end" fill="var(--ink-3)" font-size="10">
				vs aws-lc-rs
			</text>
		</Chart>
	);
}
