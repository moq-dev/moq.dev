# m1: next

## Goal

The demos after m0: a Voice AI demo you can talk to, which shows live how MoQ
moves and buffers the call and why it beats WebRTC for voice agents.

## Required

- [An @moq/watch release ships per-frame arrivals](/quest/m1/watch-arrivals-release.md) - condition: the reply-side data is on npm
- [The voice agent publishes the full voice.json](/quest/m1/voice-timeline-track.md) - condition: the agent's side of the call, timed, on wtf
- [A live timeline of the voice call](/quest/m1/voice-buffers.md) - every frame, buffer, VAD decision, and model step on one axis, marking frames late for a typical WebRTC jitter buffer
