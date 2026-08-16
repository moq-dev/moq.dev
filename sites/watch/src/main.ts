// moq.watch — play the broadcast named by the path, e.g. /demo/bbb.hang.
//
// Everything that isn't part of the broadcast's identity stays in the query:
//   ?relay=<url>          Relay server URL (default: the relay this site was built for)
//   ?cloudflare=<label>  Shorthand for <label>.cloudflare.mediaoverquic.com
//   ?jwt=<token>          Appended to the relay URL as ?jwt=<token>
import "@moq/watch/element";
import "@moq/watch/ui";

import * as Broadcast from "../../lib/broadcast";

const DEFAULT_RELAY = import.meta.env.PUBLIC_RELAY_URL ?? "https://cdn.moq.pro";

const broadcast = Broadcast.parse(location.pathname);
if (broadcast) {
	mount(broadcast);
} else {
	usage();
}

function mount(broadcast: Broadcast.Broadcast) {
	const params = new URLSearchParams(location.search);
	const relay = Broadcast.relay(broadcast, params, DEFAULT_RELAY);
	if (!relay) {
		document.body.textContent = "Invalid relay configuration.";
		return;
	}

	const watch = document.createElement("moq-watch");
	watch.setAttribute("url", relay.toString());
	watch.setAttribute("name", broadcast.name);
	watch.setAttribute("reload", "");
	watch.appendChild(document.createElement("canvas"));

	const ui = document.createElement("moq-watch-ui");
	ui.appendChild(watch);

	document.body.appendChild(ui);
}

// Nothing in the path to watch, so say what one looks like.
function usage() {
	document.body.innerHTML = `
		<div class="message">
			<div class="brand">
				<img class="logo" src="/logo.svg" alt="moq" />
				<img class="wordmark" src="/wordmark.svg" alt="watch" />
			</div>
			<p>Watch a <a href="https://moq.dev/">Media over QUIC</a> broadcast.</p>
			<p>Put the project and broadcast in the path:<br />
			<a href="/demo/bbb.hang"><code>/demo/bbb.hang</code></a></p>
			<p>Publish your own at <a href="https://moq.pub/">moq.pub</a>, then watch
			it back at the same path here.</p>
			<p>Optional:<br />
			<code>?relay=https://cdn.moq.pro</code> &nbsp;
			<code>?cloudflare=draft-16</code> &nbsp;
			<code>?jwt=&lt;token&gt;</code></p>
		</div>`;
}
