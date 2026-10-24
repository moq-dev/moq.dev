import mdx from "@astrojs/mdx";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { createCssVariablesTheme } from "shiki";
import { worklet } from "./moq/js/common/vite-plugin-worklet.ts";

// Colors come from the --astro-code-* variables in global.css, shared with highlight.js.
const codeTheme = createCssVariablesTheme({ variablePrefix: "--astro-code-" });
// The stock theme paints HTML tag names like quoted strings, so `<script type="module">` reads as one color.
codeTheme.tokenColors?.push({ scope: "entity.name.tag", settings: { foreground: "var(--astro-code-token-keyword)" } });

// https://astro.build/config
export default defineConfig({
	site: "https://moq.dev",
	output: "static",
	markdown: {
		shikiConfig: { theme: codeTheme },
	},
	integrations: [mdx(), solidJs()],
	vite: {
		plugins: [tailwindcss(), worklet()],
		build: {
			target: "esnext",
		},
		resolve: {
			alias: {
				"@": "/src",
			},
		},
	},
});
