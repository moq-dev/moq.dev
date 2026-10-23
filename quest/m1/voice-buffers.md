# [L] A live timeline of the voice call

## Goal

The `/voice` demo draws the whole call on one live, scrolling timeline, from
real measurements: your mic frames as captured, those frames reaching the
agent, its VAD and turn decisions, the words STT recognizes and when, the LLM
and TTS working, each reply frame published, in flight, and buffered in your
browser, and the playhead. A reader watches packets cross before the AI
recognizes them as words, sees how far ahead MoQ holds the reply in memory, and
can tell at a glance where a slow reply spent its time, which answers "is the
delay MoQ?".

Frames that arrived later than a typical WebRTC jitter buffer waits turn red:
an estimate from the MoQ arrivals, not a measured WebRTC receiver. Nothing is
simulated or injected.

## Plan

Decided 2026-10-23:

- **One shared wall-clock axis**, not per-direction panels or strips under
  words: every lane on the same time, so a frame's capture, arrival, and
  recognition line up vertically. A sliding window around now; buffered reply
  audio sits to the right of the playhead.
- **All at once.** Build the page after the agent-side and reply-side data
  exist, rather than shipping lanes piecemeal.
- **Real data only**, and keep the WebRTC mark: a frame is late for WebRTC
  when its arrival spread exceeds a typical WebRTC jitter target. Measure
  lateness as arrival minus media timestamp, relative to the smallest seen,
  so it needs no clock agreement. Choose and cite the target when
  implementing.
- **Draw it like the post.** Reuse `src/components/voice/`'s colors and
  vocabulary (buffered, consumed, waiting, lost; packets crossing a network
  band; words over their audio) so the live view reads as the post's diagrams
  come alive.

Sources, as of planning:

- Browser, available now: `@moq/publish`'s captured audio frames;
  `@moq/watch`'s audio `buffered` ranges and playback `timestamp`; the
  connection's PROBE RTT; RTVI turn events and per-service `metrics` on the
  transcript track.
- Reply-side arrivals: `@moq/watch`'s per-frame `arrivals()`, which also
  yields a gap item where media will never arrive. Draw a frame as lost only
  from such a gap; until then a missing frame is in flight.
- Agent side: `voice.json` on the response broadcast, extended to carry
  everything that happens on the agent with its time.

The browser cannot see its own QUIC send buffer. Show "captured, not yet at
the agent" from the agent's arrivals instead.

Placing agent events on the browser's axis needs a clock offset. Both
directions carry media timestamps with send and arrival times, so an
NTP-style estimate from the minimum transit each way is a good starting point.
The two minimum transits should sum to about the PROBE RTT, and their
asymmetry bounds the error; show agent events only once that bound is small.

Build on [moq-dev/moq.dev#194](https://github.com/moq-dev/moq.dev/pull/194)
(transcript auto-scroll, steadier cat) if it is still open.

## Required

- [The voice agent publishes the full voice.json](/quest/m1/voice-timeline-track.md) - the agent's side of the timeline
