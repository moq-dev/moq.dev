// Every operation rind's report times, for every library, colored by its time over the fastest
// library's on each CPU: green is fastest, red is slowest.
import { For } from "solid-js";
import { Bands, band, commit, days, Figure, name, time, times } from "./chart";
import json from "./data/libraries.json";

const data = json as unknown as {
	source: { rind: string };
	libraries: string[];
	sections: { name: string; operations: { id: string; label: string }[] }[];
	hosts: { name: string; source: { date: string }; times: Record<string, Record<string, number>> }[];
};
type Host = (typeof data.hosts)[number];

const ratio = (op: string, lib: string, h: Host) => {
	const t = h.times[op];
	return lib in t ? t[lib] / Math.min(...Object.values(t)) : undefined;
};

// Libraries with a rustls provider come first, so the rustls rows read as a block on the left.
const tls = data.sections.find((s) => s.name === "TLS 1.3 with rustls");
if (!tls) throw new Error("libraries.json has no rustls section");
const rustls = (lib: string) => tls.operations.some((o) => data.hosts.some((h) => lib in h.times[o.id]));
const LIBRARIES = [...data.libraries.filter(rustls), ...data.libraries.filter((lib) => !rustls(lib))];

export default function Timings() {
	const operations = data.sections.flatMap((s) => s.operations);
	// How many of rind's timings are fastest or within 10%, out of how many.
	const rs = data.hosts.flatMap((h) => operations.map((o) => ratio(o.id, "rind", h)).filter((r) => r !== undefined));
	const rind = { close: rs.filter((r) => band(r) === 0).length, of: rs.length };

	return (
		<Figure
			kicker="Every benchmark · one square per CPU"
			number={`${rind.close}/${rind.of}`}
			headline={
				<>
					timings where rind is fastest,
					<br />
					or within 10%
				</>
			}
			label="Every operation rind's benchmark report times, for every library, colored by its time over the fastest library's on each CPU."
			table={{
				head: ["Operation", ...LIBRARIES.map(name)],
				rows: operations.map((o) => [
					o.label,
					...LIBRARIES.map((lib) =>
						data.hosts
							.map((h) => h.times[o.id][lib])
							.map((t) => (t === undefined ? "-" : time(t)))
							.join(" / "),
					),
				]),
			}}
			source={
				<>
					Criterion's estimates from rind's benchmark report at {commit(data.source.rind)}, run {days(data.hosts)}, as{" "}
					{data.hosts.map((h) => h.name).join(" / ")}. Every library runs its native path on each CPU. On Mac, rind
					holds DIT across the timed loop, as a caller batching calls does.
				</>
			}
		>
			<div class="scroll">
				<div class="heat" style={{ "--libs": LIBRARIES.length }}>
					<div />
					<For each={LIBRARIES}>{(lib) => <div class={`lib${lib === "rind" ? " me" : ""}`}>{name(lib)}</div>}</For>
					<For each={data.sections}>
						{(section) => (
							<>
								<div class="section">{section.name}</div>
								<For each={section.operations}>
									{(o) => (
										<>
											<div class="row">{o.label}</div>
											<For each={LIBRARIES}>
												{(lib) => (
													<div class={`cell${lib === "rind" ? " me" : ""}`}>
														<span class="trio">
															<For each={data.hosts}>
																{(h) => {
																	const r = ratio(o.id, lib, h);
																	return r === undefined ? (
																		<i />
																	) : (
																		<i
																			class={`s${band(r)}`}
																			title={`${h.name}: ${time(h.times[o.id][lib])}, ${times(r)}`}
																		/>
																	);
																}}
															</For>
														</span>
													</div>
												)}
											</For>
										</>
									)}
								</For>
							</>
						)}
					</For>
				</div>
			</div>
			<Bands />
			<p class="fine">
				Squares: {data.hosts.map((h) => h.name).join(", ")}. Blank: not offered. On Mac, rind holds DIT (constant-time
				mode) across each batch.
			</p>
		</Figure>
	);
}
