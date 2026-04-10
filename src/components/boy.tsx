import "@moq/boy/element";
import "@moq/watch/support/element";

export default function Boy() {
	const url = new URL("/demo", import.meta.env.PUBLIC_RELAY_URL);

	return (
		<>
			<moq-boy prop:url={url} prefix-game="boy" prefix-viewer="viewer/boy" />
			<moq-watch-support prop:show="always" />
		</>
	);
}
