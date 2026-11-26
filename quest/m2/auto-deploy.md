# [XS] Deploy staging from main and live from release

## Goal

Every push to `main` deploys moq.dev, moq.pub and moq.watch to staging from
GitHub Actions, and every push to a protected `release` branch deploys them
live, so production changes only when `release` moves.

Non-goals: what each mode builds (the unreleased-route gate from
[#300](https://github.com/moq-dev/moq.dev/pull/300) stays, so `/huh` ships to
staging and not live), and moq.pro's deploys.

## Plan

[#305](https://github.com/moq-dev/moq.dev/pull/305) added
`.github/workflows/deploy.yml` and
[kixel-ai/dotfiles#362](https://github.com/kixel-ai/dotfiles/pull/362) the
`release` branch standard, and the environments, their tokens and the
`release` branch were set up on 2026-11-25. What remains is protecting
`release` under `Waiting`, then checking each half on its real surface: a
merge to `main` updates new.moq.dev, new.moq.pub and new.moq.watch, and a
release PR's merge updates moq.dev, moq.pub and moq.watch. Delete this quest
once both have deployed.

## Waiting

- Maintainer: once
  [kixel-ai/dotfiles#362](https://github.com/kixel-ai/dotfiles/pull/362)
  merges, run `repo-settings apply`, which protects `release` and allows merge
  commits; an agent may not change live repository settings. Check with
  `repo-settings check`, which should print nothing for moq-dev/moq.dev.
