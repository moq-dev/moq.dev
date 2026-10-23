# [XS] The voice agent publishes the full voice.json

## Goal

The moq.pro demo agent on wtf publishes a `voice.json` track on each session's
response broadcast carrying the agent's side of the latest exchange, each with
its time: request frame arrivals, VAD and turn decisions, word spans and when
STT recognized them, LLM and TTS activity, and each reply frame as published.
It is a moq-json Window holding the latest statement on each side.

This quest tracks a condition outside the repository. When it holds, delete
this quest and every `Required` entry that links it.

## Plan

moq.pro owns the schema and the Pipecat fork hooks behind it:

- [The demo agent publishes voice.json](https://github.com/moq-dev/moq.pro/blob/main/quest/m2/voice-timeline.md) -
  version 1 (arrivals and word spans) merged in
  [moq-dev/moq.pro#2319](https://github.com/moq-dev/moq.pro/pull/2319) and
  awaits its wtf proof
- The rest is [moq-dev/moq.pro#2877](https://github.com/moq-dev/moq.pro/pull/2877).
  Its Window needs moq-json's Window in moq's FFI bindings first, since a
  Stream stops at 8,192 records, about 164 s into a call.

Check by subscribing to the track during a staging session the maintainer
calls.
