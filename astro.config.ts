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

// Pages still being built, by route. Only `astro dev` and a `--mode staging` build serve them; every other build
// (live, or no mode at all) leaves them out, so production 404s them, and since they live outside src/pages, no
// sitemap.xml or llms.txt lists them. Launching one moves its file into src/pages and deletes its entry here.
const UNRELEASED: Record<string, string> = {
	"/huh": "./src/unreleased/huh.astro", // launched by /quest/m2/huh/routing-and-timestamps.md
};

// Astro hands its config no mode, so read the CLI's own `--mode` flag.
const flag = process.argv.indexOf("--mode");
const mode =
	flag >= 0 ? process.argv[flag + 1] : process.argv.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length);

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
		{
			name: "unreleased",
			hooks: {
				"astro:config:setup": ({ command, injectRoute }) => {
					if (command !== "dev" && mode !== "staging") return;
					for (const [pattern, entrypoint] of Object.entries(UNRELEASED)) injectRoute({ pattern, entrypoint });
				},
			},
		},
	],
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
