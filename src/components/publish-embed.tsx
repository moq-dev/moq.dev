import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import hljs from "@/lib/highlight";

export default function PublishEmbed() {
	const name = uniqueNamesGenerator({ dictionaries: [adjectives, animals], separator: "-" });
	const url = new URL("/anon", import.meta.env.PUBLIC_RELAY_URL);

	const embedHtml = `<script type="module">
    import "https://cdn.jsdelivr.net/npm/@moq/publish/element.js/+esm";
    import "https://cdn.jsdelivr.net/npm/@moq/publish/ui/index.js/+esm";
</script>

<!-- Optional wrapper that adds source/mute controls. -->
<moq-publish-ui>
    <!-- See https://doc.moq.dev/js/@moq/publish for all supported attributes. -->
    <moq-publish url="${url.toString()}" name="${name}" source="camera">
        <!-- Provide your own video element for the local preview. -->
        <video autoplay muted></video>
    </moq-publish>
</moq-publish-ui>`;

	const highlight = (el: HTMLElement) => queueMicrotask(() => hljs.highlightElement(el));

	return (
		<pre>
			<code ref={highlight} class="language-html">
				{embedHtml}
			</code>
		</pre>
	);
}
