import fs from "node:fs";
import path from "node:path";
import mdx from "@astrojs/mdx";
import solidJs from "@astrojs/solid-js";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	site: "https://moq.dev",
	output: "static",
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
		base: "./",
		server: {
			fs: {
				allow: [
					".",
					// Allow `npm link @kixelated/hang`
					fs.realpathSync(path.resolve("node_modules/@kixelated/hang")),
				],
			},
		},
		resolve: {
			alias: {
				"@": "/src",
			},
		},
		optimizeDeps: {
			exclude: ["@kixelated/hang"],
		},
	},
});
