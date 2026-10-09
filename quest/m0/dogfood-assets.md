# [S] Dogfood hosted worklets

## Goal

moq.dev and the `sites/pub` and `sites/watch` Vite sites host the `@moq`
worklet and worker files and call `assets()`, so the hosted path gets real
traffic. CSP is out of scope: no site adds a policy.

## Plan

Moved from [moq's quest](https://github.com/moq-dev/moq/blob/main/quest/m1/dogfood-assets.md),
which keeps the moq.pro dashboard half (2026-10-09). The maintainer wants
hosted mode dogfooded, not just the pin bump.

Guidance:

- Copy `node_modules/@moq/{watch,publish}/assets/*` into a served `/moq/`
  directory at build time. `vite-plugin-static-copy` is already an unused
  devDependency; Astro takes it through `vite.plugins`.
- Call `assets("/moq/")` once, before any element or player starts. The sites
  import the element entries, so import `assets` from the package root.
- Verify in a browser that audio plays and publishes, and that the network
  panel shows the worklets and the capture worker (Firefox) loading from
  `/moq/`, not `blob:`.

## Required

- [A release ships assets()](/quest/m0/assets-release.md) - the hosted files exist on npm to copy
- [Bump @moq to the draft-18 release](/quest/m0/moq-bump.md) - lands the API break first, so this only adds assets()
