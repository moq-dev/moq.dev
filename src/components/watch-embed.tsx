import hljs from "@/lib/highlight";

export default function Embed() {
	const params = new URLSearchParams(location.search);
	const project = params.get("project");
	const name = params.get("name");
	if (!project || !name) return <p>Choose a broadcast to generate an embed.</p>;
	const url = new URL(import.meta.env.PUBLIC_WATCH_URL);
	url.pathname = [project, ...name.split("/")].map(encodeURIComponent).join("/");
	for (const key of ["relay", "cloudflare", "jwt"]) {
		const value = params.get(key);
		if (value !== null) url.searchParams.set(key, value);
	}
	const escaped = String(url).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
	const html = `<iframe src="${escaped}" allow="autoplay; fullscreen" style="border:0;width:100%;aspect-ratio:16/9"></iframe>`;
	const highlight = (el: HTMLElement) => queueMicrotask(() => hljs.highlightElement(el));
	return (
		<pre>
			<code ref={highlight} class="language-html">
				{html}
			</code>
		</pre>
	);
}
