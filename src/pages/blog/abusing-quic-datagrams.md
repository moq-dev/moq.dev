# Abusing QUIC Datagrams
This is the first part of our QUIC hackathon.
Read [Abusing QUIC Streams](/blog/abusing-quic-streams) if you like ordered data like a normal human being.

We're going to hack QUIC.
"Hack" like a ROM-hack, not "hack" like a prison sentence.
Unless Nintendo is involved.

We're not trying to be malicious, but rather unlock new functionality while remaining compliant with the specification.
We can do this easily because unlike TCP, QUIC is implemented in *userspace*.
That means we can take a QUIC library, tweak a few lines of code, and unlock new functionality that the greybeards *attempted* to keep from us.
We ship our modified library as part of our application and nobody will suspect a thing.

But before we continue, a disclaimer:

## Dingus Territory
QUIC was designed with developers like *you* in mind.
Yes *you*, wearing your favorite "I 💕 node_modules" T-shirt.
I know you're busy, about to rewrite your website (again) using the Next-est framework released literally seconds ago, but hear me out:

*You are a dingus*.

The greybeards that designed QUIC, the QUIC libraries, and the corresponding web APIs do not respect you.
They think that given a shotgun, the first thing you're going to do is blow your own foot off.
And they're right of course.

At first glace, UDP datagrams appear to be quantum: a superposition of delivered and lost.
We hear somebody say "5% packet loss" and our monkey brain visualizes a coin flip or dice roll.
But the reality is that congestion causes (most) packet loss at *our* level in the network stack.
Sending more packets does NOT let you reroll the dice.
Instead it compounds the packet loss, impacting other flows on the network and Google's ability to make money.

If that was a mind-blowing revelation... that's why there is no UDP API on the web.
Fresh out of a coding bootcamp and you already managed to DDoS an ISP with your poorly written website, huh.
And before you "umh actually" me, WebRTC data channels (SCTP) are congestion controlled and quite flawed, hence why QUIC is a big deal.

QUIC doesn't change this mentality either.
Short of wasting a zero-day exploit, we have to use the browser's built-in QUIC library via the WebTransport API.
Browser vendors like Google don't want *you*, the `node_modules` enjoyer, doing any of the stuff mentioned in this article on *their* web clients.
But that's not going to stop us from modifying the server or the clients we control (ex. native app).

