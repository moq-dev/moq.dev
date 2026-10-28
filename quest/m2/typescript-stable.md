# [XS] Move TypeScript to 7.1 stable

## Goal

Once TypeScript 7.1 ships stable, `package.json` moves `typescript` from the
exact `7.1.0-beta` pin to `^7.1.0`, and `just check` still type-checks the
`.astro` files through `@astrojs/ts-content-mapper`.

This quest waits on a condition outside the repository: it is ready to
implement once `npm view typescript dist-tags.latest` reports a 7.1.x version.

## Plan

Decided 2026-10-28 in planning:

- **Caret once stable.** `^7.1.0`, like most devDependencies, so the weekly
  Dependabot bun group keeps it current. The exact beta pin exists only
  because a caret on a prerelease (`^7.1.0-beta`) resolves to nightlies:
  `7.1.0-dev.*` sorts above `7.1.0-beta`.
- **Dependabot skips the nightlies until then.** `.github/dependabot.yml`
  ignores `typescript` versions `>=7.1.0-dev, <7.1.0` on the bun ecosystem.
  Delete that ignore entry in the same PR as the bump; a stable pin never
  gets prerelease proposals.
- **m2.** Housekeeping that waits behind the demos.

Check that `just check` still reports an error injected into an `.astro`
file, then remove it, the way [moq-dev/moq.dev#202](https://github.com/moq-dev/moq.dev/pull/202)
verified the mapper.
