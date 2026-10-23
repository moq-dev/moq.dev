# m1: next

## Goal

The demos after m0: a Voice AI demo you can talk to, which shows live how MoQ
moves and buffers the call and why it beats WebRTC for voice agents.

## Required

- [Drain the voice goodbye instead of waiting](/quest/m1/voice-goodbye-drain.md) - hanging up closes through the draining `close()`, not a fixed wait
- [The voice agent publishes the full voice.json](/quest/m1/voice-timeline-track.md) - condition: the agent's side of the call, timed, on wtf
- [A live timeline of the voice call](/quest/m1/voice-buffers.md) - every frame, buffer, VAD decision, and model step on one axis, marking frames late for a typical WebRTC jitter buffer
