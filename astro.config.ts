import fs from "node:fs";
import path from "node:path";
import mdx from "@astrojs/mdx";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	site: "https://moq.dev",
	output: "static",
	integrations: [mdx(), solidJs()],
	vite: {
		plugins: [tailwindcss()],
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
