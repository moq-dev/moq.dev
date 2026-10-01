import { createResource, ErrorBoundary, Show } from "solid-js";
import * as Try from "@/lib/try";
import "@moq/watch/support/element";
import "@moq/watch/element";
import "@moq/watch/ui";
import { Net } from "@moq/watch";

export default function Watch() {
	const [session] = createResource(Try.watch);

	return (
		<ErrorBoundary
			fallback={(error) => (
				<p role="alert">
					{String(error)} <a href="/watch?project=demo&name=bbb.hang">Watch Big Buck Bunny</a>
				</p>
			)}
		>
			<Show when={session()}>
				{(current) => (
					<>
						<div class="mb-8">
							<h3 class="inline">Broadcast:</h3>{" "}
							<a href={location.href} class="ml-2 text-2xl">
								{current().broadcast.name}
							</a>
						</div>
						<moq-watch-ui>
							<moq-watch
								prop:url={current().url}
								prop:name={Net.Path.from(current().broadcast.name)}
								prop:muted={true}
								prop:reload={true}
								// The default "real-time" sizes the buffer from RTT alone, too small for relay jitter.
								prop:latency={Net.Time.Milli(100)}
							>
								<canvas style={{ "max-width": "100%", height: "auto", margin: "0 auto", "border-radius": "1rem" }} />
							</moq-watch>
						</moq-watch-ui>
					</>
				)}
			</Show>
			<moq-watch-support prop:show="always" />
		</ErrorBoundary>
	);
}
