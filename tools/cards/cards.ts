// The announcement cards for the open-source stack (crates + npm packages), one
// entry per post. `just cards` turns each into a 1200x675 PNG for
// X/Bluesky/Discord (the format Bun uses for its "in the next version" posts).
// CDN announcements live in moq.pro's copy of this tool. Copy conventions:
//
// - `title` is the headline. `**word**` gets the hand-drawn green underline
//   from the splash, so save it for the one phrase the post is about.
// - `sub` accepts `` `mono` `` and `**green**`. `code` is syntax-highlighted as
//   `lang` (shell by default), where a line starting with `$ ` is a prompt.
// - `eyebrow` (top right) names the release: a crate + version. `note` (bottom right) is the one-line kicker, if any.
//
// Keep cards factual: a version, a rate, a measured number. Retire a card once
// it has been posted; the git history is the archive.

export type Lang = "shell" | "rust" | "toml" | "ts";

export type Card = {
	slug: string;
	eyebrow?: string;
	title: string;
	sub?: string;
	code?: string;
	lang?: Lang;
	note?: string;
};

export const CARDS: Card[] = [
	{
		slug: "e2ee",
		eyebrow: "new crate: moq-e2ee 0.0.1",
		title: "End-to-end **encrypted** media.",
		sub: "Relays forward ciphertext. Content keys never enter `moq-net`. AES-128-GCM inline: about 1.3 µs per 1 KiB frame, 440 ns per Opus datagram.",
		code: "$ cargo add moq-e2ee",
		note: "draft-lcurley-moq-e2ee, profile moq-e2ee-01",
	},
	{
		slug: "uring",
		eyebrow: "new crate: moq-uring 0.0.1",
		title: "io_uring, **thread per core**.",
		sub: "One ring per worker: multishot `recvmsg` from a provided-buffer ring, `UDP_GRO` in, `UDP_SEGMENT` out, timers on the ring, futex parking. QUIC on top, no tokio in the hot path.",
		code: [
			"[runtime]",
			"workers = 8       # one QUIC worker per core, SO_REUSEPORT steered by connection id",
			"pin = true",
			"io_uring = true   # Linux 6.12+; older kernels keep the tokio stack",
		].join("\n"),
		lang: "toml",
		note: "moq-relay 0.15",
	},
	{
		slug: "noq",
		eyebrow: "moq-tokio 0.19",
		title: "**noq** is the default QUIC stack.",
		sub: "Every native MoQ binary now dials with our own QUIC implementation. quinn and quiche stay one feature flag away.",
		code: [
			"[dependencies]",
			'moq-tokio = "0.19"                        # noq',
			'moq-tokio = { version = "0.19", features = ["quinn"] }',
			'moq-tokio = { version = "0.19", features = ["quiche"] }',
		].join("\n"),
		lang: "toml",
	},
	{
		slug: "binary",
		eyebrow: "new crate: moq-binary 0.1.0",
		title: "Binary tracks: **snapshot** or **stream**.",
		sub: "`snapshot` is lossy: one value over time, consumers get the latest. `stream` is lossless: an ordered append-log, nothing superseded. Same DEFLATE framing as `moq-json`, so the two agree on the wire.",
		code: [
			"// a poster image: whoever joins late gets the current one",
			"let poster = snapshot::Producer::new(track, snapshot::ProducerConfig::default());",
			"",
			"// an event log: every payload, in order",
			"let events = stream::Producer::new(track, stream::ProducerConfig::default());",
		].join("\n"),
		lang: "rust",
	},
	{
		slug: "auth",
		eyebrow: "new crate: moq-auth 0.1.0",
		title: "One **auth contract** for every relay.",
		sub: "The request a relay sends per session, the grant an auth server answers with, the lease a session holds, and the JWT a client presents. Paths are patterns: `foo` is one broadcast, `foo/**` a subtree.",
		code: [
			"$ moq auth generate --out key.jwk",
			"$ moq auth sign --key key.jwk --root demo --publish 'bbb/**' > token.jwt",
			"$ moq auth verify --key key.jwk < token.jwt",
		].join("\n"),
	},
	{
		slug: "room",
		eyebrow: "@moq/room 0.2",
		title: "A video call is **a path prefix**.",
		sub: "Members are discovered from announcements. Camera, mic, and screenshare built in. No room server: joining is a token for the prefix. Native twin: `moq-room`.",
		code: [
			'const url = new URL("https://relay.example.com/meet/demo?jwt=...");',
			"const connection = new Connection({ url });",
			'const identity = Path.from("alice");',
			"",
			"new Local({ connection, identity }).cameraEnabled.set(true);",
			"const room = new Room({ connection, identity });",
		].join("\n"),
		lang: "ts",
	},
	{
		slug: "play",
		eyebrow: "moq-cli 0.12",
		title: "Watch without **a browser**.",
		sub: "`moq play` decodes H.264, H.265, AV1, Opus, and AAC with the platform's hardware decoder, into a native window synced to the speaker.",
		code: [
			"$ cargo install moq-cli --features play",
			"$ moq --connect https://relay.example.com/anon --broadcast my-stream.hang play",
			"",
			"# trade latency for a jittery link",
			"$ moq ... play --delay 500ms",
		].join("\n"),
	},
	{
		slug: "lan",
		eyebrow: "moq-cli 0.12",
		title: "Mesh the LAN with **zero config**.",
		sub: "`--cluster-lan` finds every MoQ process on the network over mDNS and meshes with it. No relay, no internet, no certificates. Relays join the same mesh with `[cluster.lan]`.",
		code: [
			"# on the camera box",
			"$ moq --cluster-lan --broadcast cam.hang import capture",
			"",
			"# anywhere else on the network",
			"$ moq --cluster-lan --broadcast cam.hang play",
		].join("\n"),
		note: "--cluster-lan-secret to keep strangers out",
	},
	{
		slug: "media",
		eyebrow: "moq-video + moq-audio",
		title: "Native media, **no ffmpeg**.",
		sub: "`getUserMedia` and WebCodecs for Rust. Camera, screen, and mic capture. Hardware codecs on VideoToolbox, Media Foundation, NVENC, VAAPI, V4L2, and MediaCodec. wgpu rendering and echo cancellation.",
		code: "$ cargo add moq-video --features capture,render\n$ cargo add moq-audio --features capture,playback",
		note: "no system codecs to install",
	},
	{
		slug: "languages",
		eyebrow: "8 languages, 1 wire",
		title: "MoQ in **your language**.",
		sub: "Rust and TypeScript implementations, plus Python, Kotlin, Swift, Go, Dart, and C over the same Rust core. A publisher in Python plays in Swift.",
		code: [
			"$ cargo add moq-net",
			"$ bun add @moq/net",
			"$ pip install moq-rs",
			"$ go get moq.dev/moq",
			"$ dart pub add moq",
			"# Kotlin: dev.moq:moq   Swift: moq-dev/moq-swift   C: libmoq",
		].join("\n"),
	},
	{
		slug: "gateway",
		eyebrow: "moq-cli 0.12",
		title: "Bridge **every protocol**.",
		sub: "RTMP, SRT, WebRTC (WHIP/WHEP), and HLS in and out of MoQ, as either the server or the client. Chain stages over one connection.",
		code: [
			"$ moq --connect https://relay.example.com/anon \\",
			"    import --broadcast event.hang srt --listen 0.0.0.0:9000 \\",
			"    -- export --broadcast event.hang hls --listen 0.0.0.0:8080",
		].join("\n"),
	},
	{
		slug: "transcode",
		eyebrow: "moq-cli 0.12",
		title: "Transcode **on demand**.",
		sub: "`moq transcode` publishes an ABR ladder next to any broadcast. A rung is only decoded and encoded while someone watches it, and on NVIDIA the whole pipeline stays on the GPU.",
		code: [
			"$ moq --connect https://relay.example.com/anon --broadcast cam.hang transcode \\",
			"    --rung 720:2500000 --rung 360:600000 --encoder nvenc --decoder nvdec",
		].join("\n"),
	},
];
