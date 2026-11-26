// Section 4's broadcast: the tracks one publisher offers, the hang catalog that lists them, and what a viewer's pulls
// cost the publisher's uplink. Nothing is sent, or encoded, for a track nobody pulls.

export type Kind = "video" | "audio" | "text" | "data" | "camera";

export interface Track {
	name: string; // the track name a viewer subscribes to
	kind: Kind;
	kbps: number; // while someone pulls it
	detail: string;
	// Where the subscription actually goes, when not to a track of that name in BROADCAST.
	route?: Route;
}

export interface Route {
	broadcast: string;
	track: string;
}

// The broadcast the catalog is served from, and the second camera's sibling broadcast that it lists.
export const BROADCAST = "studio/front.hang";
export const REAR = "rear.hang"; // as the catalog lists it, relative to BROADCAST
export const REAR_PATH = "studio/rear.hang";

export const TRACKS: readonly Track[] = [
	{ name: "video/1080p", kind: "video", kbps: 4500, detail: "H.264 1920×1080" },
	{ name: "video/480p", kind: "video", kbps: 900, detail: "H.264 854×480" },
	{
		name: "rear",
		kind: "camera",
		kbps: 2500,
		detail: "second camera, its own broadcast",
		// A rendition from the rear camera's own catalog.
		route: { broadcast: REAR_PATH, track: "video/720p" },
	},
	{ name: "audio", kind: "audio", kbps: 128, detail: "Opus stereo" },
	{ name: "captions", kind: "text", kbps: 2, detail: "WebVTT, English" },
	{ name: "controls.json", kind: "data", kbps: 8, detail: "your app's own JSON" },
];

// The broadcast and track a subscription to `t` names.
export function route(t: Track): Route {
	return t.route ?? { broadcast: BROADCAST, track: t.name };
}

// What a few kinds of viewer pull.
export const PRESETS: readonly { name: string; pulls: readonly string[] }[] = [
	{ name: "TV", pulls: ["video/1080p", "audio", "captions"] },
	{ name: "Phone", pulls: ["video/480p", "audio"] },
	{ name: "Both cameras", pulls: ["video/1080p", "rear", "audio"] },
	{ name: "Audio only", pulls: ["audio"] },
	{ name: "Bot", pulls: ["controls.json"] },
	{ name: "Nobody", pulls: [] },
];

// The publisher's uplink in kbps: only what is pulled. The catalog itself is a few hundred bytes, sent once.
export function uplink(pulled: ReadonlySet<string>): number {
	return TRACKS.reduce((n, t) => n + (pulled.has(t.name) ? t.kbps : 0), 0);
}

// What pushing every track regardless of demand would cost.
export const PUSH_ALL = TRACKS.reduce((n, t) => n + t.kbps, 0);

export interface Line {
	text: string;
	track?: string; // the track this line lists
}

// The catalog.json a viewer reads, as hang (draft-lcurley-moq-hang) lays it out, one track per line so the view can
// light up what's pulled.
export function catalog(): Line[] {
	const section = (key: string, inner: string | undefined, entries: [string, object][], last = false): Line[] => {
		const indent = inner ? "      " : "    ";
		const lines: Line[] = [{ text: `  ${JSON.stringify(key)}: {` }];
		if (inner) lines.push({ text: `    ${JSON.stringify(inner)}: {` });
		entries.forEach(([track, value], i) => {
			const comma = i < entries.length - 1 ? "," : "";
			// One line per entry, spaced so it wraps on a narrow screen.
			const json = JSON.stringify(value, null, 1).replace(/\n\s*/g, " ");
			lines.push({ text: `${indent}${JSON.stringify(track)}: ${json}${comma}`, track });
		});
		if (inner) lines.push({ text: "    }" });
		lines.push({ text: `  }${last ? "" : ","}` });
		return lines;
	};
	const legacy = { kind: "legacy" };
	return [
		{ text: "{" },
		...section("video", "renditions", [
			["video/1080p", { codec: "avc1.640028", bitrate: 4_500_000, container: legacy }],
			["video/480p", { codec: "avc1.64001e", bitrate: 900_000, container: legacy }],
		]),
		...section("audio", "renditions", [
			["audio", { codec: "opus", sampleRate: 48000, numberOfChannels: 2, container: legacy }],
		]),
		...section("text", "renditions", [["captions", { format: "vtt", lang: "en", container: legacy }]]),
		...section("json", "tracks", [["controls.json", { mode: "snapshot" }]]),
		...section("contributions", undefined, [["rear", { broadcast: REAR }]], true),
		{ text: "}" },
	];
}

// A stand-in for the opaque name moq-e2ee derives from a track name, so the relay can route it without learning it.
// Real names come from the credential and the publisher's epoch; this only needs to look the part and stay stable.
export function opaque(name: string): string {
	// FNV-1a.
	let h = 0x811c9dc5;
	for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
	const hex = h.toString(16).padStart(8, "0");
	return `${hex.slice(0, 4)}…${hex.slice(4)}`;
}
