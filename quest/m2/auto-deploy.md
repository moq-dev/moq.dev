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
`release` branch standard. What remains is the one-time repository setup
under `Waiting`, then checking each half on its real surface: a merge to
`main` updates new.moq.dev, new.moq.pub and new.moq.watch, and a release PR's
merge updates moq.dev, moq.pub and moq.watch. Delete this quest once both
have deployed.

## Waiting

- Maintainer: create the `staging` and `live` environments, each limited to
  its branch and holding a `CLOUDFLARE_API_TOKEN` secret minted from
  `cloudflare-admin-token` with the scopes in
  [#305](https://github.com/moq-dev/moq.dev/pull/305)'s body; an agent may
  not change live repository settings. Check with
  `gh api repos/moq-dev/moq.dev/environments --jq '.environments[].name'`.
- Maintainer: create `release` at `e67ab91` (live's 2026-11-25 deploy) and
  run `repo-settings apply` once dotfiles' standard merges, which protects it
  and allows merge commits. Check with `repo-settings check`.
