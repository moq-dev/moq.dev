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
// - `image` is a file next to this one, shown beside the title and sub.
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
	image?: string;
	mesh?: boolean;
	// Path under public/ for a page OG card's hand-drawn hero artwork (circular medallion).
	art?: string;
	// Path under public/ for a blog post OG card's cover art (framed 16:10 showcase).
	blogCover?: string;
	// Footer path displayed on per-page OG cards (defaults to `moq.dev`).
	url?: string;
	// Destination path relative to repo root when syncing OG cards via `render.ts --og`.
	ogOut?: string;
};

// Per-page OG cards synced to `public/` via `bun tools/cards/render.ts --og`.
export const OG_CARDS: Card[] = [
	// The site's default og:image: also copy it to moq-dev/moq's doc/public/og.png
	// when the homepage hero changes.
	{
		slug: "og",
		title: "Real-time latency and **massive scale.**",
		sub: "The open standard for streaming live video, audio, and whatever you want.",
		mesh: true,
		ogOut: "public/layout/og.png",
	},
	{
		slug: "og-robotics",
		eyebrow: "use case",
		title: "**Robotics** over MoQ",
		sub: "Stream video, telemetry, and control on terrible networks—cellular, satellite, or mesh radio.",
		art: "icons/use-case/robotics.svg",
		url: "moq.dev/robotics",
		ogOut: "public/og/page/robotics.png",
	},
	{
		slug: "og-distribution",
		eyebrow: "use case",
		title: "**Distribution** at scale",
		sub: "Sub-second live delivery at CDN scale, without giving up HTTP's economics or legacy HLS players.",
		art: "icons/use-case/distribution.svg",
		url: "moq.dev/distribution",
		ogOut: "public/og/page/distribution.png",
	},
	{
		slug: "og-contribution",
		eyebrow: "use case",
		title: "Live **Contribution**",
		sub: "Pull-based contribution, optional on-demand encoding, and failover—replacing RTMP, SRT, and WHIP.",
		art: "icons/use-case/contribution.svg",
		url: "moq.dev/contribution",
		ogOut: "public/og/page/contribution.png",
	},
	{
		slug: "og-ai",
		eyebrow: "use case",
		title: "Voice and **video AI**",
		sub: "Voice agents, faster-than-real-time TTS, instant barge-in, and on-demand inference over MoQ.",
		art: "icons/use-case/voice-video-ai.svg",
		url: "moq.dev/ai",
		ogOut: "public/og/page/ai.png",
	},
	{
		slug: "og-interactive",
		eyebrow: "use case",
		title: "**Interactive** apps",
		sub: "Media down, input up, live discovery, and on-demand encoding—all over one MoQ connection.",
		art: "demo/moqboy.svg",
		url: "moq.dev/interactive",
		ogOut: "public/og/page/interactive.png",
	},
	{
		slug: "og-conferencing",
		eyebrow: "use case",
		title: "**Conferencing**",
		sub: "Browser publish and watch with live room discovery, WebCodecs control, and zero SDP or STUN/TURN.",
		art: "icons/use-case/conferencing.svg",
		url: "moq.dev/conferencing",
		ogOut: "public/og/page/conferencing.png",
	},
	{
		slug: "og-demo",
		eyebrow: "live demos",
		title: "Try **MoQ** live.",
		sub: "Multiplayer Game Boy, CARLA teleoperation, Voice AI, browser publish, and live video in your browser.",
		art: "demo/moqboy.svg",
		url: "moq.dev/demo",
		ogOut: "public/og/page/demo.png",
	},
	{
		slug: "og-boy",
		eyebrow: "live demo",
		title: "**MoQ Boy**",
		sub: "Multiplayer Game Boy emulation on a remote server, using MoQ tracks for everything.",
		art: "demo/moqboy.svg",
		url: "moq.dev/boy",
		ogOut: "public/og/page/boy.png",
	},
	{
		slug: "og-carla",
		eyebrow: "live demo",
		title: "**CARLA** over MoQ",
		sub: "Steer simulated vehicles in CARLA over MoQ—cameras on demand, controls and telemetry on one link.",
		art: "demo/carla.svg",
		url: "moq.dev/carla",
		ogOut: "public/og/page/carla.png",
	},
	{
		slug: "og-voice",
		eyebrow: "live demo",
		title: "**Voice AI**",
		sub: "Talk to a Pipecat voice agent over MoQ with faster-than-real-time reply and instant barge-in.",
		art: "voice/ai.svg",
		url: "moq.dev/voice",
		ogOut: "public/og/page/voice.png",
	},
	{
		slug: "og-publish",
		eyebrow: "live demo",
		title: "**Publish** live",
		sub: "Go live from your browser—share your camera, mic, or screen over MoQ with a private watch link.",
		art: "icons/use-case/contribution.svg",
		url: "moq.dev/publish",
		ogOut: "public/og/page/publish.png",
	},
	{
		slug: "og-watch",
		eyebrow: "live demo",
		title: "**Watch** live",
		sub: "Watch a live broadcast over Media over QUIC using WebTransport and WebCodecs.",
		art: "demo/bunny.svg",
		url: "moq.dev/watch",
		ogOut: "public/og/page/watch.png",
	},
	{
		slug: "og-blog",
		eyebrow: "engineering",
		title: "Media over QUIC **Blog**",
		sub: "Deep dives on MoQ, QUIC transport, congestion control, and building real-time media at scale.",
		art: "blog/open-for-business/viewers-1.svg",
		url: "moq.dev/blog",
		ogOut: "public/og/page/blog.png",
	},
	{
		slug: "og-source",
		eyebrow: "MIT / Apache 2.0",
		title: "**Open Source**",
		sub: "Open-source Media over QUIC libraries, relays, CLI, and demos in Rust, TypeScript, and FFI bindings.",
		art: "layout/github-icon.svg",
		url: "moq.dev/source",
		ogOut: "public/og/page/source.png",
	},
	{
		slug: "og-issues",
		eyebrow: "roadmap",
		title: "Known **Issues**",
		sub: "Current limitations and open engineering work across the Media over QUIC stack.",
		art: "issues/warning.svg",
		url: "moq.dev/issues",
		ogOut: "public/og/page/issues.png",
	},
	{
		slug: "og-huh",
		eyebrow: "explainer",
		title: "**Huh?**",
		sub: "An interactive explainer of how Media over QUIC works.",
		art: "huh/cat-huh.svg",
		url: "moq.dev/huh",
		ogOut: "public/og/page/huh.png",
	},
];

