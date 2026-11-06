// Times WebCrypto's asymmetric operations in whichever runtime runs it: microseconds per call, sequential
// awaits, the median of ROUNDS batches. Prints `# <label>\t<version>`, then `<op>\t<us>` per line.
//
//   node tools/rind/runtimes.mjs Node
//   deno run tools/rind/runtimes.mjs Deno
//   bun tools/rind/runtimes.mjs Bun
const args = globalThis.Deno?.args ?? process.argv.slice(2);
const label = args[0] ?? "unknown";
const version = globalThis.Bun
	? `bun ${Bun.version} (${Bun.revision.slice(0, 9)})`
	: globalThis.Deno
		? `deno ${Deno.version.deno}`
		: `node ${process.version}`;
const BUDGET = 400; // ms of warm-up per op, a quarter of it to size the batch
const ROUNDS = 5;

const { subtle } = globalThis.crypto;
const msg = new Uint8Array(64).fill(0x5a);

async function time(name, fn) {
	const warm = performance.now();
	let n = 0;
	while (performance.now() - warm < BUDGET / 4) {
		await fn();
		n++;
	}
	const batch = Math.max(1, n * 2);
	const samples = [];
	for (let r = 0; r < ROUNDS; r++) {
		const t = performance.now();
		for (let i = 0; i < batch; i++) await fn();
		samples.push(((performance.now() - t) * 1000) / batch);
	}
	samples.sort((a, b) => a - b);
	console.log(`${name}\t${samples[ROUNDS >> 1].toFixed(2)}`);
}

console.log(`# ${label}\t${version}`);

const ed = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const edSig = await subtle.sign({ name: "Ed25519" }, ed.privateKey, msg);
await time("Ed25519 sign", () => subtle.sign({ name: "Ed25519" }, ed.privateKey, msg));
await time("Ed25519 verify", () => subtle.verify({ name: "Ed25519" }, ed.publicKey, edSig, msg));

const xa = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
const xb = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
await time("X25519 deriveBits", () => subtle.deriveBits({ name: "X25519", public: xb.publicKey }, xa.privateKey, 256));

for (const [curve, hash] of [
	["P-256", "SHA-256"],
	["P-384", "SHA-384"],
]) {
	const alg = { name: "ECDSA", namedCurve: curve };
	const k = await subtle.generateKey(alg, true, ["sign", "verify"]);
	const sig = await subtle.sign({ name: "ECDSA", hash }, k.privateKey, msg);
	await time(`${curve} sign`, () => subtle.sign({ name: "ECDSA", hash }, k.privateKey, msg));
	await time(`${curve} verify`, () => subtle.verify({ name: "ECDSA", hash }, k.publicKey, sig, msg));
	if (curve === "P-384") {
		const pkcs8 = await subtle.exportKey("pkcs8", k.privateKey);
		await time(`${curve} importKey pkcs8`, () => subtle.importKey("pkcs8", pkcs8, alg, true, ["sign"]));
	}
}
