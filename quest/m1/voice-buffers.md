# [M] Voice buffers under the words

## Goal

Under each word of the live `/voice` transcript, a strip draws that word's
audio frames from real measurements: when each arrived against when it plays.
A frame that arrived later than a WebRTC jitter buffer would have waited
turns red, because WebRTC would have concealed or skipped it. Both
directions: your prompt as the agent received it, and the agent's reply as
your browser received it. Nothing is simulated or injected.

## Plan

Decided 2026-10-09:

- **Real data only.** No "network blip" button and no injected loss. On a
  clean network the strips are all on time, and the reply strip still shows
  how far ahead the agent sent its audio.
- **A WebRTC deadline line, computed from the real arrivals.** A frame is
  "late for WebRTC" when its arrival spread exceeds a typical WebRTC jitter
  target. Measure lateness as arrival minus timestamp, relative to the
  smallest one seen, so the sender's and receiver's clocks never need to
  agree. Choose and cite the target when implementing.
- **Draw it like `src/components/voice/`.** Reuse its segment colors and
  word layout on a sliding window of live, append-only data, in place of its
  fixed axis and simulated `FLIGHT`.
- **Reply side** reads `@moq/watch`'s per-frame arrival signal (a bounded
  window of recent `{timestamp, arrival}` per frame, with late and skipped
  marks) and maps frames to words with the agent's TTS word timings.
- **Prompt side** reads the agent's `voice.json` track on the response
  broadcast: word timings from STT and the arrival time of each request
  audio frame.

## Required

- [Voice AI demo page](/quest/m1/voice-page.md) - the page and transcript this draws under
- [An @moq/watch release ships per-frame arrivals](/quest/m1/watch-arrivals-release.md) - the reply-side data
- [The voice agent publishes voice.json](/quest/m1/voice-timeline-track.md) - word timings and the prompt-side data
