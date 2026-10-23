# [XS] The voice agent publishes the full voice.json

## Goal

The moq.pro demo agent on wtf publishes a `voice.json` track on each session's
response broadcast carrying the agent's whole side of the call, each with its
time: request frame arrivals, VAD and turn decisions, word spans and when STT
recognized them, LLM and TTS activity, and each reply frame as published.

This quest tracks a condition outside the repository. When it holds, delete
this quest and every `Required` entry that links it.

## Plan

moq.pro owns the schema and the Pipecat fork hooks behind it:

- [The demo agent publishes voice.json](https://github.com/moq-dev/moq.pro/blob/main/quest/m2/voice-timeline.md) -
  version 1 (arrivals and word spans) merged in
  [moq-dev/moq.pro#2319](https://github.com/moq-dev/moq.pro/pull/2319) and
  awaits its wtf proof
- [voice.json carries the agent's whole pipeline](https://github.com/moq-dev/moq.pro/blob/main/quest/m2/voice-timeline-pipeline.md) -
  the rest

Check by subscribing to the track during a staging session.
