# m1: next

## Goal

The demos after m0: a Voice AI demo you can talk to, which shows why MoQ beats
WebRTC for voice agents.

## Required

- [An @moq/watch release ships per-frame arrivals](/quest/m1/watch-arrivals-release.md) - condition: the reply-side data is on npm
- [The voice agent publishes voice.json](/quest/m1/voice-timeline-track.md) - condition: word timings and prompt-side arrivals on wtf
- [Voice buffers under the words](/quest/m1/voice-buffers.md) - the live transcript draws each word's audio frames, marking the ones late for a typical WebRTC jitter buffer
