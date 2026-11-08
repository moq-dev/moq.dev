// Regenerates the rind post's chart data (src/components/rind/data/) from a rind checkout and
// fresh measurements. See README.md beside this file for when to run each step.
//
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

// rind's report hosts, named by CPU since the hostnames mean nothing outside.
const HOSTS: Record<string, string> = {
	desktop: "Arrow Lake",
	nixos: "Zen 3",
	nixos2: "Coffee Lake",
	kixtop: "Apple M4",
};

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
// The post assumes callers hold DIT across a batch, so on Mac, rind's time is the report's
// rind-dit-held, which holds it across the timed loop rather than setting it around each call.
const timed = (lib: string) => (lib === "rind" ? ["rind-dit-held", "rind"] : [lib]);

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

// Cells where a proven routine does the core math for at least some of the row's operations, on every
// host of that architecture, under unproven glue, so verified.toml's ✓ doesn't count them. The core is
// the whole cipher, block function, scalar multiplication, NTT, or exponentiation; field arithmetic
// under unproven point formulas, or multiplications under an unproven exponentiation, isn't. Checked
// against each library's source at the version rind's report locks:
//
// - rind: ALGORITHMS.md's tables and Sources, and rind/src/low/mod.rs's per-arch imports. x86_64 runs
//   Vale's AES-GCM; aarch64 runs s2n-bignum's AES-GCM kernels in place, outside their proofs, so gets
//   none. Both run s2n-bignum's scalar multiplications (p384_montjscalarmul, p521_jscalarmul,
//   edwards25519_scalarmul*) and ML-KEM NTT and rejection sampling. aarch64 P-256 and X25519 are ✓.
// - aws-lc-rs (aws-lc-sys 0.47): ec_nistp.h's EC_NISTP_USE_S2N_BIGNUM and curve25519/internal.h's
//   CURVE25519_S2N_BIGNUM_CAPABLE take s2n-bignum's X25519, Ed25519, and P-256/384/521 scalar
//   multiplications on Linux and Apple, x86_64 and aarch64 alike; mlkem_native_backend.h takes
//   mlkem-native's AVX2 or aarch64 backend. aws-lc-verification proves AES-GCM and the AES block on
//   x86_64 only, and on aarch64 only SHA-2, whose routine for the SHA-512 instructions (the M4's) ends
//   before its store, so neither AES row nor SHA-512 gets credit there.
// - graviola 0.4.4: src/low/mod.rs takes s2n-bignum's X25519, Ed25519, and ML-KEM NTT and base
//   multiplication on both architectures.
// - libcrux: portable Rust from HACL*, with no CPU dispatch, so the same on both.
// - ring, RustCrypto, and OpenSSL: none, as verified.toml says.
//
// s2n-bignum's HOL Light proofs cover each of these routines on both architectures (x86/proofs,
// arm/proofs), as do mlkem-native's for its AVX2 and aarch64 backends (proofs/hol_light/<arch>).
type Partial = Record<string, Record<string, { proof: string; link: string }>>;
const S2N_X86 = "https://github.com/awslabs/s2n-bignum/tree/main/x86/proofs";
const S2N_ARM = "https://github.com/awslabs/s2n-bignum/tree/main/arm/proofs";
const SAW = "https://github.com/awslabs/aws-lc-verification/blob/797302470c1703cbb1a3a6fa98daffef0bfd3d80/README.md";
const MLKEM_X86 = "https://github.com/pq-code-package/mlkem-native/tree/main/proofs/hol_light/x86_64/proofs";
const MLKEM_ARM = "https://github.com/pq-code-package/mlkem-native/tree/main/proofs/hol_light/aarch64/proofs";
const LIBCRUX: Partial = {
	libcrux: {
		"XChaCha20-Poly1305": {
			proof: "HACL*'s F* ChaCha20-Poly1305, under an unverified HChaCha20",
			link: "https://github.com/hacl-star/hacl-star/tree/main/code/chacha20poly1305",
		},
	},
};
const PARTIAL: Record<string, Partial> = {
	x86_64: {
		rind: {
			"AES-GCM": {
				proof: "Vale's F* AES-GCM, for every message without VAES but only short ones with it",
				link: "https://github.com/moq-dev/rind/blob/main/ALGORITHMS.md",
			},
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_X86 },
			"P-256": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"ML-KEM-768": { proof: "s2n-bignum's and mlkem-native's HOL Light NTT and sampling", link: MLKEM_X86 },
		},
		"aws-lc-rs": {
			"AES-GCM": { proof: "aws-lc-verification's SAW AES-GCM, for AES-256 only", link: SAW },
			"AES header protection": { proof: "aws-lc-verification's SAW AES block, for AES-256 only", link: SAW },
			X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N_X86 },
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_X86 },
			"P-256": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_X86 },
			"ML-KEM-768": { proof: "mlkem-native's HOL Light AVX2 NTT and sampling", link: MLKEM_X86 },
		},
		graviola: {
			X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N_X86 },
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_X86 },
			"ML-KEM-768": { proof: "s2n-bignum's HOL Light NTT and base multiplication", link: S2N_X86 },
		},
		...LIBCRUX,
	},
	aarch64: {
		rind: {
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_ARM },
			"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_ARM },
			"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_ARM },
			"ML-KEM-768": { proof: "s2n-bignum's HOL Light NTT and sampling", link: S2N_ARM },
		},
		"aws-lc-rs": {
			X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N_ARM },
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_ARM },
			"P-256": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_ARM },
			"P-384": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_ARM },
			"P-521": { proof: "s2n-bignum's HOL Light scalar multiplication, for ECDH", link: S2N_ARM },
			"ML-KEM-768": { proof: "mlkem-native's HOL Light aarch64 NTT and sampling", link: MLKEM_ARM },
		},
		graviola: {
			X25519: { proof: "s2n-bignum's HOL Light X25519 ladder", link: S2N_ARM },
			Ed25519: { proof: "s2n-bignum's HOL Light scalar multiplications", link: S2N_ARM },
			"ML-KEM-768": { proof: "s2n-bignum's HOL Light NTT and base multiplication", link: S2N_ARM },
		},
		...LIBCRUX,
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
// proven: end to end by verified.toml's ✓, a proven core by the host's arch's PARTIAL, or neither. A
// library without the row's operations gets null.
function libraries(rind: string) {
	const report = sections(rind);
	const verified = Bun.TOML.parse(readFileSync(join(rind, "benchmarks/verified.toml"), "utf8")) as {
		verified: { library: string; operations: string[]; arch?: string; cpu?: string[] }[];
	};
	for (const [arch, libs] of Object.entries(PARTIAL))
		for (const [lib, rows] of Object.entries(libs))
			for (const row of Object.keys(rows))
				if (!LIBRARIES.includes(lib) || !COVERAGE.some((c) => c.name === row))
					throw new Error(`PARTIAL names ${arch} ${lib}'s ${row}, which the heatmap lacks`);

	const hosts = Object.entries(HOSTS).map(([host, name]) => {
		const data = read(join(rind, `benchmarks/data/${host}.json`));
		if (data.status !== "ok") throw new Error(`${host}'s report is ${data.status}`);
		// The report records arm64 as uname says it on macOS; verified.toml and PARTIAL say aarch64.
		const arch = ({ arm64: "aarch64", aarch64: "aarch64", x86_64: "x86_64" } as Record<string, string>)[data.cpu.arch];
		if (!PARTIAL[arch]) throw new Error(`${host}'s arch ${data.cpu.arch} has no PARTIAL`);
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
					(!v.arch || v.arch === arch) &&
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
							const r = timed(lib)
								.map((name) => results.find((r) => r.library === name && op(r.operation) === id))
								.find((r) => r);
							return r ? [[lib, r.ns]] : [];
						}),
					),
				]),
		);
		return {
			name,
			arch,
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
							return [lib, some || PARTIAL[arch][lib]?.[row.name] ? "routine" : "none"];
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
if (cmd === "build" && args.length === 1) build(args[0]);
else if (cmd === "libraries" && args.length === 1) libraries(args[0]);
else if (cmd === "runtimes" && args.length >= 2) runtimes(args[0], args.slice(1));
else {
	console.error("usage: see the top of tools/rind/refresh.ts");
	process.exit(1);
}
