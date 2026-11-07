// Regenerates the rind post's chart data (src/components/rind/data/) from a rind checkout and
// fresh measurements. See README.md beside this file for when to run each step.
//
//   bun tools/rind/refresh.ts proofs <rind>               verified.toml + ALGORITHMS.md + tiers.json
//   bun tools/rind/refresh.ts build <rind>                benchmarks/data/*.json build_cost
//   bun tools/rind/refresh.ts libraries <rind>            benchmarks/data/*.json times + verified.toml + admin/bench-report
//   bun tools/rind/refresh.ts runtimes <out> <out>/*.tsv  runtimes.sh's rounds
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// rind's CPU tiers, as bench.yml denies features and ALGORITHMS.md's tables name them.
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

// The primitives charted, as ALGORITHMS.md's rows (by prefix) and nightly benchmark IDs
// (admin/bench-report's TIER_ROWS). `helpers` marks a row whose ✓ covers only helpers, such as
// RSA's s2n-bignum multiplications under rind's own exponentiation, which isn't a proven core.
const ROWS = [
	{ name: "AES-GCM", algorithms: "AES-GCM", pattern: /^aes(128|256)-gcm(-open)?\// },
	{ name: "AES header protection", algorithms: "AES block", pattern: /^quic-header-protection\/aes(128|256)\// },
	{
		name: "ChaCha20 header protection",
		algorithms: "ChaCha20 (header",
		pattern: /^quic-header-protection\/chacha20\//,
	},
	{ name: "ChaCha20-Poly1305", algorithms: "ChaCha20-Poly1305", pattern: /^x?chacha20poly1305\// },
	{ name: "SHA-256", algorithms: "SHA-256", pattern: /^sha256(-updates)?\// },
	{ name: "SHA-384, SHA-512", algorithms: "SHA-384", pattern: /^sha(384|512|512-256)\// },
	{ name: "HMAC", algorithms: "HMAC", pattern: /^hmac-/ },
	{ name: "HKDF", algorithms: "HKDF", pattern: /^hkdf-/ },
	{ name: "X25519", algorithms: "X25519", pattern: /^x25519-/ },
	{ name: "Ed25519", algorithms: "Ed25519", pattern: /^ed25519-/ },
	{ name: "P-256", algorithms: "P-256", pattern: /^p256-/ },
	{ name: "P-384", algorithms: "P-384", pattern: /^p384-/ },
	{ name: "P-521", algorithms: "P-521", pattern: /^p521-/ },
	{ name: "ML-KEM-768", algorithms: "ML-KEM-768", pattern: /^mlkem768-/ },
	{ name: "RSA", algorithms: "RSA", pattern: /^rsa\d+-(pkcs1|pss|load)/, helpers: true },
];

// Each tier's cell text in ALGORITHMS.md's two tables; an empty cell repeats the one to its left.
function algorithms(markdown: string): Map<string, string[]> {
	const cells = new Map<string, string[]>();
	for (const line of markdown.split("\n")) {
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
	const table = algorithms(readFileSync(join(rind, "ALGORITHMS.md"), "utf8"));
	const nightly = read(join(rind, "benchmarks/data/tiers.json"));

	const cells = ROWS.map((row) => {
		const text = [...table].find(([name]) => name.startsWith(row.algorithms))?.[1];
		if (!text || text.length !== TIERS.length) throw new Error(`ALGORITHMS.md has no full row for ${row.algorithms}`);

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
				status: proven ? "e2e" : !("helpers" in row) && text[i].includes("✓") ? "routine" : "none",
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
			files: ["ALGORITHMS.md", "benchmarks/verified.toml", "benchmarks/data/tiers.json"],
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

// rind's report hosts, named by CPU since the hostnames mean nothing outside. The library charts
// leave out Apple M4 until PARTIAL is checked against each library's aarch64 source.
const HOSTS: Record<string, string> = {
	desktop: "Arrow Lake",
	nixos: "Zen 3",
	nixos2: "Coffee Lake",
	kixtop: "Apple M4",
};
const X86_HOSTS = ["desktop", "nixos", "nixos2"];

// A host whose report skipped its build cost, as a busy one does, is left out and named.
function build(rind: string) {
	const hosts = Object.keys(HOSTS)
		.filter((host) => existsSync(join(rind, `benchmarks/data/${host}.json`)))
		.flatMap((host) => {
			const data = read(join(rind, `benchmarks/data/${host}.json`));
			const cost = data.build_cost;
			if (cost.status !== "ok") {
				console.warn(`left out ${host}: its build cost is ${cost.status} (${cost.reason ?? cost.error})`);
				return [];
			}
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

// The libraries rind's report times, by its names for them.
const LIBRARIES = ["rind", "aws-lc-rs", "ring", "rustcrypto", "graviola", "libcrux", "openssl"];

// The coverage heatmap's rows, matched against report operations without their library.
const COVERAGE = [
	{ name: "AES-GCM", pattern: /^aes(128|256)-gcm(-open)?\// },
	{ name: "ChaCha20-Poly1305", pattern: /^chacha20poly1305\// },
	{ name: "XChaCha20-Poly1305", pattern: /^xchacha20poly1305\// },
	{ name: "AES header protection", pattern: /^quic-header-protection\/aes(128|256)$/ },
	{ name: "ChaCha20 header protection", pattern: /^quic-header-protection\/chacha20$/ },
	{ name: "SHA-256", pattern: /^sha256\// },
	{ name: "SHA-512", pattern: /^sha512\// },
	{ name: "HMAC-SHA256", pattern: /^hmac-sha256\// },
	{ name: "HKDF-SHA256", pattern: /^hkdf-sha256\// },
	{ name: "X25519", pattern: /^x25519-/ },
	{ name: "Ed25519", pattern: /^ed25519-/ },
	{ name: "P-256", pattern: /^p256-/ },
	{ name: "P-384", pattern: /^p384-/ },
	{ name: "P-521", pattern: /^p521-/ },
	{ name: "RSA-2048 PSS", pattern: /^rsa2048-pss-/ },
	{ name: "RSA-2048 PKCS#1", pattern: /^rsa2048-pkcs1-/ },
	{ name: "ML-KEM-768", pattern: /^mlkem768-/ },
];

// Cells where a proven routine does the core math for at least some of the row's operations, on all
// three hosts, under unproven glue, so verified.toml's ✓ doesn't count them. The core is the whole
// cipher, block function, scalar multiplication, NTT, or exponentiation; field arithmetic under
// unproven point formulas, or multiplications under an unproven exponentiation, isn't. Checked
// against each library's source at the version rind's report locks.
const S2N = "https://github.com/awslabs/s2n-bignum/tree/main/x86/proofs";
const SAW = "https://github.com/awslabs/aws-lc-verification/blob/797302470c1703cbb1a3a6fa98daffef0bfd3d80/README.md";
const MLKEM = "https://github.com/pq-code-package/mlkem-native/tree/main/proofs/hol_light/x86_64/proofs";
const PARTIAL: Record<string, Record<string, { proof: string; link: string }>> = {
	rind: {
		"AES-GCM": {
			proof: "Vale's F* AES-GCM, for every message without VAES but only short ones with it",
			link: "https://github.com/moq-dev/rind/blob/main/ALGORITHMS.md",
		},
		Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N },
		"P-256": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"ML-KEM-768": { proof: "s2n-bignum's and mlkem-native's HOL Light NTT and sampling", link: MLKEM },
	},
	"aws-lc-rs": {
		"AES-GCM": { proof: "aws-lc-verification's SAW AES-GCM, for AES-256 only", link: SAW },
		"AES header protection": { proof: "aws-lc-verification's SAW AES block, for AES-256 only", link: SAW },
		X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N },
		Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N },
		"P-256": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N },
		"ML-KEM-768": { proof: "mlkem-native's HOL Light AVX2 NTT and sampling", link: MLKEM },
	},
	graviola: {
		X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N },
		Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N },
		"ML-KEM-768": { proof: "s2n-bignum's HOL Light NTT and base multiplication", link: S2N },
	},
	libcrux: {
		"XChaCha20-Poly1305": {
			proof: "HACL*'s F* ChaCha20-Poly1305, under an unverified HChaCha20",
			link: "https://github.com/hacl-star/hacl-star/tree/main/code/chacha20poly1305",
		},
	},
};

// The report's operations by section, with their labels, from admin/bench-report itself.
function sections(rind: string): { name: string; operations: { id: string; label: string }[] }[] {
	const script = `
import json, runpy, sys
m = runpy.run_path(sys.argv[1])
print(json.dumps([
    {"name": name, "operations": [{"id": m["row_name"](op), "label": m["label"](m["row_name"](op))} for op in ops]}
    for name, ops in m["SECTIONS"]
]))`;
	return JSON.parse(execFileSync("python3", ["-c", script, join(rind, "admin/bench-report")], { encoding: "utf8" }));
}

// Every library on rind's report hosts: every operation's time, and how much of each coverage row is
// proven: end to end by verified.toml's ✓, a proven core by PARTIAL, or neither. A library without the
// row's operations gets null.
function libraries(rind: string) {
	const report = sections(rind);
	const verified = Bun.TOML.parse(readFileSync(join(rind, "benchmarks/verified.toml"), "utf8")) as {
		verified: { library: string; operations: string[]; arch?: string; cpu?: string[] }[];
	};
	for (const [lib, rows] of Object.entries(PARTIAL))
		for (const row of Object.keys(rows))
			if (!LIBRARIES.includes(lib) || !COVERAGE.some((c) => c.name === row))
				throw new Error(`PARTIAL names ${lib}'s ${row}, which the heatmap lacks`);

	const hosts = X86_HOSTS.map((host) => {
		const name = HOSTS[host];
		const data = read(join(rind, `benchmarks/data/${host}.json`));
		if (data.status !== "ok") throw new Error(`${host}'s report is ${data.status}`);
		const cpu = data.rind_cpu.cpuid as Record<string, number>;
		const results = data.results as { operation: string; library: string; ns: number }[];
		// A report operation as verified.toml names it: "aes128-gcm/{lib}/32B" is "aes128-gcm/32B".
		const op = (operation: string) => operation.replace("/{lib}", "").replace("{lib}/", "");
		const has = (feature: string) => {
			const flag = feature.replace(/^!/, "");
			if (!(flag in cpu)) throw new Error(`${host} doesn't report CPU feature ${flag}`);
			return feature.startsWith("!") ? !cpu[flag] : !!cpu[flag];
		};
		const proven = (lib: string, o: string) =>
			verified.verified.some(
				(v) =>
					v.library === lib &&
					(!v.arch || v.arch === data.cpu.arch) &&
					(v.cpu ?? []).every(has) &&
					v.operations.some((p) => (p.endsWith("/*") ? o.startsWith(p.slice(0, -1)) : o === p)),
			);
		const times = Object.fromEntries(
			report
				.flatMap((s) => s.operations)
				.map(({ id }) => [
					id,
					Object.fromEntries(
						LIBRARIES.flatMap((lib) => {
							const r = results.find((r) => r.library === lib && op(r.operation) === id);
							return r ? [[lib, r.ns]] : [];
						}),
					),
				]),
		);
		return {
			name,
			source: { rind: data.commit, cpu: data.cpu.model, date: data.started, versions: data.libraries },
			times,
			coverage: Object.fromEntries(
				COVERAGE.map((row) => [
					row.name,
					Object.fromEntries(
						LIBRARIES.map((lib) => {
							const ops = results.filter((r) => r.library === lib && row.pattern.test(op(r.operation)));
							if (!ops.length) return [lib, null];
							if (ops.every((r) => proven(lib, op(r.operation)))) return [lib, "e2e"];
							const some = ops.some((r) => proven(lib, op(r.operation)));
							return [lib, some || PARTIAL[lib]?.[row.name] ? "routine" : "none"];
						}),
					),
				]),
			),
		};
	});
	write("libraries.json", {
		source: {
			rind: commit(rind),
			files: ["benchmarks/data/<host>.json", "benchmarks/verified.toml", "admin/bench-report"],
			generated: today(),
		},
		libraries: LIBRARIES,
		sections: report,
		rows: COVERAGE.map((c) => c.name),
		partial: PARTIAL,
		hosts,
	});
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
else if (cmd === "libraries" && args.length === 1) libraries(args[0]);
else if (cmd === "runtimes" && args.length >= 2) runtimes(args[0], args.slice(1));
else {
	console.error("usage: see the top of tools/rind/refresh.ts");
	process.exit(1);
}
