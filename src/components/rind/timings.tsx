// Every operation rind's report times, for every library, colored by its time over the fastest
// library's on each CPU: green is fastest, red is slowest.
import { For } from "solid-js";
import { commit, day, Figure, name, time, times } from "./chart";
import json from "./data/libraries.json";

const data = json as unknown as {
	source: { rind: string };
	libraries: string[];
	sections: { name: string; operations: { id: string; label: string }[] }[];
	hosts: { name: string; source: { date: string }; times: Record<string, Record<string, number>> }[];
};

// admin/bench-report's bands, by the time over the fastest library's.
const EDGES = [1.1, 1.25, 1.5, 2, 4, 8];
const BANDS = ["fastest, or within 10%", "to 1.25×", "to 1.5×", "to 2×", "to 4×", "to 8×", "over 8×"];
const band = (ratio: number) => {
	const i = EDGES.findIndex((edge) => ratio <= edge);
	return i < 0 ? EDGES.length : i;
};

const ratio = (op: string, lib: string, h: (typeof data.hosts)[number]) => {
	const t = h.times[op];
	return lib in t ? t[lib] / Math.min(...Object.values(t)) : undefined;
};

export default function Timings() {
	const operations = data.sections.flatMap((s) => s.operations);
	const rind = data.hosts.flatMap((h) => operations.map((o) => ratio(o.id, "rind", h)).filter((r) => r !== undefined));
	const close = rind.filter((r) => r <= EDGES[0]).length;

	return (
		<Figure
			kicker="Every benchmark · one square per CPU"
			number={`${close}/${rind.length}`}
			headline={
				<>
					timings where rind is fastest,
					<br />
					or within 10%
				</>
			}
			label="Every operation rind's benchmark report times, for every library, colored by its time over the fastest library's on each of three CPUs."
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
					Criterion's estimates from rind's benchmark report at {commit(data.source.rind)},{" "}
					{day(data.hosts[0].source.date)}, as {data.hosts.map((h) => h.name).join(" / ")}. Every library runs its
					native path on each CPU.
				</>
			}
		>
			<div class="scroll">
				<div class="heat">
					<div />
					<For each={data.libraries}>{(lib) => <div class={`lib${lib === "rind" ? " me" : ""}`}>{name(lib)}</div>}</For>
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
			<div class="key">
				<For each={BANDS}>
					{(label, i) => (
						<span>
							<span class="trio">
								<i class={`s${i()}`} />
							</span>
							{label}
						</span>
					)}
				</For>
			</div>
			<p class="fine">Squares: {data.hosts.map((h) => h.name).join(", ")}. Blank: not offered.</p>
		</Figure>
	);
}