However, in doing so, you must constantly evaluate if you are the *dingus* in the exchange.
QUIC infamously does not let you disable encryption because otherwise *some dingus* would disable it because they think it make computer go slow (it doesn't) and oh no now North Korea has some more bitcoins.
Is this a case of the nanny state preventing me from using lead pipes? Yes.
Is AES-GCM slow and worth disabling? Absolutely not, profile your application and you'll find everything else, including sending UDP packets, takes significantly more CPU cycles.

When the safe API is the best API 99% of the time, then it becomes the only API.
This article is the equivalent of using the `unsafe` keyword in Rust.
If you know what you're doing, then you can make the world a slightly better place (but mostly feel really smart).
But if you mess up, you wasted a ton of time for a worse product.

So heed my warnings.
Friends don't let friends design UDP protocols.
(And we're friends?)
You should start simple and use the intended QUIC API before reaching for that shotgun.


## Proper QUIC Datagrams
I've been quite critical in the past about QUIC datagrams.
Bold statements like "they are bait",  "never use datagrams", and "try using QUIC streams first ffs".
But some developers don't want to know the truth and just want their beloved UDP datagrams.

The problem is that QUIC datagrams are *not* UDP datagrams.
QUIC datagrams:
1. Are congestion controlled.
2. Trigger acknowledgements.
3. Do not expose these acknowledgements.
4. May be batched.

We're going to try to fix some of these short-comings in the standard by modifying a standard QUIC library.


### Congestion Control
The truth is that there's nothing stopping a QUIC library from sending an unlimited number of QUIC datagrams.
There's only a few pixels in the standard that say you SHOULD NOT do this.

"Congestion Control" is what a library SHOULD do instead.
There's many congestion control algorithms out there, and put simply they are little more than an educated guess if the network can handle more traffic.
The simplest form of congestion control is to send less data when packet loss is high and send more data when packet loss is low.

But this is an artifical limit that is begging to be broken.
It's often a hiderance as many networks could sustain a higher throughput without this pesky congestion control.
All we need to do is comment out one check and bam, we can send QUIC datagrams at an unlimited rate.

But please do not do this unless you know what you are doing... or are convinced that you know what you are doing.

[ percentile meme ]

You *need* some form of congestion control if you're sending data over the internet.
Otherwise you'll suffer from congestion, bufferbloat, high loss, and other symptoms.
These are not symptoms of the latest disease kept under wraps by the Trump administration, but rather a reality of the internet being a shared resource.
Routers will queue and eventually drop excess packets, wrecking any algorithm that treats the internet like an unlimited pipe.

But it's no fun starting a blog with back to back lectures.
We're here to abuse QUIC damnit, not the readers.

But I did not say that you need to use the *default* congestion control.
The QUIC RFC outlines the dated TCP New Reno algorithm which performs poorly when latency is important or bufferbloat rampant.
But that's not set in stone, QUIC expects pluggable congestion control and is descriptive, not prescriptive.
Most libraries expose an interface so you choose the congestion controller or make your own.
You can't do this with TCP as it's buried inside the kernel, so +1 points to Quicendor (good job 'Arry).

And note that custom congestion control is not specific to QUIC datagrams.
You can use a custom congestion controller for QUIC streams too!
They share the same connection so you can even prioritize/reserve any available bandwidth.

If the default Reno congestion controller is giving you hives, get that checked out and then give BBR a try.
It works much better in bufferbloat scenarios and powers 99% of HTTP traffic at this point.
Or make your own by piping each ACK to ChatGPT and let the funding roll in.
Or be extra boring and write a master's thesis about curve fitting or something
Or completely disable congestion control altogether, I can't stop you.

### Acknowledgements
QUIC will reply with an acknowledgement packet after receiving each datagram.
This might sound absolutely bonkers if you're used to UDP.
Why is my unreliable protocol telling me when its unreliable?
The sacrilege!

Can you take a quess why?
Why go through the trouble of designing an API that looks like UDP only to twist the knife?
These acknowledgements are **not** used for retransmissions... they're only for congestion control.

But what if we just disabled QUIC's congestion control?
Now we're going to get bombarded with useless acknowledgements!

The good news is that QUIC acknowledgements are batched, potentially appended to your data packets, and are quite efficient.
It's only a few extra bytes/packets so step 1: get over it.
But I can already feel your angst; your uncontrollable urge to optimize this *wasted bandwidth*.

The most cleverest of dinguses amongst us (amogus?) might try to leverage these ACKs.
What if we used these otherwise "useless" ACKs to tell our application if a packet was received?
That way we won't have to implement our own ACK/NACK mechanism for reliability.
Somebody call Nobel, that's a dynamite idea.

You can absolutely hack a QUIC library to expose which datagrams were acknowledged by the remote.
More information is always better, right?

...unfortunately there's an edge case [discovered by yours truely](https://github.com/quicwg/datagram/issues/15).
The QUIC may acknowledge a datagram but it gets dropped before being delivered it to the application.
This will happen if a QUIC library processes a packet, sends an ACK, but the application (ex. Javascript web page) is too slow and we run out of memory before processing it.
**Note:** QUIC streams don't suffer from this issue because they use flow control.

This might not be a deal breaker depending on your application because it introduces false-positives.
They can't be treated as a definitive signal that a packet was processed.
If you need this reassurance then switch to QUIC streams or (*gasp*) implement your own ACKs/NACKs on top of QUIC datagrams.

But not only is it more work to implement your own ACKs, the underlying QUIC ACKs will still occur.
This is gross because one datagram will trigger a QUIC ACK, your custom ACK, and a QUIC ACK for your custom ACK.
I bet the angst is overwhelming now.

So let's get rid of these useless ACKs instead.
If you control the receiver, you can tweak the `max_ack_delay` parameter.
This is a parameter exchanged during the handshake that indicates how long the implementation can wait before sending an acknowledgement.
Crank it up to 1000ms (the default is 25ms) and the number of acknowledgement packets should slow to a trickle.

Be warned that this will impact all QUIC frames, *especially* STREAM retransmissions.
It may also throw a wrench into the congestion controller too as they expect timely feedback.
So only consider this route if you've gone *full dingus* and completely disabled congestion control and streams.
The chaos you've sown will be legendary.

### Batching
Most QUIC libraries will automatically fill a UDP packet with as much data as it can.
This is dope, but as we established, you can't settle for *dope*.
You don't get out of bed in the morning for *dope*, it needs to be at least *rad* or 🚀.

But why disable batching?
Let's you're high on the thrill of sending unlimited packets after disabling congestion control.
However, sometimes a bunch of packets get lost and you need to figure out why.
Surely it can't be the consequences of your actions?

"No!
It's the network's fault!
I'm going to send additional copies to ensure at least one arrives..."

I cringed a bit writing that.
Not as much as you've cringed while reading this blog, but a close 🥈.
See, I've sat through too presentations by principal engineers claiming the same thing.
It turns out there's no secret cheat code to the internet: sending more packets will cause proportially *more* packet loss as devices get fully saturated.

FEC is the solution to a problem, but a different problem.
I already wrote Never* Use Datagrams and you should read that.
Instead, we're going to focus on **atomicity**.

Like I said earlier, packet loss instinctively feels like an independent event: a coin toss on a router somewhere.
But sending the same packet back-to-back does *not* mean you get a second flip of the coin.

An IP packet is actually quite a high level abstraction.
Our payload of data has to somehow get serialized into a physical transmission and that's the job of a lower level protocol.
For example, 7 IP packets (1.2KB MTU*) can fit snug into a jumbo Ethernet frame.
These frames then get sliced into different dimensions, be it time or frequency or whatever, as they traverse an underlying medium.
A protocol like Wifi will automatically apply redundancy and even retransmissions based on the properties of the medium.
And let's not forget intermediate routers because they will batch packets too, it's just more efficient.

So if your protocol depends on "independent" packets, then you will be distraught to learn that no such thing exists.
Packets can (and will) be dropped in batches despite your best efforts to avoid batching.

That's why QUIC goes the other direction and batches everything, including datagrams.
An application may appear to send ten disjoint datagrams but under the hood, they may get secretly combined into one UDP datagram to avoid redundant headers.
If not QUIC, then another layer would perform (less efficient) batching.

The ratio of lectures to hacks is approaching dangerous levels.
Fuck it, lets disable batching.

If you control the QUIC library, one snip and you can short-circuit the batching.
Each QUIC datagram is now a UDP packet, hazzah!
The library should still perform *some* batching and append stuff like ACKs to packets.
Please have mercy and don't require separate UDP packets for our ill-fated ACK friends.

But even if you don't control the QUIC library (ex. browser), you can abuse the fact that QUIC cannot split a datagram across multiple packets.
If your datagrams are large enough (>600 bytes*) then you can sleep easy knowing they won't get combined.
...unless the QUIC library supports MTU discovery, because while the minimum MTU is 1.2KB, the maximum is 64KB.

I'm not sure why you would disable batching because it can only worsen performance, but I'm here (to pretend) not to judge.
Your brain used to be smooth but now it's wrinkly af 🧠🔥.

## Conclusion 
I know you just want your precious UDP datagrams but they're kept in a locked drawer lest you hurt yourself.
But I've given you the key and it's your turn to prove me right.

If you want to "hack" QUIC for more constructive purposes, check out my next blog about QUIC streams.
There's actually some changes you could make without incurring self-harm.

## Hack the Library
https://github.com/quinn-rs/quinn/blob/6bfd24861e65649a7b00a9a8345273fe1d853a90/quinn-proto/src/frame.rs#L211
