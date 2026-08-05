/**
 * Random broadcast names for moq.pub.
 *
 * Anyone can publish to the `anon` project, so the name we invent has to be
 * unlikely to collide with a stranger's. Two dictionary words keep the URL
 * readable enough to say out loud; the random suffix is what actually makes a
 * collision negligible.
 */
import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";

export function random(): string {
	const words = uniqueNamesGenerator({ dictionaries: [adjectives, animals], separator: "-" });
	const suffix = crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, "0");
	return `${words}-${suffix}.hang`;
}
