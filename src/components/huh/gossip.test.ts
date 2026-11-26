import { describe, expect, test } from "bun:test";
import { type Client, LOCAL, Mesh, SETTLE, watchers } from "./gossip";

const CLIENTS: Client[] = [
	{ name: "alice", relay: 0, publishes: "room/alice", watches: "room/" },
	{ name: "harbor", relay: 0, watches: "boat/" },
	{ name: "bob", relay: 1, publishes: "room/bob", watches: "room/" },
	{ name: "cam", relay: 1, publishes: "boat/cam-1" },
	{ name: "carol", relay: 2, publishes: "room/carol", watches: "room/" },
];
const [ALICE, HARBOR, BOB, CAM, CAROL] = [0, 1, 2, 3, 4];

const run = (mesh: Mesh, seconds: number, dt = 1 / 60) => {
	for (let t = 0; t < seconds; t += dt) mesh.step(dt);
};
const seen = (mesh: Mesh, client: number) => [...mesh.roster[client].keys()].sort();

describe("Mesh", () => {
	test("an announcement reaches every matching watcher and no one else", () => {
		const mesh = new Mesh(3, CLIENTS);
		mesh.set(BOB, true);
		run(mesh, SETTLE + 0.1);
		expect(seen(mesh, ALICE)).toEqual(["room/bob"]);
		expect(seen(mesh, CAROL)).toEqual(["room/bob"]);
		expect(seen(mesh, BOB)).toEqual([]); // its own broadcast never echoes back
		expect(seen(mesh, HARBOR)).toEqual([]);
		expect(mesh.inflight).toEqual([]);
	});

	test("a watcher on the publisher's relay hears it without crossing the mesh", () => {
		const mesh = new Mesh(3, CLIENTS);
		mesh.set(ALICE, true);
		run(mesh, 2 * LOCAL + 0.05);
		expect(mesh.roster[HARBOR].size).toBe(0);
		mesh.set(CAM, true);
		run(mesh, SETTLE + 0.1);
		expect(seen(mesh, HARBOR)).toEqual(["boat/cam-1"]);
		expect(mesh.roster[HARBOR].get("boat/cam-1")).toBeCloseTo(2 * LOCAL + 0.05 + SETTLE, 1);
	});

	test("a withdrawal clears every roster", () => {
		const mesh = new Mesh(3, CLIENTS);
		mesh.set(CAROL, true);
		run(mesh, SETTLE + 0.1);
		mesh.set(CAROL, false);
		run(mesh, SETTLE + 0.1);
		for (let i = 0; i < CLIENTS.length; i++) expect(mesh.roster[i].size).toBe(0);
		for (const known of mesh.known) expect(known.size).toBe(0);
	});

	test("a coarse step delivers the same as a fine one", () => {
		const fine = new Mesh(3, CLIENTS);
		const coarse = new Mesh(3, CLIENTS);
		for (const m of [fine, coarse]) {
			m.set(ALICE, true);
			m.set(CAM, true);
		}
		run(fine, SETTLE);
		coarse.step(SETTLE);
		expect(coarse.roster).toEqual(fine.roster);
	});

	test("rosters match who is online after any toggling", () => {
		// A seeded generator, so a failure reproduces.
		let seed = 7;
		const random = () => {
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			return seed / 2 ** 32;
		};
		const publishers = CLIENTS.flatMap((c, i) => (c.publishes ? [i] : []));
		for (let round = 0; round < 50; round++) {
			const mesh = new Mesh(3, CLIENTS);
			for (let n = 0; n < 20; n++) {
				const p = publishers[Math.floor(random() * publishers.length)];
				mesh.set(p, !mesh.online[p]);
				run(mesh, random() * SETTLE, 1 / 30);
			}
			run(mesh, SETTLE + 0.1);

			CLIENTS.forEach((_, i) => {
				const expected = publishers
					.filter((p) => mesh.online[p] && watchers(CLIENTS, CLIENTS[p].publishes ?? "", p).includes(i))
					.map((p) => CLIENTS[p].publishes)
					.sort();
				expect(seen(mesh, i)).toEqual(expected as string[]);
			});
			const live = publishers.filter((p) => mesh.online[p]).map((p) => CLIENTS[p].publishes);
			for (const known of mesh.known) expect([...known].sort()).toEqual(live.sort() as string[]);
		}
	});
});

describe("watchers", () => {
	test("matches by prefix and skips the publisher", () => {
		expect(watchers(CLIENTS, "room/alice", ALICE)).toEqual([BOB, CAROL]);
		expect(watchers(CLIENTS, "boat/cam-1", CAM)).toEqual([HARBOR]);
		expect(watchers(CLIENTS, "zoo/lion")).toEqual([]);
	});
});
