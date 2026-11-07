// How much of each primitive every library proves, per CPU: end to end, a proven core under unproven glue,
// or nothing; blank where the library doesn't offer it.
import { For } from "solid-js";
import { commit, day, Figure, name } from "./chart";
import json from "./data/libraries.json";

type Status = "e2e" | "routine" | "none";
const data = json as unknown as {
	source: { rind: string; generated: string };
	libraries: string[];
	rows: string[];
	partial: Record<string, Record<string, { proof: string; link: string }>>;
	hosts: { name: string; source: { date: string }; coverage: Record<string, Record<string, Status | null>> }[];
};

const WORDS: Record<Status, string> = { e2e: "proven end to end", routine: "proven core", none: "unproven" };

export default function Coverage() {
	const statuses = (row: string, lib: string) => data.hosts.map((h) => h.coverage[row][lib]);

	return (
		<Figure
			kicker="Formal proofs · one square per CPU"
			headline={
				<>
					Almost nobody proves
					<br />
					their crypto
				</>
			}
			label="Which primitives each Rust crypto library proves, end to end or only at its core, on each of three CPUs."
			table={{
				head: ["Primitive", ...data.libraries.map(name)],
				rows: data.rows.map((row) => [
					row,
					...data.libraries.map((lib) => {
						const s = statuses(row, lib);
						if (s.every((x) => x === null)) return "";
						const text = data.hosts.map((h, i) => `${h.name}: ${s[i] ? WORDS[s[i]] : "none"}`).join(", ");
						const partial = data.partial[lib]?.[row];
						return partial ? { text: `${text} (${partial.proof})`, href: partial.link } : text;
					}),
				]),
			}}
			source={
				<>
					End to end: rind's benchmarks/verified.toml at {commit(data.source.rind)}, whose ✓ needs a machine-checked
					proof of all the code, glue included. Proven core: a proven routine does the whole cipher, block function,
					scalar multiplication, or NTT for at least some of the row's operations; field arithmetic alone doesn't count.
					Checked against each library's source at the versions rind's report locks, {day(data.hosts[0].source.date)}.
				</>
			}
		>
			<div class="scroll">
				<div class="heat">
					<div />
					<For each={data.libraries}>{(lib) => <div class={`lib${lib === "rind" ? " me" : ""}`}>{name(lib)}</div>}</For>
					<For each={data.rows}>
						{(row) => (
							<>
								<div class="row">{row}</div>
								<For each={data.libraries}>
									{(lib) => (
										<div class={`cell${lib === "rind" ? " me" : ""}`}>
											<span class="trio">
												<For each={statuses(row, lib)}>{(s) => <i class={s ?? undefined} />}</For>
											</span>
										</div>
									)}
								</For>
							</>
						)}
					</For>
				</div>
			</div>
			<div class="key">
				<span>
					<span class="trio">
						<i class="e2e" />
					</span>
					proven end to end
				</span>
				<span>
					<span class="trio">
						<i class="routine" />
					</span>
					proven core, unproven glue
				</span>
				<span>
					<span class="trio">
						<i class="none" />
					</span>
					unproven
				</span>
			</div>
			<p class="fine">Squares: {data.hosts.map((h) => h.name).join(", ")}. Blank: not offered.</p>
		</Figure>
	);
}
