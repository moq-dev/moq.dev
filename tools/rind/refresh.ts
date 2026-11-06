// Regenerates the rind post's chart data (src/components/rind/data/) from a rind checkout and
// fresh measurements. See README.md beside this file for when to run each step.
//
//   bun tools/rind/refresh.ts proofs <rind>                      verified.toml + README + tiers.json
//   bun tools/rind/refresh.ts build <rind>                       benchmarks/data/*.json build_cost
//   bun tools/rind/refresh.ts quic <host> <out> <criterion>...   quic.sh's rounds, one per criterion dir
//   bun tools/rind/refresh.ts runtimes <out> <out>/*.tsv          runtimes.sh's rounds
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(import.meta.dir, "../../src/components/rind/data");

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const write = (name: string, value: unknown) => {
	writeFileSync(join(DATA, name), `${JSON.stringify(value, null, "\t")}\n`);
	console.log(`wrote ${name}`);
};
const today = () => new Date().toISOString().slice(0, 10);
const commit = (rind: string) => execFileSync("git", ["-C", rind, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const geomean = (xs: number[]) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

// rind's CPU tiers, as bench.yml denies features and README's Algorithms tables name them.
// `features` is what rind can use on that tier, for matching verified.toml's `cpu` lists.
const X86 = ["aes", "pclmulqdq", "ssse3", "sse4.1", "avx", "movbe"];
const TIERS = [
	{
		name: "x86_64",
		arch: "x86_64",
		nightly: ["x86_64-unknown-linux-gnu", false, ""],
		features: [...X86, "avx2", "bmi2", "adx", "sha", "vaes", "vpclmulqdq"],
	},
	{ name: "no AVX2", arch: "x86_64", nightly: ["x86_64-unknown-linux-gnu", true, ""], features: X86 },
	{
		name: "no AVX",
		arch: "x86_64",
		nightly: ["x86_64-unknown-linux-gnu", true, "no-avx"],
		features: X86.filter((f) => f !== "avx"),
	},
	{ name: "no AES-NI", arch: "x86_64", nightly: ["x86_64-unknown-linux-gnu", true, "no-aes"], features: ["ssse3"] },
	{ name: "SSE2", arch: "x86_64", nightly: ["x86_64-unknown-linux-gnu", true, "no-ssse3"], features: [] },
	{
		name: "aarch64",
		arch: "aarch64",
		nightly: ["aarch64-unknown-linux-gnu", false, ""],
		features: ["aes", "pmull", "sha2", "sha3"],
	},
	{ name: "no crypto", arch: "aarch64", nightly: ["aarch64-unknown-linux-gnu", true, ""], features: [] },
	{ name: "armv7", arch: "armv7", nightly: ["armv7-unknown-linux-gnueabihf", false, ""], features: [] },
] as const;

// The primitives charted, as README's Algorithms rows (by prefix) and nightly benchmark IDs
// (admin/bench-report's TIER_ROWS).
const ROWS = [
	{ name: "AES-GCM", readme: "AES-GCM", pattern: /^aes(128|256)-gcm(-open)?\// },
	{ name: "AES header protection", readme: "AES block", pattern: /^quic-header-protection\/aes(128|256)\// },
	{ name: "ChaCha20 header protection", readme: "ChaCha20 (header", pattern: /^quic-header-protection\/chacha20\// },
	{ name: "ChaCha20-Poly1305", readme: "ChaCha20-Poly1305", pattern: /^x?chacha20poly1305\// },
	{ name: "SHA-256", readme: "SHA-256", pattern: /^sha256(-updates)?\// },
	{ name: "SHA-384, SHA-512", readme: "SHA-384", pattern: /^sha(384|512|512-256)\// },
	{ name: "HMAC", readme: "HMAC", pattern: /^hmac-/ },
	{ name: "HKDF", readme: "HKDF", pattern: /^hkdf-/ },
	{ name: "X25519", readme: "X25519", pattern: /^x25519-/ },
	{ name: "Ed25519", readme: "Ed25519", pattern: /^ed25519-/ },
	{ name: "P-256", readme: "P-256", pattern: /^p256-/ },
	{ name: "P-384", readme: "P-384", pattern: /^p384-/ },
	{ name: "P-521", readme: "P-521", pattern: /^p521-/ },
	{ name: "ML-KEM-768", readme: "ML-KEM-768", pattern: /^mlkem768-/ },
	{ name: "RSA", readme: "RSA", pattern: /^rsa\d+-(pkcs1|pss|load)/ },
];

// Each tier's cell text in README's two Algorithms tables; an empty cell repeats the one to its left.
function algorithms(readme: string): Map<string, string[]> {
	const cells = new Map<string, string[]>();
	for (const line of readme.split("\n")) {
		if (!line.startsWith("| ") || line.startsWith("| Algorithm") || line.startsWith("|---")) continue;
		const [name, ...rest] = line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());
		if (!rest.length) continue;
		const filled = rest.reduce<string[]>((acc, c) => {
			acc.push(c || acc.at(-1) || "");
			return acc;
		}, []);
		cells.set(name, [...(cells.get(name) ?? []), ...filled]);
	}
	return cells;
}

// Which proofs a verified.toml entry composes, in a few words.
function sources(proof: string): string {
	const found = [
		[/HOL Light/, "s2n-bignum (HOL Light)"],
		[/SAW/, "aws-lc (SAW)"],
		[/NSym/, "aws-lc (NSym)"],
		[/Vale's F\*/, "Vale (F*)"],
		[/HACL\*'s rounds/, "HACL* (F*)"],
	] as const;
	return ["rind (Lean, via Aeneas)", ...found.filter(([re]) => re.test(proof)).map(([, name]) => name)].join(" + ");
}

function proofs(rind: string) {
	const verified = Bun.TOML.parse(readFileSync(join(rind, "benchmarks/verified.toml"), "utf8")) as {
		verified: { library: string; operations: string[]; arch?: string; cpu?: string[]; proof: string; link: string }[];
	};
	const readme = algorithms(readFileSync(join(rind, "README.md"), "utf8"));
	const nightly = read(join(rind, "benchmarks/data/tiers.json"));

	const cells = ROWS.map((row) => {
		const text = [...readme].find(([name]) => name.startsWith(row.readme))?.[1];
		if (!text || text.length !== TIERS.length) throw new Error(`README has no full Algorithms row for ${row.readme}`);

		return TIERS.map((tier, i) => {
			const proven = verified.verified.find(
				(v) =>
					v.library === "rind" &&
					v.arch === tier.arch &&
					v.operations.some((op) => row.pattern.test(`${op}/`)) &&
					(v.cpu ?? []).every((f) =>
						f === "intel"
							? true
							: f.startsWith("!")
								? !tier.features.includes(f.slice(1) as never)
								: tier.features.includes(f as never),
					),
			);
			const run = nightly.tiers.find((t: { target: string; portable: boolean; tier: string }) =>
				[t.target, t.portable, t.tier].every((v, j) => v === tier.nightly[j]),
			);
			const ratios = Object.entries(run?.benchmarks ?? {})
				.filter(([key]) => row.pattern.test(key))
				.flatMap(([, libs]) => {
					const { rind: ours, "aws-lc-rs": theirs } = libs as Record<string, number>;
					return ours && theirs ? [theirs / ours] : [];
				});

			return {
				status: proven ? "e2e" : text[i].includes("✓") ? "routine" : "none",
				code: text[i],
				proof: proven ? sources(proven.proof) : undefined,
				note: proven?.cpu?.includes("intel") ? "Intel CPUs only" : undefined,
				link: proven?.link,
				// aws-lc-rs's time over rind's: above 1, rind is faster.
				speedup: ratios.length
					? { geomean: geomean(ratios), min: Math.min(...ratios), max: Math.max(...ratios), n: ratios.length }
					: undefined,
			};
		});
	});

	write("proofs.json", {
		source: {
			rind: commit(rind),
			files: ["README.md#algorithms", "benchmarks/verified.toml", "benchmarks/data/tiers.json"],
			nightly: { run: nightly.url, commit: nightly.commit, date: nightly.date },
			cpus: Object.fromEntries(
				TIERS.map((tier) => [
					tier.name,
					nightly.tiers.find((t: { target: string; portable: boolean; tier: string }) =>
						[t.target, t.portable, t.tier].every((v, j) => v === tier.nightly[j]),
					)?.cpu,
				]),
			),
			generated: today(),
		},
		tiers: TIERS.map((t) => t.name),
		rows: ROWS.map((r, i) => ({ name: r.name, cells: cells[i] })),
	});
}

// rind's report hosts, named by CPU since the hostnames mean nothing outside.
const HOSTS: Record<string, string> = {
	desktop: "Arrow Lake",
	nixos: "Zen 3",
	nixos2: "Coffee Lake",
};

function build(rind: string) {
	const hosts = Object.keys(HOSTS)
		.filter((host) => existsSync(join(rind, `benchmarks/data/${host}.json`)))
		.map((host) => {
			const data = read(join(rind, `benchmarks/data/${host}.json`));
			const cost = data.build_cost;
			if (cost.status !== "ok") throw new Error(`${host}'s build cost is ${cost.status}`);
			return {
				name: HOSTS[host],
				source: {
					rind: data.commit,
					cpu: cost.host.cpu,
					jobs: Number(cost.host.jobs),
					rustc: cost.host.rustc,
					cc: cost.host.cc,
					date: cost.started,
					runs: cost.runs,
				},
				builds: cost.builds.map((b: Record<string, unknown>) => ({
					name: b.name,
					seconds: b.median_seconds,
					cpu_seconds: b.median_cpu_seconds,
					bytes: b.stripped_bytes,
					tools: b.tools,
					packages: (b.packages as string[]).length,
				})),
			};
		});
	write("build.json", {
		source: { rind: commit(rind), file: "benchmarks/data/<host>.json", generated: today() },
		hosts,
	});
}

// criterion's estimate for each benchmark under `dir`, by its full ID.
function criterion(dir: string): Map<string, number> {
	const out = new Map<string, number>();
	const walk = (d: string) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const path = join(d, entry.name);
			if (!entry.isDirectory()) continue;
			if (entry.name === "new" && existsSync(join(path, "benchmark.json"))) {
				const { full_id } = read(join(path, "benchmark.json"));
				const est = read(join(path, "estimates.json"));
				out.set(full_id, (est.slope ?? est.mean).point_estimate);
			} else walk(path);
		}
	};
	walk(dir);
	return out;
}

// The QUIC chart's rows, as rind-bench IDs with `{lib}` in the library's place.
const QUIC = [
	...["quic-32B", "quic-64B", "1200B", "1350B"].flatMap((size) => [
		{ op: "seal", size, id: `aes128-gcm/{lib}/${size}` },
		{ op: "open", size, id: `aes128-gcm-open/{lib}/${size}` },
	]),
	{ op: "header protection", size: "", id: "quic-header-protection/aes128/{lib}" },
	{ op: "handshake", size: "X25519", id: "rustls-full-handshake-group/x25519/{lib}" },
	{ op: "handshake", size: "X25519MLKEM768", id: "rustls-full-handshake-group/x25519mlkem768/{lib}" },
];
const LIBS = ["rind", "aws-lc-rs", "ring"];

// `out` is quic.sh's output directory: its rounds/, the source it recorded, and its load.
function quic(host: string, out: string, rounds: string[]) {
	const times = rounds.map(criterion);
	const meta = read(join(out, "source.json"));
	const rows = QUIC.map((row) => ({
		op: row.op,
		size: row.size,
		// The median of the rounds, in ns. ring has no X25519MLKEM768, so a library may be missing.
		ns: Object.fromEntries(
			LIBS.flatMap((lib) => {
				const xs = times
					.map((t) => t.get(row.id.replace("{lib}", lib)))
					.filter((x) => x !== undefined)
					.sort((a, b) => a - b);
				if (xs.length && xs.length !== times.length) throw new Error(`${row.id} for ${lib} is missing a round`);
				return xs.length ? [[lib, xs[xs.length >> 1]]] : [];
			}),
		),
	}));
	const path = join(DATA, "quic.json");
	const existing = existsSync(path) ? read(path) : { hosts: [] };
	const hosts = existing.hosts.filter((h: { name: string }) => h.name !== host);
	write("quic.json", { hosts: [...hosts, { name: host, source: { ...meta, rounds: rounds.length }, rows }] });
}

// runtimes.mjs prints `# <label>\t<version>`, then `<op>\t<us>` per line. Each file is one round of one
// runtime; a runtime's cells are the median of its rounds. `out` holds the source.json runtimes.sh wrote.
function runtimes(out: string, files: string[]) {
	const rounds = new Map<string, { version: string; us: Record<string, number>[] }>();
	for (const file of files) {
		const [head, ...lines] = readFileSync(file, "utf8").trim().split("\n");
		const [label, version] = head.slice(2).split("\t");
		const run = rounds.get(label) ?? { version, us: [] };
		if (run.version !== version) throw new Error(`${label} ran as ${run.version} and ${version}`);
		run.us.push(Object.fromEntries(lines.map((l) => [l.split("\t")[0], Number(l.split("\t")[1])])));
		rounds.set(label, run);
	}
	const runs = [...rounds].map(([runtime, { version, us }]) => ({
		runtime,
		version,
		us: Object.fromEntries(
			Object.keys(us[0]).map((op) => {
				const xs = us.map((u) => u[op]).sort((a, b) => a - b);
				if (xs.length !== us.length || xs.some(Number.isNaN)) throw new Error(`${runtime} lacks ${op} in a round`);
				return [op, xs[xs.length >> 1]];
			}),
		),
	}));
	write("runtimes.json", {
		source: { ...read(join(out, "source.json")), rounds: rounds.size && files.length / rounds.size },
		runs,
	});
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "proofs" && args.length === 1) proofs(args[0]);
else if (cmd === "build" && args.length === 1) build(args[0]);
else if (cmd === "quic" && args.length >= 3) quic(args[0], args[1], args.slice(2));
else if (cmd === "runtimes" && args.length >= 2) runtimes(args[0], args.slice(1));
else {
	console.error("usage: see the top of tools/rind/refresh.ts");
	process.exit(1);
}
