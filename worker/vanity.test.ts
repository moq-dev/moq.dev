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
		expect(await res?.text()).toContain(`<meta name="go-import" content="moq.dev/moq-ffi mod https://go.moq.dev">`);
	});

	test("links source only for a module in a repo", async () => {
		expect(await goGet("/moq")?.text()).toContain(`<meta name="go-source"`);
		expect(await goGet("/moq-ffi")?.text()).not.toContain(`<meta name="go-source"`);
	});

	test("keeps modules with a shared prefix apart", async () => {
		expect(await goGet("/moq-ffi")?.text()).toContain("go.moq.dev");
		expect(await goGet("/moq")?.text()).not.toContain("go.moq.dev");
	});

	test("sends people to the docs", () => {
		const res = vanity(new URL("https://moq.dev/moq/subpkg"));
		expect(res?.status).toBe(302);
		expect(res?.headers.get("location")).toBe("https://pkg.go.dev/moq.dev/moq/subpkg");
	});

	test("ignores everything else", () => {
		for (const path of ["/", "/blog", "/moqadillo"]) {
			expect(vanity(new URL(`https://moq.dev${path}?go-get=1`))).toBeUndefined();
		}
	});
});
