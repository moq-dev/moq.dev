import type { Broadcast } from "./broadcast";

export interface TryWatch {
	project: "try";
	broadcast: string;
	watchToken: string;
	expiresAt: number;
}

export interface TryToken extends TryWatch {
	publishToken: string;
}

const BROADCAST = /^[0123456789abcdefghjkmnpqrstvwxyz]{10}\.hang$/;

async function request(api: string, route: string, broadcast?: string): Promise<TryToken | TryWatch> {
	const response = await fetch(new URL(`/try/${route}`, api), {
		method: "POST",
		credentials: "omit",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(broadcast === undefined ? {} : { broadcast }),
	});
	if (!response.ok) throw new Error(`Try credentials refused (${response.status}).`);
	const token = await response.json();
	if (
		token?.project !== "try" ||
		typeof token.broadcast !== "string" ||
		!BROADCAST.test(token.broadcast) ||
		(broadcast !== undefined && token.broadcast !== broadcast) ||
		typeof token.watchToken !== "string" ||
		!token.watchToken ||
		!Number.isFinite(token.expiresAt) ||
		token.expiresAt <= Date.now() / 1000 ||
		(route === "token" && (typeof token.publishToken !== "string" || !token.publishToken))
	)
		throw new Error("Invalid try credentials.");
	return token;
}

export async function publish(api: string): Promise<TryToken> {
	return (await request(api, "token")) as TryToken;
}

/** Mint only for our configured relay; never send a platform credential to an override. */
export async function watch(api: string, broadcast: Broadcast, params: URLSearchParams): Promise<URLSearchParams> {
	const result = new URLSearchParams(params);
	if (broadcast.project !== "try" || params.has("jwt") || params.has("relay") || params.has("cloudflare"))
		return result;
	if (!BROADCAST.test(broadcast.name)) throw new Error("Invalid try broadcast.");
	const token = await request(api, "watch", broadcast.name);
	result.set("jwt", token.watchToken);
	return result;
}
