// moq.pub — publish the broadcast named by the path, e.g. /anon/lazy-otter-4f21.hang.
//
// The Worker redirects anything else to a broadcast path, inventing a name when
// the URL doesn't carry one, so this page always loads on the shareable URL.
//
// Everything that isn't part of the broadcast's identity stays in the query:
//   ?relay=<url>    Relay server URL (default: the relay this site was built for)
//   ?jwt=<token>    Appended to the relay URL as ?jwt=<token>
//   ?source=<kind>  Preselect a capture source: camera, screen, or file
import "@moq/publish/element";
import "@moq/publish/ui";

import * as Broadcast from "../../lib/broadcast";

const DEFAULT_RELAY = import.meta.env.PUBLIC_RELAY_URL ?? "https://cdn.moq.pro";

const broadcast = Broadcast.parse(location.pathname);
if (broadcast) {
	mount(broadcast);
} else {
	// Shouldn't happen, since the Worker redirects everything else here. Bounce
	// off the root and let it invent a name rather than show a blank page.
	location.replace("/");
}

function mount(broadcast: Broadcast.Broadcast) {
	const params = new URLSearchParams(location.search);
	const relay = Broadcast.relay(broadcast, params, DEFAULT_RELAY);

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

	document.body.appendChild(ui);
}
