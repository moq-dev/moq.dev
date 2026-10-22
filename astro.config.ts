import fs from "node:fs";
import path from "node:path";
import mdx from "@astrojs/mdx";
import solidJs from "@astrojs/solid-js";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
import { createCssVariablesTheme } from "shiki";

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
	integrations: [
		mdx(),
		solidJs(),
		tailwind({
			// Disable injecting a basic `base.css` import on every page.
			applyBaseStyles: false,
		}),
	],
	vite: {
		build: {
			target: "esnext",
		},
		server: {
			fs: {
				allow: [
					".",
					// Allow `npm link @moq/*`
					fs.realpathSync(path.resolve("node_modules/@moq/publish")),
					fs.realpathSync(path.resolve("node_modules/@moq/watch")),
				],
			},
		},
		resolve: {
			alias: {
				"@": "/src",
			},
		},
	},
});
