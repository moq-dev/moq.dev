import "@moq/boy/element";
import { assets } from "@moq/watch";
import "@moq/watch/support/element";

// Load the worklets the build emits to /assets/ rather than blob: URLs.
assets("/assets/");

export default function Boy() {
	const url = new URL("/demo", import.meta.env.PUBLIC_RELAY_URL);

	return (
		<>
			<moq-boy prop:url={url} prefix-game="boy" prefix-viewer="viewer/boy" />
			<moq-watch-support prop:show="always" />
		</>
	);
}
