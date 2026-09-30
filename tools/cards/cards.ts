// The announcement cards for the open-source stack (crates + npm packages), one
// entry per post. `just cards` turns each into a 1200x675 PNG for
// X/Bluesky/Discord (the format Bun uses for its "in the next version" posts).
// CDN announcements live in moq.pro's copy of this tool. Copy conventions:
//
// - `title` is the headline. `**word**` gets moq.dev's hand-drawn green stroke, so
//   save it for the one phrase the post is about.
// - `sub` accepts `` `mono` `` and `**green**`, as do tile names and details.
// - Below the sub, a card shows at most one of: `tiles`, a grid of short
//   facts (a feature, a protocol, a package), or `code`, syntax-highlighted as
//   `lang` (shell by default) where a line starting with `$ ` is a prompt. Only
//   reach for code when the snippet itself is the news; most cards don't need
//   either. A tile's `icon` sits before its name.
// - `eyebrow` (top right) names the release: a crate + version. `note` (bottom right) is the one-line kicker, if any.
//
// Keep cards factual: a version, a rate, a measured number. Retire a card once
// it has been posted; the git history is the archive.

export type Lang = "shell" | "rust" | "toml" | "ts";

export type Tile = {
	// `public/drawn/icon-<name>.svg`, else the traced `public/icons/cards/<name>.svg` (or several).
	icon?: string | string[];
	name: string;
	detail?: string;
};

export type Card = {
	slug: string;
	eyebrow?: string;
	title: string;
	sub?: string;
	tiles?: Tile[];
	code?: string;
	lang?: Lang;
	note?: string;
};

