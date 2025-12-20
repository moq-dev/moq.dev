// Use the hang web components.
import "@kixelated/hang/support/element";
import "@kixelated/hang/watch/element";
import { Show } from "solid-js";

export default function () {
	const params = new URLSearchParams(window.location.search);
	const name = params.get("name") ?? "bbb";

	let url: URL;
	if (name === "bbb") {
		url = new URL(`/demo?jwt=${import.meta.env.PUBLIC_RELAY_TOKEN}`, import.meta.env.PUBLIC_RELAY_URL);
	} else {
		url = new URL("/anon", import.meta.env.PUBLIC_RELAY_URL);
	}

	return (
		<>
			<hang-support prop:mode="watch" prop:show="partial" />
			<div class="mb-8">
				<h3 class="inline">Broadcast:</h3>{" "}
				<a href={`/watch?name=${name}`} class="ml-2 text-2xl">
					{name}
				</a>
			</div>
			<hang-watch prop:url={url} prop:name={name} prop:muted={true} prop:controls={true} prop:captions={true} prop:reload={true}>
				<canvas style={{ "max-width": "100%", height: "auto", margin: "0 auto", "border-radius": "1rem" }} />
			</hang-watch>

			<Show when={name === "bbb"}>
				<h3>Known Issue:</h3>
				<p>
					<strong>TODO:</strong> The GCP instance publishing this broadcast deadlocks after a few weeks and I'm too busy
					to investigate why. If the stream is offline, try <a href="/publish">publishing your own</a> instead.
				</p>
			</Show>

			<h3>Features:</h3>
			<ul>
				<li>
					🔓 <strong>Open Source</strong>: <a href="/source">Typescript and Rust libraries</a>; this demo is{" "}
					<a href="https://github.com/moq-dev/moq/blob/main/js/hang-demo/src/index.html">here</a>.
				</li>
				<li>
					🌐 <strong>100% Web</strong>: WebTransport, WebCodecs, WebAudio, WebWorkers, WebEtc.
				</li>
				<li>
					🎬 <strong>Modern Codecs</strong>: Supports AV1, H.265, H.264, VP9, Opus, AAC, etc.
				</li>
				<Show when={name !== "bbb"}>
					<li>
						💬 <strong>Automatic Captions</strong>: Generated{" "}
						<a href="https://huggingface.co/docs/transformers.js/en/index">in-browser</a> using WebGPU and{" "}
						<a href="https://github.com/openai/whisper">Whisper</a>.
					</li>
				</Show>
				<li>
					⚡ <strong>Real-Time</strong>: Minimal latency by skipping unimportant media during congestion.
				</li>
				<li>
					🚀 <strong>Massive Scale</strong>: Downloaded from the nearest CDN edge.
				</li>
				<li>
					💪 <strong>Efficient</strong>: No video is downloaded when minimized, or audio when muted.
				</li>
				<li>
					🔧 <strong>Compatible</strong>: TCP fallback via{" "}
					<a href="https://github.com/moq-dev/web-transport/tree/main/web-transport-ws">WebSocket</a>, Safari fallback
					via <a href="https://github.com/Yahweasel/libav.js/">libav.js.</a>
				</li>
			</ul>
		</>
	);
}
