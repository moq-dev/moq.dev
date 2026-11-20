import { defineConfig } from "vite";
import { worklet } from "../../moq/js/common/vite-plugin-worklet.ts";
import { routing } from "../lib/dev";

// moq.pub — a static Vite build of the @moq/publish player. The Worker in
// src/worker.ts serves the dist/ output.
export default defineConfig({
	// Share the repo-root .env files with the Astro site, which means Astro's
	// PUBLIC_ prefix rather than Vite's default VITE_.
	envDir: "../..",
	envPrefix: "PUBLIC_",
	plugins: [routing(), worklet()],
	build: {
		target: "esnext",
		outDir: "dist",
		emptyOutDir: true,
	},
	server: {
		port: 5174,
		// sites/lib is shared with moq.watch, so it lives outside this root.
		fs: { allow: ["../.."] },
	},
});