export const CARDS: Card[] = [
	{
		slug: "e2ee",
		eyebrow: "new crate: moq-e2ee 0.0.1",
		title: "End-to-end **encrypted** media.",
		sub: "Your CDN can't spy on you. Relays route what they can't read: not the media, and not even the names. The keys stay in your app, so neither moq.pro nor anyone else in the middle sees what you're streaming.",
		tiles: [
			{ icon: "lock", name: "Payloads", detail: "AES-128-GCM, every frame and datagram" },
			{ icon: "tag", name: "Broadcast names", detail: "an opaque 22-character path" },
			{ icon: "hidden", name: "Track names", detail: "opaque too, derived per track" },
			{ icon: "key", name: "Keys", detail: "never reach the relay" },
		],
		note: "draft-lcurley-moq-e2ee",
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
		slug: "json",
		eyebrow: "moq-json + @moq/json",
		title: "JSON tracks, **91% smaller**.",
		sub: "Updates go out as RFC 7396 merge-patch deltas, and DEFLATE keeps one window per group, so a change costs a few bytes instead of the whole document.",
		tiles: [
			{
				icon: "snapshot",
				name: "Snapshot",
				detail: "The latest value. Late joiners get the full document, then deltas.",
			},
			{ icon: "log", name: "Stream", detail: "A lossless append-log. Every record, in order." },
			{
				icon: "window",
				name: "Window **new**",
				detail: "The last N records. Join at any point, then follow pushes and pops.",
			},
		],
		note: "examples/telemetry.rs: snapshot + delta + deflate",
	},
	{
		slug: "binary",
		eyebrow: "new crate: moq-binary 0.1.0",
		title: "Binary tracks: **snapshot** or **stream**.",
		sub: "Opaque payloads over MoQ, with the same per-group DEFLATE as `moq-json`.",
		tiles: [
			{
				icon: "snapshot",
				name: "Snapshot",
				detail: "Lossy. One value over time; whoever joins late gets the latest. A poster, a config, a game state.",
			},
			{
				icon: "log",
				name: "Stream",
				detail: "Lossless. An ordered append-log where nothing is superseded. Events, chat, logs.",
			},
		],
	},
	{
		slug: "auth",
		eyebrow: "new crate: moq-auth 0.1.0",
		title: "Auth with **wildcards**.",
		sub: "Point the relay at `--auth-url` and it asks your server about every session. Answer with the paths it may publish and subscribe to. It's re-checked while the session lives, so access can be revoked mid-stream.",
		tiles: [
			{ name: "`bbb`", detail: "exactly one broadcast" },
			{ name: "`room/*`", detail: "any one level down" },
			{ name: "`alice/**`", detail: "a whole subtree" },
			{ name: "`room/*/chat`", detail: "wildcards mid-path" },
		],
		note: "or sign JWTs with moq auth sign",
	},
	{
		slug: "room",
		eyebrow: "@moq/room 0.2",
		title: "A video call is **a path prefix**.",
		sub: "Members are discovered from announcements. Camera, mic, and screenshare built in. No room server: joining is a token for the prefix. Native twin: `moq-room`.",
	},
	{
		slug: "play",
		eyebrow: "moq-cli 0.12",
		title: "Watch without **a browser**.",
		sub: "`moq play` decodes H.264, H.265, AV1, Opus, and AAC with the platform's hardware decoder, into a native window synced to the speaker.",
		code: "$ moq --connect https://relay.example.com/anon --broadcast my-stream.hang play",
	},
	{
		slug: "lan",
		eyebrow: "moq-cli 0.12",
		title: "Mesh the LAN with **zero config**.",
		sub: "`--cluster-lan` meshes every MoQ process on the network over mDNS: no relay, no internet, no certificates. `--cluster-lan-secret` keeps strangers out.",
		code: [
			"$ moq --cluster-lan --broadcast cam.hang import capture  # on the camera box",
			"$ moq --cluster-lan --broadcast cam.hang play            # anywhere on the LAN",
		].join("\n"),
		note: "add --connect cdn.moq.pro for everyone off the LAN",
	},
	{
		slug: "media",
		eyebrow: "moq-video + moq-audio",
		title: "Native media, **no ffmpeg**.",
		sub: "`getUserMedia` and WebCodecs for Rust, with no system codecs to install.",
		tiles: [
			{ icon: "rocket", name: "Zero-copy", detail: "GPU in, GPU out" },
			{ icon: "apple", name: "macOS", detail: "VideoToolbox" },
			{ icon: "windows", name: "Windows", detail: "Media Foundation" },
			{ icon: "nvidia", name: "NVIDIA", detail: "NVENC + NVDEC" },
			{ icon: ["amd", "intel"], name: "AMD + Intel", detail: "VAAPI" },
			{ icon: "linux", name: "Linux", detail: "V4L2, PipeWire" },
			{ icon: "android", name: "Android", detail: "MediaCodec" },
			{ icon: "mic", name: "Audio", detail: "echo cancellation" },
		],
	},
	{
		slug: "languages",
		eyebrow: "8 languages, 1 wire",
		title: "MoQ in **your language**.",
		sub: "Rust and TypeScript, plus six bindings over the same core. Python publishes, Swift plays.",
		tiles: [
			{ icon: "rust", name: "Rust", detail: "`moq-net`" },
			{ icon: "typescript", name: "TypeScript", detail: "`@moq/net`" },
			{ icon: "python", name: "Python", detail: "`moq-rs`" },
			{ icon: "kotlin", name: "Kotlin", detail: "`dev.moq:moq`" },
			{ icon: "swift", name: "Swift", detail: "`moq-dev/moq-swift`" },
			{ icon: "go", name: "Go", detail: "`moq.dev/moq`" },
			{ icon: "dart", name: "Dart", detail: "`moq`" },
			{ icon: "c", name: "C", detail: "`libmoq`" },
		],
	},
	{
		slug: "gateway",
		eyebrow: "moq-cli 0.12",
		title: "Bridge **every protocol**.",
		sub: "`moq import` and `moq export`, as the server or the client. Plus FLV, WebM, and Annex-B over pipes.",
		tiles: [
			{ icon: "rtmp", name: "RTMP", detail: "in + out" },
			{ icon: "srt", name: "SRT", detail: "in + out" },
			{ icon: "webrtc", name: "WHIP", detail: "serve in, push out" },
			{ icon: "webrtc", name: "WHEP", detail: "serve out, pull in" },
			{ icon: "hls", name: "HLS / LL-HLS", detail: "pull in, serve out" },
			{ icon: "hls", name: "DASH", detail: "serve out" },
			{ icon: "fmp4", name: "fMP4 / CMAF", detail: "in + out" },
			{ icon: "mpegts", name: "MPEG-TS", detail: "in + out" },
		],
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
