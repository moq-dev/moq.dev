// Head-of-line blocking: the same packets, lost the same way, delivered over one ordered byte stream (TCP) or
// independent QUIC streams. Times are in seconds; the sender emits one packet every GAP, round robin over STREAMS.

export const STREAMS = 3;
export const GAP = 0.15;
export const FLIGHT = 1; // one way across the diagram
export const DETECT = 1.2; // after a lost packet leaves, when the sender notices and retransmits it

// How the receiver releases data to the application: in connection order (TCP, and qmux over it) or per stream (QUIC).
export type Order = "connection" | "stream";

export interface Packet {
	seq: number;
	stream: number;
	sent: number;
	lost: boolean; // the first copy never arrives; its retransmit leaves DETECT later
	arrive: number;
	deliver: number; // when the application gets it, after every packet it must wait for
}

// The packets sent in [from, to), dropping the sequence numbers in `lost` once each, in sequence order.
export function send(from: number, to: number, lost: ReadonlySet<number>, order: Order): Packet[] {
	const packets: Packet[] = [];
	const ready = new Map<number, number>(); // when everything before the next packet in each order is delivered
	for (let seq = Math.max(0, Math.ceil(from / GAP)); seq * GAP < to; seq++) {
		const sent = seq * GAP;
		const dropped = lost.has(seq);
		const arrive = sent + (dropped ? DETECT : 0) + FLIGHT;
		const stream = seq % STREAMS;
		const key = order === "connection" ? 0 : stream;
		const deliver = Math.max(arrive, ready.get(key) ?? 0);
		ready.set(key, deliver);
		packets.push({ seq, stream, sent, lost: dropped, arrive, deliver });
	}
	return packets;
}

// How far back `send` must start for the packets sent after `from` to be delivered correctly. A packet sent more
// than DETECT earlier arrives, even retransmitted, no later than one sent at `from` does, so it can't hold that back.
export const HISTORY = DETECT;
