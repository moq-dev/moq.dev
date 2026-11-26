# [S] Deploy staging from main and live from release

## Goal

Every push to `main` deploys moq.dev, moq.pub and moq.watch to staging from
GitHub Actions, and every push to a protected `release` branch deploys them
live, so production changes only when `release` moves. Today every deploy is
a manual `just deploy [live]` from a laptop's wrangler login, so merged work
sits undeployed until someone remembers.

Non-goals: what each mode builds (the unreleased-route gate from
[#300](https://github.com/moq-dev/moq.dev/pull/300) stays, so `/huh` ships to
staging and not live), and moq.pro's deploys.

## Plan

Decided 2026-11-25 (maintainer, `/quest-run` then `/quest-plan`):

- ✅ Staging on every push to `main`, live on every push to `release`
  (rejected: live behind a protected-environment approval on `main`'s
  workflow; staging only; dropping it). This keeps the intent of
  [#102](https://github.com/moq-dev/moq.dev/pull/102), which removed the old
  live-on-`main` workflow: production still moves only on a person's merge.
- ✅ `main` reaches `release` through a PR that the maintainer merges, and
  backports go in as PRs onto `release`, as in moq.pro (rejected: a
  workflow_dispatch that fast-forwards `release`; direct pushes).
- ✅ Reword the AGENTS.md deploy rule to: "Merging to main deploys staging.
  Ask before merging into or pushing to `release`, or running
  `just deploy`." (rejected: keeping staging behind explicit permission,
  which defeats deploy-on-push).

Recommendations:

- One workflow on `push` to `main` and `release` that runs the `just deploy`
  steps with `staging` or `live`, so the laptop path and CI share one recipe.
  Use one GitHub environment per target, each limited to its branch, holding
  the Cloudflare token. A GitHub-hosted runner fits a short deploy job.
  Serialize runs per environment and don't cancel one mid-upload.
- Credentials: `bws` holds `cloudflare-admin-token`, which can reach the
  `moq.dev` account (`dd618f5d…`, the `account_id` in `wrangler.jsonc`).
  Try minting an account-owned token with it, scoped to deploying these
  Workers and their custom domains, and store that token as the environments'
  secret. If the admin token can't mint one, add a `Maintainer:` item naming
  the exact scopes.
- Create `release` at the commit live runs now; the 2026-11-25 deploy was
  `e67ab91`. Protect it the way moq.pro's `release` is protected, through
  the org rulesets in dotfiles' `bin/repo-settings`, not per repo.
- `pr.yml` checks only PRs into `main`; make it check PRs into `release` too.
- Update README's Deploy section to match.
- The README says to deploy moq.pro's `try` project before these clients.
  Staging may now briefly run a client ahead of moq.pro staging; that's
  acceptable. The release PR is where the maintainer checks the moq.pro side
  before going live.
- Verify each half on its real surface: a merge to `main` updates
  new.moq.dev, and a release PR's merge updates moq.dev. Both need the
  maintainer's merge.
