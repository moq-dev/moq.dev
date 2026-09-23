// Live community numbers for the nav: GitHub stars and Discord members.
//
// Fetched in the browser rather than at build time because deploys are manual
// and infrequent, so a baked-in count would be weeks stale. Both APIs allow
// anonymous CORS requests; GitHub's limit is 60/hour per IP, which is why the
// result is cached in localStorage for an hour instead of refetched per page.

const GITHUB = "https://api.github.com/repos/moq-dev/moq";
const DISCORD = "https://discord.com/api/v10/invites/FCYF3p99mr?with_counts=true";

const CACHE_KEY = "moq.stats";
const CACHE_TTL = 60 * 60 * 1000;

interface Stats {
	stars?: number;
	chatters?: number;
}

interface Cached extends Stats {
	at: number;
}

function asCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCache(): Stats | undefined {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return;
		const cached = JSON.parse(raw) as Cached;
		if (typeof cached.at !== "number" || Date.now() - cached.at > CACHE_TTL) return;
		const stars = asCount(cached.stars);
		const chatters = asCount(cached.chatters);
		if (stars === undefined && chatters === undefined) return;
		return { stars, chatters };
	} catch {
		return;
	}
}

function writeCache(stats: Stats) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ ...stats, at: Date.now() } satisfies Cached));
	} catch {
		// Private mode, quota, etc. Not worth surfacing.
	}
}

async function fetchNumber(url: string, key: string): Promise<number | undefined> {
	try {
		// Discord echoes the requesting origin in Access-Control-Allow-Origin but
		// marks the response cacheable without `Vary: Origin`, so a response cached
		// for moq.dev fails the CORS check on doc.moq.dev. Skip the HTTP cache;
		// localStorage above is the cache.
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) return;
		const json = await res.json();
		const value = json[key];
		return typeof value === "number" ? value : undefined;
	} catch {
		return;
	}
}

async function fetchStats(): Promise<Stats> {
	const [stars, chatters] = await Promise.all([
		fetchNumber(GITHUB, "stargazers_count"),
		fetchNumber(DISCORD, "approximate_member_count"),
	]);
	return { stars, chatters };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const round = (n: number) => compact.format(n).toLowerCase();
const TITLES: Record<keyof Stats, string> = { stars: "GitHub stars", chatters: "Discord members" };

// Fills every element with a `data-stat="stars"` / `data-stat="chatters"`
// attribute, e.g. "1.5k stars", and titles the surrounding link with the exact
// count. Elements stay empty if a fetch fails; the links still work.
export async function renderStats() {
	const cached = readCache();
	const stats = cached ?? (await fetchStats());
	if (!cached && (stats.stars !== undefined || stats.chatters !== undefined)) writeCache(stats);

	for (const el of document.querySelectorAll<HTMLElement>("[data-stat]")) {
		const key = el.dataset.stat as keyof Stats;
		const value = stats[key];
		if (typeof value !== "number") continue;
		el.textContent = `${round(value)} ${key}`;
		const link = el.closest("a");
		if (link) link.title = `${value.toLocaleString()} ${TITLES[key]}`;
	}
}
