// Regenerates the quest post's chart data (src/components/quest/data/) from every machine's agent
// logs and GitHub. Only daily counts are written; no prompt, reply, or question text leaves <raw>.
//
//   bun tools/quest/refresh.ts logs <raw> [--ssh host]...   export each host's agent logs into <raw>
//   bun tools/quest/refresh.ts github <raw>                 fetch PRs per repo (skipping ones in <raw>) and the quest log
//   bun tools/quest/refresh.ts aggregate <raw>              write data/activity.json from <raw>
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

const DATA = join(import.meta.dir, "../../src/components/quest/data");
const ROOT = join(import.meta.dir, "../..");

// The day moq-dev/moq#3239 added quests; the window starts here.
const SINCE = "2026-08-31";

// Every repo with real activity since SINCE. Private ones are counted, never named.
const REPOS = [
	"moq-dev/moq",
	"moq-dev/moq.pro",
	"moq-dev/quest",
	"moq-dev/moq.dev",
	"moq-dev/studio",
	"moq-dev/web-transport",
	"moq-dev/noq",
	"kixel-ai/rind",
	"kixel-ai/rust2",
	"kixel-ai/token-max",
	"kixel-ai/dotfiles",
	"kixel-ai/kixel.ai",
	"kixel-ai/kixel.quest",
	"kixel-ai/nixos",
	"kixelated/corp",
];

// The pinned quest and token-max each host runs, so every host reads its logs the same way.
const lock = JSON.parse(readFileSync(join(ROOT, "flake.lock"), "utf8"));
const QUEST = `github:moq-dev/quest/${lock.nodes.quest.locked.rev}`;
const TOKEN_MAX = "github:kixel-ai/token-max/ed043273542af56bf7da4e21cec63f4f15ae07e0";

// The bots that review PRs on GitHub, by login.
const REVIEWERS = ["pullfrog", "coderabbitai", "chatgpt-codex-connector"];

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const lines = (path: string) =>
	readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

