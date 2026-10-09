# [XS] An @moq/watch release ships per-frame arrivals

## Goal

The newest `@moq/watch` on npm exposes a signal with a bounded window of
recent per-frame arrivals for the audio and video decoders, and moq.dev
builds against it.

This quest tracks a condition outside the repository. When it holds, bump
`@moq/watch` here, then delete this quest and every `Required` entry that
links it.

## Plan

moq tracks the signal as
[its own quest](https://github.com/moq-dev/moq/blob/main/quest/m1/watch-arrivals.md).
Check `npm view @moq/watch version` and its type definitions.
