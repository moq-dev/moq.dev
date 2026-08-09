# Using QUIC Streams
I was actually inspired to write this blog post because someone joined my (dope) Discord server.
They asked if they could do all of the above so they would have proper QUIC datagrams.

The use-game is vidya games.
The most common approach for video games is to process game state at a constant "tick" rate.
VALORANT, for example, uses a tick rate of [128 Hz](https://playvalorant.com/en-us/news/dev/how-we-got-to-the-best-performing-valorant-servers-since-launch/) meaning each update covers a 7.8ms period.
It's really not too difficult from frame rate (my vidya background) but latency is more crucial otherwise nerds get mad.

So the idea is to transmit each game tick as a QUIC datagram.
However, that would involve transmitting a lot of redundant information, as two game ticks may be very similar to each other.
So the idea is to implement custom acknowledgements and (re)transmit only the unacknowledged deltas.

If you've had the pleasure of implementing QUIC before, this might sound very similar to how QUIC streams work internally.
In fact, this line of thinking is what lead me to ditch RTP over QUIC (datagrams) and embrace Media over QUIC (streams).
So why disassemble QUIC only to reassemble parts of it?
If we used QUIC streams instead, what more could you want?

### What More Could We Want?
Look, I may be one of the biggest QUIC fanboys, but I've got to admit that QUIC is pretty poor for real-time latency.
It's not designed for small payloads that need to arrive ASAP, like voice calls.

But don't take my wrinkle brain statements as fact.
Let's dive deeper.

*How does a QUIC library know when a packet is lost?*

It doesn't.
There's no explicit signal from routers (yet?) when a packet is lost.
A QUIC library has to instead use FACTS and LOGIC to make an educated guess.
The RFC outlines a *recommended* algorithm that I'll attempt to simplify:

- The sender increments a sequence number for each packet.
- Upon receiving a packet, the receiver will start a timer to ACK that sequence number, batching with any others that arrive within `max_ack_delay`.
- If the sender does not receive an ACK after waiting multiple RTTs, it will send another packet (like a PING) to poke the receiver and hopefully start the ACK timer.
- After finally receiving an ACK, the sender *may* decide that a packet was lost if:
  - 3 newer sequences were ACKed.
  - or a multiple of the RTT has elapsed.
- As the congestion controller allows, retransmit any lost packets and repeat.

Skipped that boring wall of text?
I don't blame you.
You're just here for the funny blog and *maaaaybe* learn something along the way.

I'll help.
If a packet is lost, it takes anywhere from 1-3 RTTs to detect the loss and retransmit.
It's particularly bad for the last few packets in a burst because if they're lost, nothing starts the acknowledgement timer and the sender will have to poke.
"You still alive over there?"

And just in case I lost you in the acronym soup, RTT is just another way of saying "your ping".
So if you're playing Counter Strike cross-continent with a ping of 150ms, you're already at a disadvantage.
Throw QUIC into the mix and some packets will take 300ms to 450ms of conservative retransmissions.
*cyka bylat*

### We Can Do Better?
So how can we make QUIC better support real-time applications that can't wait multiple round trips?
Should we give up and admit that networking peaked with UDP?

Of course not what a dumb rhetorical question.

We can use QUIC streams!
A QUIC stream is nothing more than a byte slice.
The stream is arbitrarily split into STREAM frames that consists of an offset and a payload.
The QUIC reviever reassembles these frames in order before flushing to the application.
Some QUIC libraries even allow the application to read stream chunks out of order.

How do we use QUIC streams for vidya games?
Let's suppose we start with a base game state of 1000 bytes and each tick there's an update of 100 bytes.
We make a new stream, serialize the base game state, and constantly append each update.
QUIC will ensure that the update and deltas arrive in the intended order so it's super easy to parse.

But not so fast, there's a **huge** issue.
We just implemented head-of-line blocking and our protocol is suddenly no better than TCP!
I was promised that QUIC was supposed to fix this...



We can abuse the fact that a QUIC receiver must be prepared to accept duplicate or redundant STREAM frames.
This can happen naturally if a packet is lost or arrives out of order.
You might see where this is going: nothing can stop us from sending a boatload of packets.




Our QUIC library does not need to wait for a (negative) acknowledgement before retransmitting a stream chunk.
We could just send it again, and again, and again every 50ms.
If it's a duplicate, then QUIC will silently ignore it.

## A Problem

But there's a pretty major issue with this approach:
**BUFFERBLOAT**.
Surprise!
It turns out that some routers may queue packets for an undisclosed amount of time when overloaded.

Let's say you retransmit every 50ms and everything works great on your PC.
A user from Brazil or India downloads your application and it initially works great too.
But eventually their ISP gets overwhelmed and congestion causes the RTT to (temporarily) increase to 500ms.
...well now you're transmitting 10x the data, potentially aggravating any congestion and preventing recovery.
It's a vicious loop and you've basically built your own DDoS agent.

For the distributed engineers amogus, this is the networking equivalent of an F5 refresh storm.


Either way, sending redundant copies of data is nothing new.
Let's go a step further and embrace QUIC streams.

### How I Learned to Embrace the Stream


At the end of the day, a QUIC STREAM frame is a byte offset and payload.
Let's say we transmit our game state as STREAM 0-230 and 33ms later we transmit 20 bytes of deltas as STREAM 230-250.
If the original STREAM frame is lost, well even if we receive those 20 bytes, we can't actually decode them and suffer from HEAD-OF-LINE blocking.

My game dev friend thinks this is unacceptable and made his own ACK-based algorithm on top of QUIC datagrams instead.
The sender ticks every 30ms and sends a delta from the last acknowledged state, even if that data might be in-flight already.
Pretty cool right?
Why doesn't QUIC do this?

It does.

(mind blown)

QUIC will retransmit any unacknowledged fragments of a stream.
But like I said above, only when a packet is considered lost.
But with the power of h4cks, we could have the QUIC library *assume* the rest of the stream is lost and needs to be retransmitted.
For you library maintainers out there, consider adding this as a `stream.retransmit()` method and feel free to forge my username into the git commit.

So to continue our example above, we can modify QUIC to send byte offsets 0-250 instead of just 230-250.
And now we can accomplish the exact* same behavior as the game dev but without custom acknowledgements, retransmissions, deltas, and reassembly buffers.

Forking a library feels *so dirty* but it magically works.


### Some Caveats
Okay it's not the same as the game dev solution; it's actually better because of **congestion control**.
And once again, you do ~need~ want congestion control.



Let's say you retransmit every 30ms and everything works great on your PC.
A user from Brazil or India downloads your application and it initially works great too.
But eventually their ISP gets overwhelmed and congestion causes the RTT to (temporarily) increase to 500ms.
...well now you're transmitting 15x the data and further aggravating any congestion.
It's a vicious loop and you've basically built your own DDoS agent.

But QUIC can avoid this issue because retransmissions are gated by congestion control.
Even when a packet is considered lost, or my hypothetical `stream.retransmit()` is called, a QUIC library won't immediately retransmit.
Instead, retransmissions are queued up until the congestion controller deems it appropriate.
Note that a late acknowledgement or stream reset will cancel a queued retransmission (unless your QUIC library sucks).

Why?
If the network is fully saturated, you need to send fewer packets to drain any network queues, not more.
Even ignoring bufferbloat, networks are finite resources and blind retransmissions are the easiest way to join the UDP Wall of Shame.
In this instance,.the QUIC greybeards will stop you from doing bad thing.
The children yearn for the mines, but the adults yearn for child protection laws.

Under extreme congestion, or when temporarily offline, the backlog of queued data will keep growing and growing.
Once the size of queued delta updates grows larger than the size of a new snapshot, cut your losses and start over.
Reset the stream with deltas to prevent new transmissions and create a new stream with the snapshot.
Repeat as needed; it's that easy!

I know this horse has already been beaten, battered, and deep fried, but this is yet another benefit of congestion control.
Packets are queued locally so they can be cancelled instantaneously.
Otherwise they would be queued on some intermediate router (ex. for 500ms).
