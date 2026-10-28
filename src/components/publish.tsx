import { createResource, createSignal, ErrorBoundary, Show } from "solid-js";
import * as Try from "@/lib/try";

import "@moq/publish/support/element";
import "@moq/publish/element";
import "@moq/publish/ui";
import { assets, Net } from "@moq/publish";

// Load the worklets the build emits to /assets/ rather than blob: URLs.
assets("/assets/");

export default function Publish() {
	const [session] = createResource(Try.publish);
	const [copied, setCopied] = createSignal(false);

	const copyToClipboard = async (share: string) => {
		try {
			await navigator.clipboard.writeText(share);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<ErrorBoundary fallback={(error) => <p role="alert">{String(error)}</p>}>
			<div>
				<Show when={session()} fallback={<p>Creating a private broadcast…</p>}>
					{(current) => (
						<>
							<div class="mb-8 flex items-center gap-3">
								<div>
									<h3 class="inline">Broadcast:</h3>{" "}
									<a href={current().share} rel="noreferrer" target="_blank" class="ml-2 text-2xl">
										{current().broadcast.name}
									</a>
								</div>
								<button
									type="button"
									onClick={() => void copyToClipboard(current().share)}
									class="flex items-center gap-1 rounded-sm bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
									title="Copy share URL"
								>
									{copied() ? (
										<>
											<span>✓</span>
											<span>Copied</span>
										</>
									) : (
										<>
											<span>📋</span>
											<span>Copy URL</span>
										</>
									)}
								</button>
							</div>

							<moq-publish-ui>
								<moq-publish
									prop:url={current().url}
									prop:name={Net.Path.from(current().broadcast.name)}
									prop:source="camera"
								>
									<video
										style={{ "max-width": "100%", height: "100%", margin: "0 auto", "border-radius": "1rem" }}
										autoplay
										muted
									/>
								</moq-publish>
							</moq-publish-ui>
						</>
					)}
				</Show>
				<moq-publish-support prop:show="always" />
			</div>
		</ErrorBoundary>
	);
}
