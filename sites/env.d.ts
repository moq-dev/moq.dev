// The moq.pub and moq.watch builds read the repo-root .env files, so they see
// the same PUBLIC_ variables the Astro site does.
interface ImportMetaEnv {
	/** The relay to connect to, e.g. https://cdn.moq.pro. */
	readonly PUBLIC_RELAY_URL: string;
}
