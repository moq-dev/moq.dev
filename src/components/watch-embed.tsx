import hljs from "@/lib/highlight";

export default function WatchEmbed() {
	const params = new URLSearchParams(window.location.search);
	const name = params.get("name") ?? "bbb";

	// The relay URL on /watch may include a JWT for BBB; strip query params.
	const relay = new URL("/anon", import.meta.env.PUBLIC_RELAY_URL);
	const publicUrl = new URL(relay.pathname, relay.origin).toString();

	const embedHtml = `<script type="module">
    import "https://cdn.jsdelivr.net/npm/@moq/watch/element.js/+esm";
    import "https://cdn.jsdelivr.net/npm/@moq/watch/ui/index.js/+esm";
</script>

<!-- Optional wrapper that adds pause/volume controls. -->
<moq-watch-ui>
    <!-- See https://doc.moq.dev/js/@moq/watch for all supported attributes. -->
    <moq-watch id="watch" url="${publicUrl}" name="${name}" muted reload>
        <!-- Provide your own canvas to style as needed. -->
        <canvas></canvas>
    </moq-watch>
</moq-watch-ui>`;

	const embedJs = `import * as Moq from "@moq/lite";
import * as Watch from "@moq/watch";

// A MoQ connection that is automatically re-established on drop.
const connection = new Moq.Connection.Reload({
    url: new URL("${publicUrl}"),
    enabled: true,
});

// The MoQ broadcast being fetched.
const broadcast = new Watch.Broadcast({
    connection: connection.established,
    enabled: true,
    name: Moq.Path.from("${name}"),
});

// Synchronize audio and video playback.
const sync = new Watch.Sync();

// Decode and render video into your own canvas.
const videoSource = new Watch.Video.Source(sync, { broadcast });
const videoDecoder = new Watch.Video.Decoder(videoSource);
const videoRenderer = new Watch.Video.Renderer(videoDecoder, { canvas, paused: false });

// Decode and emit audio through WebAudio.
const audioSource = new Watch.Audio.Source(sync, { broadcast });
const audioDecoder = new Watch.Audio.Decoder(audioSource);
const audioEmitter = new Watch.Audio.Emitter(audioDecoder, { paused: false });`;

	const highlight = (el: HTMLElement) => queueMicrotask(() => hljs.highlightElement(el));

	return (
		<>
			<pre>
				<code ref={highlight} class="language-html">
					{embedHtml}
				</code>
			</pre>

			<p>Or skip the web component entirely and drive the lower-level JavaScript API directly.</p>
			<pre>
				<code ref={highlight} class="language-typescript">
					{embedJs}
				</code>
			</pre>
		</>
	);
}
