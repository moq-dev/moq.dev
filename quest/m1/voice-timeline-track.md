# [XS] The voice agent publishes voice.json

## Goal

The moq.pro demo agent on wtf publishes a `voice.json` track on each session's
response broadcast, carrying word timings for both directions and the arrival
time of each request audio frame.

This quest tracks a condition outside the repository. When it holds, delete
this quest and every `Required` entry that links it.

## Plan

moq.pro tracks the track as
[its own quest](https://github.com/moq-dev/moq.pro/blob/main/quest/m1/voice-timeline.md),
which owns its schema. Check by subscribing to it during a staging session.
