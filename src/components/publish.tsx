import { createSignal } from "solid-js";
import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";

import "@moq/publish/support/element";
import "@moq/publish/element";
import "@moq/publish/ui";
import { Lite } from "@moq/publish";

export default function Publish() {
	const name = uniqueNamesGenerator({ dictionaries: [adjectives, animals], separator: "-" });
	const url = new URL("/anon", import.meta.env.PUBLIC_RELAY_URL);
	const [copied, setCopied] = createSignal(false);

	const shareUrl = `${window.location.origin}/watch?name=${name}`;

	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<div>
			<div class="mb-8 flex items-center gap-3">
				<div>
					<h3 class="inline">Broadcast:</h3>{" "}
					<a href={`/watch?name=${name}`} rel="noreferrer" target="_blank" class="ml-2 text-2xl">
						{name}
					</a>
				</div>
				<button
					type="button"
					onClick={copyToClipboard}
					class="flex items-center gap-1 rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
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
				<moq-publish prop:url={url} prop:name={Lite.Path.from(name)} prop:source="camera">
					<video
						style={{ "max-width": "100%", height: "100%", margin: "0 auto", "border-radius": "1rem" }}
						autoplay
						muted
					/>
				</moq-publish>
			</moq-publish-ui>

			<moq-publish-support prop:show="always" />
		</div>
	);
}
