// Every operation rind's report times, for every library, colored by its time over the fastest
// library's on each CPU: green is fastest, red is slowest.
import { For } from "solid-js";
import { Bands, band, commit, days, Figure, name, time, times } from "./chart";
import json from "./data/libraries.json";

const data = json as unknown as {
	source: { rind: string };
	libraries: string[];
	variants: Record<string, string>;
	sections: { name: string; operations: { id: string; label: string }[] }[];
	hosts: { name: string; source: { date: string }; times: Record<string, Record<string, number>> }[];
};
type Host = (typeof data.hosts)[number];

// A variant never counts as the fastest, as in rind's report.
const ratio = (op: string, lib: string, h: Host) => {
	const t = h.times[op];
	const rivals = Object.entries(t).flatMap(([l, ns]) => (l in data.variants ? [] : [ns]));
	return lib in t ? t[lib] / Math.min(...rivals) : undefined;
};

// A variant's column is too narrow for its full name.
const SHORT: Record<string, string> = { "rind-dit-held": "DIT held" };

export default function Timings() {
	const operations = data.sections.flatMap((s) => s.operations);
	// How many of rind's timings are fastest or within 10%, out of how many, counting `lib` where it was timed.
	const score = (lib: string) => {
		const rs = data.hosts.flatMap((h) =>
			operations.map((o) => ratio(o.id, lib in h.times[o.id] ? lib : "rind", h)).filter((r) => r !== undefined),
		);
		return { close: rs.filter((r) => band(r) === 0).length, of: rs.length };
	};
	const rind = score("rind");
	const held = score("rind-dit-held");
	const dit = data.hosts.filter((h) => operations.some((o) => "rind-dit-held" in h.times[o.id])).map((h) => h.name);

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
				head: ["Operation", ...data.libraries.map(name)],
				rows: operations.map((o) => [
					o.label,
					...data.libraries.map((lib) =>
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
					{data.hosts.map((h) => h.name).join(" / ")}. Every library runs its native path on each CPU. rind (DIT held)
					is rind with DIT held across the timed loop; it is timed only on {dit.join(" and ")} and never counts as the
					fastest.
				</>
			}
		>
			<div class="scroll">
				<div class="heat" style={{ "--libs": data.libraries.length }}>
					<div />
					<For each={data.libraries}>
						{(lib) => <div class={`lib${lib === "rind" ? " me" : ""}`}>{SHORT[lib] ?? name(lib)}</div>}
					</For>
					<For each={data.sections}>
						{(section) => (
							<>
								<div class="section">{section.name}</div>
								<For each={section.operations}>
									{(o) => (
										<>
											<div class="row">{o.label}</div>
											<For each={data.libraries}>
												{(lib) => (
													<div class={`cell${lib === "rind" || lib in data.variants ? " me" : ""}`}>
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
				Squares: {data.hosts.map((h) => h.name).join(", ")}. Blank: not offered. On {dit.join(" and ")}, rind turns on
				DIT, the CPU's constant-time mode, around every call that handles a secret; the other libraries never set it.
				DIT held sets it once across a batch of calls, as MoQ does: then rind is fastest or within 10% on {held.close}/
				{held.of}.
			</p>
		</Figure>
	);
}
