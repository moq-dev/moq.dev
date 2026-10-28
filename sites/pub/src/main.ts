// Publish an explicit broadcast, or mint a private try broadcast on a bare URL.
import "@moq/publish/element";
import "@moq/publish/ui";

import * as Broadcast from "../../lib/broadcast";
import * as Try from "../../lib/try";

const DEFAULT_RELAY = import.meta.env.PUBLIC_RELAY_URL ?? "https://cdn.moq.pro";

void start().catch((error) => {
	document.body.textContent = error.message;
});

async function start() {
	const params = new URLSearchParams(location.search);
	const broadcast = Broadcast.parse(location.pathname);
	if (broadcast) return mount(broadcast, params);
	if (location.pathname !== "/" || [...params.keys()].some((key) => key !== "source")) {
		document.body.textContent = "Specify /<project>/<broadcast>, or open moq.pub/ to start a private broadcast.";
		return;
	}
	document.body.textContent = "Creating a private broadcast…";
	const token = await Try.publish(import.meta.env.PUBLIC_API_URL);
	const created = { project: token.project, name: token.broadcast };
	params.set("jwt", token.publishToken);
	// Reloads retain the credential, while sharing only the path grants watch access.
	history.replaceState(null, "", `${Broadcast.path(created)}?${params}`);
	document.body.textContent = "";
	mount(created, params);
}

function mount(broadcast: Broadcast.Broadcast, params: URLSearchParams) {
	const relay = Broadcast.relay(broadcast, params, DEFAULT_RELAY);
	if (!relay) {
		document.body.textContent = "Invalid relay configuration.";
		return;
	}

	const publish = document.createElement("moq-publish");
	publish.setAttribute("url", relay.toString());
	publish.setAttribute("name", broadcast.name);

	// Optional: preselect a source (camera/screen/file). Otherwise the UI lets
	// the user pick one before anything is published.
	const source = params.get("source");
	if (source) publish.setAttribute("source", source);

	const video = document.createElement("video");
	video.muted = true;
	video.autoplay = true;
	video.setAttribute("playsinline", "");
	publish.appendChild(video);

	const ui = document.createElement("moq-publish-ui");
	ui.appendChild(publish);

	// Only here does moq.watch mint its own subscribe token. Share the bare path:
	// this page's ?jwt= is a publish token, and would let anyone publish.
	if (broadcast.project === "try" && !params.has("relay") && !params.has("cloudflare")) {
		const share = new URL(import.meta.env.PUBLIC_WATCH_URL);
		share.pathname = Broadcast.path(broadcast);
		const link = document.createElement("a");
		link.href = share.toString();
		link.referrerPolicy = "no-referrer";
		link.textContent = "Watch link (share this)";
		document.body.appendChild(link);
	}
	document.body.appendChild(ui);
}
