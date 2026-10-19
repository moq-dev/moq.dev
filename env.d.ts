/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_RELAY_URL: string;
	readonly PUBLIC_VOICE_API_URL: string;
	readonly PUBLIC_TURNSTILE_SITE_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
