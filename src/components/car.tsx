import "@moq/demo-carla/element";
import { assets } from "@moq/watch";
import "@moq/watch/support/element";

assets("/assets/");

export default function Car() {
	const url = new URL("/demo", import.meta.env.PUBLIC_RELAY_URL);

	return (
		<>
			<moq-carla prop:url={url} />
			<moq-watch-support prop:show="always" />
		</>
	);
}