// Runs `nix run <flake> -- args` on a host (null is this one), streaming stdout into `out`.
function run(host: string | null, flake: string, args: string[], out: string) {
	const nix = ["nix", "--extra-experimental-features", "nix-command flakes", "run", flake, "--", ...args];
	const [cmd, argv] = host
		? ["ssh", ["-o", "BatchMode=yes", host, `bash -lc '${nix.map((a) => `"${a}"`).join(" ")}'`]]
		: [nix[0], nix.slice(1)];
	return new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "inherit"] });
		child.stdout.pipe(createWriteStream(out));
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${host ?? ""} exited ${code}`))));
	});
}

const PRS = `
query($owner:String!, $name:String!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    isPrivate
    pullRequests(first:50, after:$cursor, orderBy:{field:CREATED_AT, direction:DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number createdAt mergedAt headRefName
        author { login }
        reviewThreads { totalCount }
        reviews(first:30) { nodes { author { login } state submittedAt } }
      }
    }
  }
}`;

// Every PR created since SINCE, newest first, with who reviewed it.
function prs(repo: string) {
	const [owner, name] = repo.split("/");
	const out = [];
	let cursor: string | undefined;
	let isPrivate = false;
	for (;;) {
		const args = ["api", "graphql", "-f", `query=${PRS}`, "-F", `owner=${owner}`, "-F", `name=${name}`];
		if (cursor) args.push("-F", `cursor=${cursor}`);
		const r = JSON.parse(execFileSync("gh", args, { encoding: "utf8" })).data.repository;
		isPrivate = r.isPrivate;
		const page = r.pullRequests;
		const fresh = page.nodes.filter((pr: { createdAt: string }) => pr.createdAt >= SINCE);
		out.push(...fresh);
		if (fresh.length < page.nodes.length || !page.pageInfo.hasNextPage) break;
		cursor = page.pageInfo.endCursor;
	}
	return { repo, private: isPrivate, prs: out };
}

async function logs(raw: string, ssh: string[]) {
	mkdirSync(raw, { recursive: true });
	const name = (h: string | null) => h ?? hostname();
	await Promise.all(
		[null, ...ssh].flatMap((h) => [
			run(h, QUEST, ["messages", "--json", "--since", SINCE], join(raw, `messages-${name(h)}.json`)),
			run(h, TOKEN_MAX, ["sessions", "--since", SINCE], join(raw, `sessions-${name(h)}.jsonl`)),
		]),
	);
}

function github(raw: string) {
	mkdirSync(join(raw, "prs"), { recursive: true });
	for (const repo of REPOS) {
		const path = join(raw, "prs", `${repo.replace("/", "_")}.json`);
		if (existsSync(path)) continue;
		writeFileSync(path, JSON.stringify(prs(repo)));
		console.log(`fetched ${repo}`);
	}
	// Quest files added and deleted per day on moq-dev/moq's main, renames excluded. First parent only, so a merge
	// commit doesn't count its branch twice, and no --since, which stops at the first out-of-order commit date.
	const moq = join(ROOT, "moq");
	execFileSync("git", ["-C", moq, "fetch", "-q", "origin", "main"]);
	const log = execFileSync(
		"git",
		["-C", moq, "log", "origin/main", "--first-parent", "--format=C %cI", "--name-status", "--", "quest"],
		{ encoding: "utf8", maxBuffer: 1 << 28 },
	);
	writeFileSync(join(raw, "quest-log.txt"), log);
}

type Count = Record<string, number>;
const bump = (c: Count, k: string, n = 1) => {
	c[k] = (c[k] ?? 0) + n;
};

function aggregate(raw: string) {
	const days = new Map<string, { [k: string]: Count }>();
	// Days are UTC, whatever offset a timestamp carries.
	const day = (iso: string) => {
		const d = new Date(iso).toISOString().slice(0, 10);
		if (!days.has(d)) days.set(d, { merged: {}, decisions: {}, typed: {}, agents: {}, quests: {}, reviews: {} });
		// biome-ignore lint/style/noNonNullAssertion: set above
		return days.get(d)!;
	};
	const files = readdirSync(raw);

	// A person's answers and messages, once each even when two hosts hold the same session.
	const seen = new Set<string>();
	for (const f of files.filter((f) => f.startsWith("messages-"))) {
		for (const m of read(join(raw, f))) {
			const key = [m.kind, m.session, m.time, m.header].join("|");
			if (seen.has(key)) continue;
			seen.add(key);
			if (m.time < SINCE) continue;
			const d = day(m.time);
			if (m.kind === "message") {
				bump(d.typed, "messages");
				continue;
			}
			const rec = new Set<string>(m.recommended ?? []);
			const picked = new Set<string>(m.picked ?? []);
			const options = new Set<string>(m.options ?? []);
			const same = rec.size === picked.size && [...rec].every((r) => picked.has(r));
			if (!rec.size) bump(d.decisions, "unranked");
			else if (same) bump(d.decisions, "recommended");
			else if (picked.size && [...picked].every((p) => options.has(p))) bump(d.decisions, "other");
			else bump(d.decisions, "own");
		}
	}

	// Agent sessions at API list prices; a session on several hosts counts once, at its costliest copy.
	const sessions = new Map<string, { start: string; costUsd: number; harness: string; parent: string | null }>();
	for (const f of files.filter((f) => f.startsWith("sessions-"))) {
		for (const s of lines(join(raw, f))) {
			const key = `${s.harness}|${s.session}`;
			const prev = sessions.get(key);
			if (!prev || (s.costUsd ?? 0) > prev.costUsd) sessions.set(key, { ...s, costUsd: s.costUsd ?? 0 });
		}
	}
	for (const s of sessions.values()) {
		const d = day(s.start);
		bump(d.agents, "sessions");
		bump(d.agents, "costUsd", s.costUsd);
	}

	// Merged PRs per day, public repos by name and private ones pooled; each online reviewer's reviews per
	// day; and, by the day they merged, the PRs Pullfrog reviewed out of those merged once it reviewed that repo.
	const repos = [];
	for (const f of readdirSync(join(raw, "prs"))) {
		const r = read(join(raw, "prs", f));
		const label = r.private ? "private" : r.repo;
		repos.push({ repo: label, prs: r.prs.length });
		type Review = { author: { login: string } | null; submittedAt: string | null };
		const joined = r.prs
			.flatMap((pr: { reviews: { nodes: Review[] } }) => pr.reviews.nodes)
			.filter((rv: Review) => rv.author?.login === "pullfrog" && rv.submittedAt)
			.map((rv: Review) => rv.submittedAt)
			.sort()[0];
		for (const pr of r.prs) {
			const reviews: Review[] = pr.reviews.nodes;
			for (const rv of reviews) {
				const who = rv.author?.login;
				if (who && rv.submittedAt && REVIEWERS.includes(who)) bump(day(rv.submittedAt).reviews, who);
			}
			if (!pr.mergedAt) continue;
			bump(day(pr.mergedAt).merged, label);
			if (joined && pr.mergedAt >= joined) bump(day(pr.mergedAt).reviews, "pullfrogJoined");
			if (reviews.some((rv) => rv.author?.login === "pullfrog")) bump(day(pr.mergedAt).reviews, "pullfrogMerged");
		}
	}

	let date = "";
	for (const line of readFileSync(join(raw, "quest-log.txt"), "utf8").split("\n")) {
		if (line.startsWith("C ")) date = line.slice(2);
		const [status, path] = line.split("\t");
		if (!path?.endsWith(".md") || (status !== "A" && status !== "D")) continue;
		bump(day(date).quests, status === "A" ? "added" : "deleted");
	}

	const out = [...days.keys()]
		.filter((d) => d >= SINCE)
		.sort()
		.map((d) => {
			const v = day(d);
			return {
				date: d,
				merged: v.merged,
				decisions: v.decisions,
				messages: v.typed.messages ?? 0,
				sessions: v.agents.sessions ?? 0,
				costUsd: Math.round(v.agents.costUsd ?? 0),
				quests: { added: v.quests.added ?? 0, deleted: v.quests.deleted ?? 0 },
				reviews: v.reviews,
			};
		});

	mkdirSync(DATA, { recursive: true });
	writeFileSync(
		join(DATA, "activity.json"),
		`${JSON.stringify(
			{
				source: {
					since: SINCE,
					until: out[out.length - 1].date,
					hosts: files.filter((f) => f.startsWith("messages-")).length,
					quest: QUEST,
					tokenMax: TOKEN_MAX,
					opened: repos.reduce<Count>((c, r) => {
						bump(c, r.repo, r.prs);
						return c;
					}, {}),
				},
				days: out,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`wrote activity.json: ${out.length} days`);
}

const [cmd, raw, ...rest] = process.argv.slice(2);
if (!raw) throw new Error("usage: refresh.ts logs|github|aggregate <raw> [--ssh host]...");
if (cmd === "logs")
	await logs(
		raw,
		rest.flatMap((a, i) => (rest[i - 1] === "--ssh" ? [a] : [])),
	);
else if (cmd === "github") github(raw);
else if (cmd === "aggregate") aggregate(raw);
else throw new Error(`unknown command ${cmd}`);
