// Times the asymmetric crypto the Bun-on-rind prototype moves, through WebCrypto and node:crypto, in
// whichever runtime runs it: microseconds per call, sequential awaits, the median of ROUNDS batches.
// Prints `# <label>\t<version>`, then `<api>/<algorithm>/<operation>\t<us>` per line. An operation the
// runtime refuses is left out, and its error goes to stderr.
//
//   node tools/rind/runtimes.mjs Node
//   deno run -A tools/rind/runtimes.mjs Deno
//   bun tools/rind/runtimes.mjs Bun
import crypto from "node:crypto";

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
	try {
		await fn();
	} catch (e) {
		console.error(`${label} refuses ${name}: ${e.message}`);
		return;
	}
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

const CURVES = [
	["P-256", "SHA-256", "prime256v1"],
	["P-384", "SHA-384", "secp384r1"],
	["P-521", "SHA-512", "secp521r1"],
];

{
	const ed = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
	const sig = await subtle.sign({ name: "Ed25519" }, ed.privateKey, msg);
	const pkcs8 = await subtle.exportKey("pkcs8", ed.privateKey);
	await time("WebCrypto/Ed25519/generateKey", () => subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]));
	await time("WebCrypto/Ed25519/importKey pkcs8", () =>
		subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]),
	);
	await time("WebCrypto/Ed25519/sign", () => subtle.sign({ name: "Ed25519" }, ed.privateKey, msg));
	await time("WebCrypto/Ed25519/verify", () => subtle.verify({ name: "Ed25519" }, ed.publicKey, sig, msg));
	await time("WebCrypto/Ed25519/exportKey jwk", () => subtle.exportKey("jwk", ed.privateKey));

	const xa = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
	const xb = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
	await time("WebCrypto/X25519/generateKey", () => subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]));
	await time("WebCrypto/X25519/deriveBits", () =>
		subtle.deriveBits({ name: "X25519", public: xb.publicKey }, xa.privateKey, 256),
	);

	for (const [curve, hash] of CURVES) {
		const alg = { name: "ECDSA", namedCurve: curve };
		const k = await subtle.generateKey(alg, true, ["sign", "verify"]);
		const sig = await subtle.sign({ name: "ECDSA", hash }, k.privateKey, msg);
		const pkcs8 = await subtle.exportKey("pkcs8", k.privateKey);
		const spki = await subtle.exportKey("spki", k.publicKey);
		await time(`WebCrypto/${curve}/generateKey`, () => subtle.generateKey(alg, true, ["sign", "verify"]));
		await time(`WebCrypto/${curve}/importKey pkcs8`, () => subtle.importKey("pkcs8", pkcs8, alg, true, ["sign"]));
		await time(`WebCrypto/${curve}/importKey spki`, () => subtle.importKey("spki", spki, alg, true, ["verify"]));
		await time(`WebCrypto/${curve}/sign`, () => subtle.sign({ name: "ECDSA", hash }, k.privateKey, msg));
		await time(`WebCrypto/${curve}/verify`, () => subtle.verify({ name: "ECDSA", hash }, k.publicKey, sig, msg));
		await time(`WebCrypto/${curve}/exportKey pkcs8`, () => subtle.exportKey("pkcs8", k.privateKey));
		const ecdh = { name: "ECDH", namedCurve: curve };
		const a = await subtle.generateKey(ecdh, true, ["deriveBits"]);
		const b = await subtle.generateKey(ecdh, true, ["deriveBits"]);
		await time(`WebCrypto/${curve}/ECDH deriveBits`, () =>
			subtle.deriveBits({ name: "ECDH", public: b.publicKey }, a.privateKey, null),
		);
	}
}

// KeyObjects made once, except where the row says otherwise.
{
	const ed = crypto.generateKeyPairSync("ed25519");
	const sig = crypto.sign(null, msg, ed.privateKey);
	const pem = ed.privateKey.export({ type: "pkcs8", format: "pem" });
	await time("node:crypto/Ed25519/generateKeyPairSync", () => crypto.generateKeyPairSync("ed25519"));
	await time("node:crypto/Ed25519/sign", () => crypto.sign(null, msg, ed.privateKey));
	await time("node:crypto/Ed25519/verify", () => crypto.verify(null, msg, ed.publicKey, sig));
	await time("node:crypto/Ed25519/sign, PEM key each call", () => crypto.sign(null, msg, pem));

	const xa = crypto.generateKeyPairSync("x25519");
	const xb = crypto.generateKeyPairSync("x25519");
	await time("node:crypto/X25519/generateKeyPairSync", () => crypto.generateKeyPairSync("x25519"));
	await time("node:crypto/X25519/diffieHellman", () =>
		crypto.diffieHellman({ privateKey: xa.privateKey, publicKey: xb.publicKey }),
	);

	for (const [curve, webHash, name] of CURVES) {
		const hash = webHash.replace("-", "").toLowerCase();
		const k = crypto.generateKeyPairSync("ec", { namedCurve: curve });
		const sig = crypto.sign(hash, msg, k.privateKey);
		const pem = k.privateKey.export({ type: "pkcs8", format: "pem" });
		const peer = crypto.generateKeyPairSync("ec", { namedCurve: curve });
		await time(`node:crypto/${curve}/generateKeyPairSync`, () =>
			crypto.generateKeyPairSync("ec", { namedCurve: curve }),
		);
		await time(`node:crypto/${curve}/sign`, () => crypto.sign(hash, msg, k.privateKey));
		await time(`node:crypto/${curve}/verify`, () => crypto.verify(hash, msg, k.publicKey, sig));
		await time(`node:crypto/${curve}/createPrivateKey pem`, () => crypto.createPrivateKey(pem));
		await time(`node:crypto/${curve}/export pkcs8 pem`, () => k.privateKey.export({ type: "pkcs8", format: "pem" }));
		await time(`node:crypto/${curve}/diffieHellman`, () =>
			crypto.diffieHellman({ privateKey: k.privateKey, publicKey: peer.publicKey }),
		);
		// Made on the first call, so that a runtime refusing the curve refuses inside time().
		let ecdh;
		await time(`node:crypto/${curve}/ECDH computeSecret`, () => {
			if (!ecdh) {
				const ours = crypto.createECDH(name);
				ours.generateKeys();
				ecdh = { ours, theirs: crypto.createECDH(name).generateKeys() };
			}
			return ecdh.ours.computeSecret(ecdh.theirs);
		});
	}
}
