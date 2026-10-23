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

- The `@moq` packages build from the `moq` submodule, and its `worklet()`
  Vite plugin already emits each worklet and worker to `assets/<name>.js` in
  every site's build. Point `assets()` there rather than copying files, and
  check that the dev server serves them too. `vite-plugin-static-copy` is
  then an unused devDependency to drop.
- Call `assets()` once, before any element or player starts. The sites
  import the element entries, so import `assets` from the package root.
- Verify in a browser that audio plays and publishes, and that the network
  panel shows the worklets and the capture worker (Firefox) loading from
  `/moq/`, not `blob:`.
