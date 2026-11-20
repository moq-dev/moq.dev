// The quest post's daily activity, and how its figures name days and counts.
import json from "./data/activity.json";

export interface Day {
	date: string;
	merged: Record<string, number>;
	decisions: Record<string, number>;
	messages: number;
	sessions: number;
	costUsd: number;
	quests: { added: number; deleted: number };
	reviews: Record<string, number>;
}

export const source = json.source;
export const days = json.days as unknown as Day[];

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
export const total = (fn: (d: Day) => number) => sum(days.map(fn));
export const merged = (d: Day) => sum(Object.values(d.merged));
export const decided = (d: Day) => sum(Object.values(d.decisions));

// How a person answered an agent's question, in the order the figures stack them.
export const ANSWERS = [
	{ key: "recommended", label: "took the recommendation", color: "var(--took)" },
	{ key: "other", label: "picked another option", color: "var(--other)" },
	{ key: "own", label: "typed my own answer", color: "var(--own)" },
	{ key: "unranked", label: "no recommendation given", color: "var(--plain)" },
] as const;

export const count = (n: number) => n.toLocaleString("en-US");
export const date = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const span = `${date(source.since)} to ${date(source.until)}`;
