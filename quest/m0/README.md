# m0: immediate priorities

## Goal

The live sites run the current `@moq/*` packages: moq.watch plays from draft-18
relays, moq.pub mints private `try` broadcasts instead of `/anon` names, and
the sites host the player worklets once a release ships `assets()`.

## Plan

As of 2026-10-09, live moq.pub still redirects a bare `/` to an invented
`/anon/...` name: the `try` integration (#136) passed staging but never
deployed live. The live deploy waits for the bump, so one deploy carries both.

## Required

- [Bump @moq to the draft-18 release](/quest/m0/moq-bump.md) - moq.watch decodes LARGEST_OBJECT and plays from draft-18 relays
- [Deploy live](/quest/m0/deploy-live.md) - the maintainer ships the bump and the try demos to moq.dev, moq.pub, and moq.watch
- [A release ships assets()](/quest/m0/assets-release.md) - the hosted worklet files exist on npm to copy
- [Dogfood hosted worklets](/quest/m0/dogfood-assets.md) - the sites serve the @moq worklets and workers themselves
