import { describe, expect, test } from "bun:test";
import { RootSchema } from "@moq/hang/catalog";
import { catalog, opaque, PRESETS, PUSH_ALL, REAR, TRACKS, uplink } from "./rack";

describe("catalog", () => {
	const lines = catalog();
	const json = JSON.parse(lines.map((l) => l.text).join("\n"));

	test("is a catalog the real hang reader accepts", () => {
		const parsed = RootSchema.parse(json);
		expect(Object.keys(parsed.video?.renditions ?? {})).toEqual(["video/1080p", "video/480p"]);
		expect(parsed.contributions?.rear.broadcast as string).toBe(REAR);
	});

	test("lists every track on exactly one line, tagged with it", () => {
		for (const t of TRACKS) {
			const tagged = lines.filter((l) => l.track === t.name);
			expect(tagged).toHaveLength(1);
			expect(tagged[0].text).toContain(JSON.stringify(t.name));
		}
		expect(lines.filter((l) => l.track).length).toBe(TRACKS.length);
	});
});

describe("uplink", () => {
	test("costs nothing when nobody pulls", () => {
		expect(uplink(new Set())).toBe(0);
	});

	test("counts only the pulled tracks", () => {
		expect(uplink(new Set(["audio", "video/480p"]))).toBe(128 + 900);
		expect(uplink(new Set(TRACKS.map((t) => t.name)))).toBe(PUSH_ALL);
	});

	test("every preset names real tracks", () => {
		const names = new Set(TRACKS.map((t) => t.name));
		for (const p of PRESETS) for (const name of p.pulls) expect(names.has(name)).toBe(true);
	});
});

describe("opaque", () => {
	test("is stable and hides the name", () => {
		expect(opaque("audio")).toBe(opaque("audio"));
		expect(opaque("audio")).not.toBe(opaque("video/480p"));
		expect(opaque("audio")).not.toContain("audio");
	});
});
