import { expect, test } from "bun:test";
import { redirect } from "./route";

test("legacy links require an explicit project and broadcast", () => {
	for (const path of ["/", "/?name=bbb.hang", "/?project=demo", "/?name=x&project=", "/try/0123456789.hang"]) {
		expect(redirect(new URL(path, "https://moq.pub"))).toBeUndefined();
	}
});

test("explicit legacy links preserve credentials and relay selection", () => {
	expect(redirect(new URL("https://moq.watch/?project=demo&name=bbb.hang&jwt=token&source=camera"))).toBe(
		"/demo/bbb.hang?jwt=token&source=camera",
	);
});
