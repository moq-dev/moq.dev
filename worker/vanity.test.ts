import { describe, expect, test } from "bun:test";
import { vanity } from "./vanity";

const goGet = (path: string) => vanity(new URL(`https://moq.dev${path}?go-get=1`));

describe("vanity", () => {
	test("points the go command at the mirror", async () => {
		const res = goGet("/moq");
		expect(res?.status).toBe(200);
		expect(await res?.text()).toContain(
			`<meta name="go-import" content="moq.dev/moq git https://github.com/moq-dev/moq-go">`,
		);
	});

	test("claims a package directory for its module", async () => {
		// The go command asks about the full import path, so the prefix in the tag
		// has to stay the module path rather than what was requested.
		const res = goGet("/moq-ffi/moq");
		expect(await res?.text()).toContain(
			`<meta name="go-import" content="moq.dev/moq-ffi git https://github.com/moq-dev/moq-go-ffi">`,
		);
	});

	test("keeps modules with a shared prefix apart", async () => {
		expect(await goGet("/moq-ffi")?.text()).toContain("moq-go-ffi");
		expect(await goGet("/moq")?.text()).not.toContain("moq-go-ffi");
	});

	test("sends people to the docs", () => {
		const res = vanity(new URL("https://moq.dev/moq/subpkg"));
		expect(res?.status).toBe(302);
		expect(res?.headers.get("location")).toBe("https://pkg.go.dev/moq.dev/moq/subpkg");
	});

	test("ignores everything else", () => {
		for (const path of ["/", "/blog", "/moqadillo", "/de/moq"]) {
			expect(vanity(new URL(`https://moq.dev${path}?go-get=1`))).toBeUndefined();
		}
	});
});
