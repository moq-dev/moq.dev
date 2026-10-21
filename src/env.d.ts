/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_VOICE_API_URL: string;
	readonly PUBLIC_TURNSTILE_SITE_KEY: string;
}
