import { describe, expect, test } from "bun:test";
import { relay } from "./broadcast";

const broadcast = { project: "cloudflare-token", name: "room/camera.hang" };
const fallback = "https://cdn.moq.pro";

describe("relay", () => {
	test("uses the default relay", () => {
		expect(relay(broadcast, new URLSearchParams(), fallback)?.toString()).toBe("https://cdn.moq.pro/cloudflare-token");
	});

	test("builds a Cloudflare relay from one subdomain label", () => {
		const params = new URLSearchParams({ cloudflare: "draft-16" });
		expect(relay(broadcast, params, fallback)?.toString()).toBe(
			"https://draft-16.cloudflare.mediaoverquic.com/cloudflare-token",
		);
	});

	test("rejects malformed Cloudflare labels", () => {
		for (const value of ["", "Draft-16", ".draft-16", "draft-16.example", "-draft-16", "draft-16-"]) {
			expect(relay(broadcast, new URLSearchParams({ cloudflare: value }), fallback)).toBeUndefined();
		}
	});

	test("rejects conflicting relay selectors", () => {
		const params = new URLSearchParams({ cloudflare: "draft-16", relay: "relay.example.com" });
		expect(relay(broadcast, params, fallback)).toBeUndefined();
	});

	test("preserves explicit relay and JWT support", () => {
		const params = new URLSearchParams({ relay: "http://localhost:4443/base", jwt: "token" });
		expect(relay(broadcast, params, fallback)?.toString()).toBe(
			"http://localhost:4443/base/cloudflare-token?jwt=token",
		);
	});
});
