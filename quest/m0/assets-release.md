# [XS] A release ships assets()

## Goal

The newest `@moq/watch` and `@moq/publish` on npm export `assets()` and ship
their worklet and worker files under `assets/`.

This quest tracks a condition outside the repository. When it holds, delete
this quest and every `Required` entry that links it.

## Plan

As of 2026-10-09 moq `main` carries `assets()` (moq-dev/moq#4518) but the
newest releases (`@moq/watch` 0.6.2, `@moq/publish` 0.5.2) lack it. Check
`npm view @moq/watch version` for a newer version, then confirm its `exports`
lists `./assets/*`. moq tracks the release as
[its own condition quest](https://github.com/moq-dev/moq/blob/main/quest/m1/assets-release.md).
