# m1: next

## Goal

The demos after m0: a Voice AI demo you can talk to, which shows live how MoQ
moves and buffers the call and why it beats WebRTC for voice agents.

## Required

- [Drain the voice goodbye instead of waiting](/quest/m1/voice-goodbye-drain.md) - hanging up closes through the draining `close()`, not a fixed wait
- [The voice agent publishes the full voice.json](/quest/m1/voice-timeline-track.md) - condition: the agent's side of the call, timed, on wtf
