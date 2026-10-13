# [XS] An @moq/watch release ships per-frame arrivals

## Goal

The newest `@moq/watch` on npm exposes the per-frame `arrivals()` handle on
the audio and video decoders, and moq.dev builds against it.

This quest tracks a condition outside the repository. When it holds, bump
`@moq/watch` here, then delete this quest and every `Required` entry that
links it.

## Plan

moq shipped the handle in
[moq-dev/moq#5311](https://github.com/moq-dev/moq/pull/5311).
Check `npm view @moq/watch version` and its type definitions for
`Audio.Decoder.arrivals()` and `Watch.Arrival`.
