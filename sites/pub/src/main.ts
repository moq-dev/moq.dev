// moq.pub — publish the broadcast named by the path, e.g. /anon/lazy-otter-4f21.hang.
//
// The Worker redirects anything else to a broadcast path, inventing a name when
// the URL doesn't carry one, so this page always loads on the shareable URL.
//
// Everything that isn't part of the broadcast's identity stays in the query:
//   ?relay=<url>    Relay server URL (default: the relay this site was built for)
//   ?jwt=<token>    Appended to the relay URL as ?jwt=<token>
//   ?viewer=<token> A subscribe-only token to put in the moq.watch link. Kept
//                   separate from ?jwt= on purpose: see Broadcast.watch.
//   ?source=<kind>  Preselect a capture source: camera, screen, or file
import "@moq/publish/element";
import "@moq/publish/ui";

import * as Broadcast from "../../lib/broadcast";

const DEFAULT_RELAY = import.meta.env.PUBLIC_RELAY_URL ?? "https://cdn.moq.pro";
const WATCH_URL = import.meta.env.PUBLIC_WATCH_URL ?? "https://moq.watch";

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

	// The same path on moq.watch plays this broadcast back.
	const share = document.createElement("a");
	share.className = "share";
	share.target = "_blank";
	share.rel = "noreferrer";
	share.href = Broadcast.watch(broadcast, params, WATCH_URL).toString();
	share.textContent = share.href.replace(/^https?:\/\//, "");

	document.body.appendChild(share);

	// Publishing against a token but with no viewer token to hand out: the link
	// above reaches the right relay but won't authenticate, so say so rather than
	// let it look like a working share link.
	if (params.get("jwt") && !params.get("viewer")) {
		const note = document.createElement("p");
		note.className = "note";
		note.textContent = "Viewers need their own token — pass one as ?viewer= to include it here.";
		document.body.appendChild(note);
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

	document.body.appendChild(ui);
}
