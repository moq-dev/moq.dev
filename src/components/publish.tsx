import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import { createSignal } from "solid-js";

import "@kixelated/hang/support/element";
import "@kixelated/hang/publish/element";

export default function () {
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
			<hang-support prop:mode="publish" prop:show="partial" />

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

			<hang-publish
				prop:url={url}
				prop:name={name}
				prop:controls={true}
				prop:video={true}
				prop:audio={true}
				prop:captions={true}
			>
				<video
					style={{ "max-width": "100%", height: "100%", margin: "0 auto", "border-radius": "1rem" }}
					autoplay
					muted
				/>
			</hang-publish>

			<h3>Features:</h3>
			<ul>
				<li>
					🔓 <strong>Open Source</strong>: <a href="/source">Typescript and Rust libraries</a>; this demo is{" "}
					<a href="https://github.com/moq-dev/moq/blob/main/js/hang-demo/src/publish.html">here</a>.
				</li>
				<li>
					🌐 <strong>100% Web</strong>: WebTransport, WebCodecs, WebAudio, WebWorkers, WebEtc.
				</li>
				<li>
					🎬 <strong>Modern Codecs</strong>: Supports AV1, H.265, H.264, VP9, Opus, AAC, etc.
				</li>
				<li>
					💬 <strong>Automatic Captions</strong>: Generated{" "}
					<a href="https://huggingface.co/docs/transformers.js/en/index">in-browser</a> using WebGPU and{" "}
					<a href="https://github.com/openai/whisper">Whisper</a>.
				</li>
				<li>
					⚡ <strong>Real-Time</strong>: Minimal latency by skipping unimportant media during congestion.
				</li>
				<li>
					🚀 <strong>Massive Scale</strong>: Everything is deduplicated and distributed across a global CDN.
				</li>
				<li>
					💪 <strong>Efficient</strong>: No encoding or bandwidth usage until a viewer needs it.
				</li>
				<li>
					🔧 <strong>Compatible</strong>: TCP fallback via{" "}
					<a href="https://github.com/moq-dev/web-transport/tree/main/web-transport-ws">WebSocket</a>, Safari fallback
					via <a href="https://github.com/Yahweasel/libav.js/">libav.js.</a>
				</li>
			</ul>
		</div>
	);
}
