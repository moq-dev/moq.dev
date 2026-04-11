import "@moq/watch/support/element";
import "@moq/watch/element";
import "@moq/watch/ui";
import { Lite } from "@moq/watch";

export default function Watch() {
	const params = new URLSearchParams(window.location.search);
	const name = params.get("name") ?? "bbb";

	let url: URL;
	const token = import.meta.env.PUBLIC_RELAY_TOKEN;
	if (name === "bbb" && token) {
		url = new URL(`/demo?jwt=${token}`, import.meta.env.PUBLIC_RELAY_URL);
	} else {
		url = new URL("/anon", import.meta.env.PUBLIC_RELAY_URL);
	}

	return (
		<>
			<div class="mb-8">
				<h3 class="inline">Broadcast:</h3>{" "}
				<a href={`/watch?name=${name}`} class="ml-2 text-2xl">
					{name}
				</a>
			</div>
			<moq-watch-ui>
				<moq-watch prop:url={url} prop:name={Lite.Path.from(name)} prop:muted={true} prop:reload={true}>
					<canvas style={{ "max-width": "100%", height: "auto", margin: "0 auto", "border-radius": "1rem" }} />
				</moq-watch>
			</moq-watch-ui>

			<moq-watch-support prop:show="always" />
		</>
	);
}
