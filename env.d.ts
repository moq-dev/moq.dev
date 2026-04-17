/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly PUBLIC_RELAY_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