export const CARDS: Card[] = [
	...OG_CARDS,
	{
		slug: "install",
		eyebrow: "moq-cli 0.14",
		title: "Install moq in **one line**.",
		sub: "The latest `moq` for macOS and Linux. Run it again to upgrade. On Windows, `winget install moq-dev.moq`.",
		code: "$ curl -fsSL https://moq.sh | sh",
		note: "yes you can read it first",
	},
	{
		slug: "e2ee",
		eyebrow: "new crate: moq-e2ee 0.0.1",
		title: "End-to-end **encrypted** media.",
		sub: "Don't let your CDN spy on you. Relays route what they can't read: the media, and even the names.",
		tiles: [
			{ icon: "lock", name: "Payloads", detail: "AES-128-GCM on every frame" },
			{ icon: "hidden", name: "Hidden names", detail: "opaque broadcast and track paths" },
			{ icon: "key", name: "Keys", detail: "never reach the relay" },
		],
		note: "stream your dong with a clear conscience",
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
		note: "donate tokens to make it faster",
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
		note: "noq moq noq moq noq moq",
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
		note: "smaller than your hand-rolled protobuf btw",
	},
	{
		slug: "flate",
		eyebrow: "moq-flate 0.2",
		title: "DEFLATE **across frames**.",
		sub: "Each group is one raw DEFLATE stream, sync-flushed per frame. Every frame stays self-delimited, but reuses earlier frames as its dictionary, so deltas, repeated records, and log lines shrink to a few bytes.",
		tiles: [
			{ name: "Per group", detail: "a fresh window, so late joiners can decode" },
			{ name: "Interop", detail: "zlib sync flush or the browser's `deflate-raw`" },
			{ name: "4 bytes off", detail: "the fixed `00 00 ff ff` trailer is dropped" },
			{ name: "Built in", detail: "`moq-json` and `moq-binary` use it" },
		],
		note: "just like I delta compressed your mom last night",
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
		note: "secure ur nudes",
	},
	{
		slug: "play",
		eyebrow: "moq-cli 0.12",
		title: "Watch without **a browser**.",
		sub: "`moq play` decodes H.264, H.265, AV1, Opus, and AAC with the platform's hardware decoder, into a native window synced to the speaker.",
		code: "$ moq --connect https://cdn.moq.pro/demo --broadcast bbb.hang play",
		image: "bbb.jpg",
		note: "watch the bunny boye",
	},
	{
		slug: "lan",
		eyebrow: "moq-cli 0.12",
		title: "Mesh the LAN with **zero config**.",
		sub: "`--cluster-lan` meshes every MoQ process on the network over mDNS. Add `--connect` and each viewer takes the shortest path: peer-to-peer on the LAN, the CDN otherwise.",
		code: [
			"$ moq --cluster-lan --connect cdn.moq.pro --broadcast cam.hang import capture  # camera",
			"$ moq --cluster-lan --broadcast cam.hang play                                  # LAN: peer-to-peer",
			"$ moq --connect cdn.moq.pro --broadcast cam.hang play                          # elsewhere: CDN",
		].join("\n"),
		note: "there's no place like home",
	},
	{
		slug: "media",
		eyebrow: "moq-video + moq-audio",
		title: "Native media, **no ffmpeg**.",
		sub: "Hardware capture, encoding, decoding, and rendering for every platform.",
		tiles: [
			{ icon: "rocket", name: "Zero-copy", detail: "GPU in, GPU out" },
			{ icon: "apple", name: "macOS", detail: "VideoToolbox" },
			{ icon: "windows", name: "Windows", detail: "Media Foundation" },
			{ icon: "nvidia", name: "NVIDIA", detail: "NVENC + NVDEC" },
			{ icon: "amd", name: "AMD", detail: "VAAPI" },
			{ icon: "intel", name: "Intel", detail: "VAAPI" },
			{ icon: "linux", name: "Linux", detail: "V4L2, PipeWire" },
			{ icon: "android", name: "Android", detail: "MediaCodec" },
		],
		note: "yes I just told claude to rewrite in Rust",
	},
	{
		slug: "languages",
		eyebrow: "8 languages, 1 wire",
		title: "MoQ in **your language**.",
		sub: "Native Rust and TypeScript support. Rust FFI for everything else.",
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
		note: "but you should be using Rust u dinosaur",
	},
	{
		slug: "gateway",
		eyebrow: "moq-cli 0.12",
		title: "Bridge **every protocol**.",
		sub: "`moq import` and `moq export`: migrate your legacy protocols one at a time.",
		tiles: [
			{ icon: "rtmp", name: "RTMP", detail: "OBS in, restream out" },
			{ icon: "srt", name: "SRT", detail: "caller or listener" },
			{ icon: "webrtc", name: "WebRTC", detail: "WHIP + WHEP, both ways" },
			{ icon: "hls", name: "HLS / LL-HLS", detail: "pull in, serve LL-HLS" },
			{ icon: "hls", name: "DASH", detail: "serve any DASH player" },
			{ icon: "fmp4", name: "fMP4 / CMAF", detail: "files, pipes, segments" },
			{ icon: "mpegts", name: "MPEG-TS", detail: "broadcast gear, in + out" },
			{ icon: "puzzle", name: "Other", detail: "FLV, WebM, Annex-B" },
		],
		note: "delete ur legacy crap",
	},
	{
		slug: "drain",
		eyebrow: "moq-relay 0.16",
		title: "Restart relays, **drop nobody**.",
		sub: "On `SIGTERM` the relay sends every session a GOAWAY, and viewers reconnect elsewhere before the window closes. A second signal force-closes.",
		code: [
			"$ moq-relay --drain-timeout 10s",
			"$ kill -TERM $(pidof moq-relay)   # every viewer migrates, nobody buffers",
		].join("\n"),
		note: "GOAWAY mom, i'm making a network protocol",
	},
	{
		slug: "obs",
		eyebrow: "obs-moq + moq-gst",
		title: "MoQ in **OBS** and GStreamer.",
		sub: "A plugin for stock OBS Studio that publishes and subscribes, plus `moqsink` and `moqsrc` for any GStreamer pipeline.",
		tiles: [
			{ name: "OBS Studio", detail: "no OBS rebuild needed" },
			{ name: "GStreamer", detail: "`moqsink` + `moqsrc`" },
			{ name: "apt", detail: "`gstreamer1.0-moq`" },
			{ name: "dnf", detail: "`gstreamer1-moq`" },
		],
	},
];
