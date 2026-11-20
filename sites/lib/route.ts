/** Move legacy links into the explicit /<project>/<broadcast> URL scheme. */
import * as Broadcast from "./broadcast";

export function redirect(url: URL): string | undefined {
	if (Broadcast.parse(url.pathname)) return undefined;
	const params = new URLSearchParams(url.search);
	const project = params.get("project");
	const name = params.get("name");
	if (!project || !name) return undefined;
	params.delete("name");
	params.delete("project");
	const query = params.toString();
	return Broadcast.path({ project, name }) + (query ? `?${query}` : "");
}
