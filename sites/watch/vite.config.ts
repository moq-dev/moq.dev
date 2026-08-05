import { defineConfig } from "vite";
import { routing } from "../lib/dev";

// moq.watch — a static Vite build of the @moq/watch player. The Worker in
// src/worker.ts serves the dist/ output.
export default defineConfig({
	// Share the repo-root .env files with the Astro site, which means Astro's
	// PUBLIC_ prefix rather than Vite's default VITE_.
	envDir: "../..",
	envPrefix: "PUBLIC_",
	plugins: [routing({ invent: false, project: "demo" })],
	build: {
		target: "esnext",
		outDir: "dist",
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		// sites/lib is shared with moq.pub, so it lives outside this root.
		fs: { allow: ["../.."] },
	},
});
