// Section 5's discovery mesh: clients announce broadcast paths to their relay, the relays gossip them to each other,
// and each relay tells the clients watching a matching prefix. Nothing polls: a roster changes when a message lands.
//
// The relays form a full mesh, so a relay forwards only what its own clients announce to the other relays, and what
// it hears from a relay only to its own clients. That keeps every path loop-free without route bookkeeping.

export interface Client {
	name: string;
	relay: number;
	publishes?: string; // the broadcast path it announces while online
	watches?: string; // the prefix it asked to hear announcements under, such as "room/"
}

export type Node = { relay: number } | { client: number };

export interface Message {
	kind: "announce" | "end";
	path: string;
	from: Node;
	to: Node;
	sent: number;
	arrives: number;
}

// Seconds per hop, slowed down so each one can be followed.
export const LOCAL = 0.35; // client to relay
export const MESH = 0.7; // relay to relay

export class Mesh {
	t = 0;
	inflight: Message[] = [];
	readonly online: boolean[];
	// What each relay currently knows is announced.
	readonly known: Set<string>[];
	// What each watcher has heard, and when it first did.
	readonly roster: Map<string, number>[];

	constructor(
		readonly relays: number,
		readonly clients: readonly Client[],
	) {
		this.online = clients.map(() => false);
		this.known = Array.from({ length: relays }, () => new Set());
		this.roster = clients.map(() => new Map());
	}

	// Brings a publisher online or offline; its relay hears about it one hop later.
	set(client: number, online: boolean) {
		const path = this.clients[client].publishes;
		if (path === undefined) throw new Error(`${this.clients[client].name} publishes nothing`);
		if (this.online[client] === online) return;
		this.online[client] = online;
		this.send(online ? "announce" : "end", path, { client }, { relay: this.clients[client].relay }, this.t);
	}

	step(dt: number) {
		this.t += dt;
		for (;;) {
			// Every hop of one kind takes as long, so delivering in arrival order keeps each link first in, first out.
			let next = -1;
			for (let i = 0; i < this.inflight.length; i++) {
				if (this.inflight[i].arrives > this.t) continue;
				if (next < 0 || this.inflight[i].arrives < this.inflight[next].arrives) next = i;
			}
			if (next < 0) return;
			const [m] = this.inflight.splice(next, 1);
			this.deliver(m);
		}
	}

	private deliver(m: Message) {
		if ("client" in m.to) {
			const roster = this.roster[m.to.client];
			if (m.kind === "announce") roster.set(m.path, m.arrives);
			else roster.delete(m.path);
			return;
		}

		const relay = m.to.relay;
		const known = this.known[relay];
		if (m.kind === "announce") known.add(m.path);
		else known.delete(m.path);

		// Split horizon: only what a relay's own client said goes back out over the mesh.
		if ("client" in m.from) {
			for (let r = 0; r < this.relays; r++) {
				if (r !== relay) this.send(m.kind, m.path, { relay }, { relay: r }, m.arrives);
			}
		}
		this.clients.forEach((c, i) => {
			if (c.relay !== relay || c.watches === undefined || !m.path.startsWith(c.watches)) return;
			if ("client" in m.from && m.from.client === i) return; // it knows its own broadcast
			this.send(m.kind, m.path, { relay }, { client: i }, m.arrives);
		});
	}

	// Forwards from the moment a message landed rather than from the end of the step, so a coarse step changes nothing.
	private send(kind: Message["kind"], path: string, from: Node, to: Node, sent: number) {
		const hop = "relay" in from && "relay" in to ? MESH : LOCAL;
		this.inflight.push({ kind, path, from, to, sent, arrives: sent + hop });
	}
}

// The longest a change takes to reach every watcher: up to the relay, across the mesh, down to the client.
export const SETTLE = 2 * LOCAL + MESH;

// Who should hear `path` once the mesh settles: every other client watching a prefix of it.
export function watchers(clients: readonly Client[], path: string, except?: number): number[] {
	return clients.flatMap((c, i) => (i !== except && c.watches !== undefined && path.startsWith(c.watches) ? [i] : []));
}
