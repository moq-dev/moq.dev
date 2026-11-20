import hljs from "@/lib/highlight";

export default function Embed() {
	const url = import.meta.env.PUBLIC_PUBLISH_URL;
	const escaped = String(url).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
	const html = `<iframe src="${escaped}" allow="camera; microphone; autoplay; fullscreen" style="border:0;width:100%;aspect-ratio:16/9"></iframe>`;
	const highlight = (el: HTMLElement) => queueMicrotask(() => hljs.highlightElement(el));
	return (
		<pre>
			<code ref={highlight} class="language-html">
				{html}
			</code>
		</pre>
	);
}
