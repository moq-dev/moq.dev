// What each crypto library costs to build from scratch: time, CPU, binary size, and the tools it needs.
import { createSignal, For } from "solid-js";
import { Chart, commit, createTip, day, Toggle } from "./chart";
import data from "./data/build.json";

const METRICS = {
	seconds: { name: "Build time", unit: (v: number) => `${v.toFixed(1)} s` },
	cpu_seconds: { name: "CPU time", unit: (v: number) => `${v.toFixed(1)} s` },
	bytes: { name: "Binary size", unit: (v: number) => `${(v / 1024 / 1024).toFixed(2)} MiB` },
} as const;
type Metric = keyof typeof METRICS;

// The crate alone, or rustls on top of it, as a QUIC stack would use it.
const SCOPES = {
	crate: ["rind", "aws-lc-rs", "ring", "rustcrypto", "graviola"],
	rustls: ["rustls-rind", "rustls-aws-lc-rs", "rustls-ring"],
} as const;
type Scope = keyof typeof SCOPES;

const NAMES: Record<string, string> = { rustcrypto: "RustCrypto", graviola: "Graviola" };

const TOOLS: Record<string, string> = { cc: "C compiler", make: "make", perl: "perl", "pkg-config": "pkg-config" };

const W = 640;
const LABEL = 132;
const RIGHT = 180;
const ROW = 26;
const BAR = 14;

export default function Build() {
	const [host, setHost] = createSignal(data.hosts[0].name);
	const [metric, setMetric] = createSignal<Metric>("seconds");
	const [scope, setScope] = createSignal<Scope>("crate");
	const { tip, on } = createTip();

	const current = () => data.hosts.find((h) => h.name === host()) ?? data.hosts[0];
	const builds = () =>
		SCOPES[scope()].flatMap((name) =>
			current().builds.filter((b) => b.name === name),
		) as (typeof data.hosts)[0]["builds"];
	const max = () => Math.max(...builds().map((b) => b[metric()]));
	const width = (v: number) => (v / max()) * (W - LABEL - RIGHT);
	const height = () => builds().length * ROW + 4;
	const name = (b: { name: string }) => {
		const lib = b.name.replace("rustls-", "");
		return `${b.name.startsWith("rustls-") ? "rustls + " : ""}${NAMES[lib] ?? lib}`;
	};
	const needs = (tools: string[]) =>
		tools.length ? `needs ${tools.map((t) => TOOLS[t] ?? t).join(", ")}` : "rustc only";

	return (
		<Chart
			title="Build cost"
			subtitle="a cold release build of a binary that uses the library; shorter is cheaper"
			controls={
				<>
					<Toggle label="CPU" options={data.hosts.map((h) => h.name)} value={host()} onChange={setHost} />
					<Toggle
						label="Measure"
						options={Object.keys(METRICS) as Metric[]}
						names={Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.name]))}
						value={metric()}
						onChange={setMetric}
					/>
					<Toggle
						label="Build"
						options={Object.keys(SCOPES) as Scope[]}
						names={{ crate: "the crate", rustls: "with rustls" }}
						value={scope()}
						onChange={setScope}
					/>
				</>
			}
			width={W}
			height={height()}
			tip={tip}
			label={`${METRICS[metric()].name} to build each library on ${host()}.`}
			table={{
				head: ["Build", "Build time", "CPU time", "Binary size", "Packages", "Tools"],
				rows: current().builds.map((b) => [
					name(b),
					METRICS.seconds.unit(b.seconds),
					METRICS.cpu_seconds.unit(b.cpu_seconds),
					METRICS.bytes.unit(b.bytes),
					b.packages,
					needs(b.tools),
				]),
			}}
			source={
				<>
					{current().source.cpu}, {current().source.jobs} jobs, {current().source.rustc}. rind's admin/build-cost at{" "}
					{commit(current().source.rind)}: the median of {current().source.runs} cold builds, empty target directory and
					warm download cache, {day(current().source.date)}. A tool counts when the build fails without it.
				</>
			}
		>
			<For each={builds()}>
				{(b, i) => {
					const y = i() * ROW + 4;
					const rind = b.name.endsWith("rind");
					return (
						<g
							{...on(() => ({
								x: LABEL + width(b[metric()]),
								y: y + 2,
								lines: [
									`${name(b)}: ${METRICS[metric()].unit(b[metric()])}`,
									`${b.packages} packages, ${needs(b.tools)}`,
								],
							}))}
						>
							<rect x={0} y={y} width={W} height={ROW} fill="transparent" />
							<text x={LABEL - 10} y={y + BAR - 2} text-anchor="end" fill="var(--ink)" font-weight={rind ? 700 : 400}>
								{name(b)}
							</text>
							<rect
								x={LABEL}
								y={y + 2}
								width={Math.max(2, width(b[metric()]))}
								height={BAR}
								rx="4"
								fill={rind ? "var(--rind)" : "var(--other)"}
							/>
							<text x={LABEL + width(b[metric()]) + 6} y={y + BAR - 1} fill="var(--ink-2)">
								{METRICS[metric()].unit(b[metric()])}
							</text>
							<text x={W - 4} y={y + BAR - 1} text-anchor="end" fill={b.tools.length ? "var(--ink-2)" : "var(--rind)"}>
								{needs(b.tools)}
							</text>
						</g>
					);
				}}
			</For>
		</Chart>
	);
}
