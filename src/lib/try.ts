import * as Broadcast from "../../sites/lib/broadcast";
import * as Try from "../../sites/lib/try";

export async function publish() {
	const token = await Try.publish(import.meta.env.PUBLIC_API_URL);
	const broadcast = { project: token.project, name: token.broadcast };
	const url = Broadcast.relay(
		broadcast,
		new URLSearchParams({ jwt: token.publishToken }),
		import.meta.env.PUBLIC_RELAY_URL,
	);
	if (!url) throw new Error("Invalid relay configuration.");
	// The bare path: the watch page mints its own subscribe token, and the
	// publish token would let anyone publish.
	const share = new URL(import.meta.env.PUBLIC_WATCH_URL);
	share.pathname = Broadcast.path(broadcast);
	return { broadcast, url, share: share.toString() };
}

export async function watch() {
	const params = new URLSearchParams(location.search);
	const project = params.get("project");
	const name = params.get("name");
	if (!project || !name) throw new Error("Specify both ?project= and &name= to watch a broadcast.");
	const broadcast = { project, name };
	const credentials = await Try.watch(import.meta.env.PUBLIC_API_URL, broadcast, params);
	const url = Broadcast.relay(broadcast, credentials, import.meta.env.PUBLIC_RELAY_URL);
	if (!url) throw new Error("Invalid relay configuration.");
	return { broadcast, url };
}
