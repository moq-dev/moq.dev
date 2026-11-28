# [S] Re-review PRs merged under quest v0.27.0-v0.29.0

## Goal

Re-review non-bot PRs merged in `moq-dev/moq.dev` while `quest` ran the flat `0/1/2`
risk-tier review policy (commit `556d816002` / `v0.27.0` through `v0.29.0`,
before `v0.30.0`'s 7-rung `(size + risk)` reviewer ladder from
https://github.com/kixel-ai/quest/pull/957), triage any real bugs still present
on `main`, and fix straightforward ones or file follow-up quests (linking the
originating PR under `## Plan` and recording `## Caused by` in every merged
fixing PR's body).

Under `quest` `v0.27.0`–`v0.29.0`, PRs were under-reviewed relative to the
`v0.30.0` ladder in four ways:

1. `low` PRs received zero local review (`passed with no local reviewer`)
   instead of Sol (`medium`/`high`/`xhigh`, or Sol + Opus on `L`/`XL`).
2. `XS` and `S` `medium` PRs ran `sol("low")` / `sol("medium")` instead of
   `sol("high")` / `sol("xhigh")`.
3. `M`, `L`, and `XL` `medium` PRs ran only 1 seat (Sol alone) instead of 2
   seats (Sol `xhigh` + Opus `medium`/`high`).
4. `XS`, `S`, and `M` `high` PRs ran Sol below `xhigh` (`low`/`medium`/`high`).

Non-goals: re-reviewing `moq-bot` pin bumps, pure `quest/` plan deletions, or
diffs already superseded or reverted on `main`.

## Plan

Decided 2026-11-27 (maintainer): file re-review quests across active Quest
repositories scoped by the `quest` versions used during the `0/1/2` window.

Repository window:

- `quest` versions observed in `moq-dev/moq.dev`: `556d816002` (#294), `v0.27.0` (#295).
- Sole lower bound: PR #294 (`chore(nix): bump quest to 556d816002`, merged `2026-11-25T07:42Z`).
- Volume snapshot at filing: 13 non-bot PRs merged since `v0.27.0` (plus any between #294 and #295).
- Check both `quest review` commit statuses across each PR's commits and `## Review` PR bodies.

Steps:

1. Enumerate every non-bot PR merged in `moq-dev/moq.dev` starting at
   PR #294 (`chore(nix): bump quest to 556d816002`, merged `2026-11-25T07:42Z`) and continuing through `chore: bump quest to v0.30.0` and the last confirmed reviewer-host upgrade to `v0.30.0` (classifying PRs near both transitions by their recorded review runs). At cutover, also record every open PR carrying reviews from any in-scope flat-policy pin (`556d816002` or `v0.27.0`–`v0.29.0`) and keep it on the audit list through merge until recorded reviews verified to cover the merged diff satisfy every required seat and effort of its final `v0.30.0` rung.
2. For each enumerated PR, apply `v0.30.0`'s risk rules to its merged diff
   (including the rule that any change adding or editing lines under `quest/`
   is at least `medium`, even if historically classified `low` before
   `v0.28.1`) to determine its target `v0.30.0` `(size, risk)` rung:
   - Rung 0 (`XS low`): Sol `medium` (or fallback Opus `medium`)
   - Rung 1 (`XS med`, `S low`): Sol `high` (or fallback Opus `medium`)
   - Rung 2 (`XS high`, `S med`, `M low`): Sol `xhigh` (or fallback Opus `high`)
   - Rung 3 (`S high`, `M med`, `L low`): Sol `xhigh` + Opus `medium`
   - Rung 4 (`M high`, `L med`, `XL low`): Sol `xhigh` + Opus `high`
   - Rung 5 (`L high`, `XL med`): Sol `xhigh` + Opus `high`
   - Rung 6 (`XL high`): Sol `xhigh` + Opus `xhigh`

   Inspect the PR's `quest review` commit statuses, `## Review` body record,
   and Kixel Quest review runs, using each run's recorded base and head to
   credit only runs that covered the merged diff (or an identical diff).
   Exclude only `moq-bot` pin bumps, pure `quest/` plan deletions (keep active
   quest/plan additions and edits), diffs already reverted or superseded on
   `main`, and any PR whose merged diff already has qualifying coverage at its
   target rung (from recorded runs or equivalent prior replays).
3. Schedule every PR retained by step 2 for the exact missing reviewer seat(s)
   and/or effort upgrade its `v0.30.0` rung requires (read-only against its
   merged diff). Use the following priority order solely to order the queue,
   never to drop a retained PR or lower its required effort:
   - First: under-effort `high`-risk PRs (`XS`/`S`/`M` `high` needing Sol `xhigh`, or any missing second seat).
   - Second: zero-review (`passed with no local reviewer`) PRs.
   - Third: under-effort `XS`/`S` `medium` PRs.
   - Fourth: single-seat `M`/`L`/`XL` `medium` and `L`/`XL` `low` PRs missing their second seat or Sol `xhigh`.
4. Verify every reported `high` or `medium` finding against current `main`,
   drop false positives and already-fixed issues, and either fix small clear
   bugs directly (with tests) or file follow-up quests in `quest/` citing the
   originating PR under `## Plan`. Put `## Caused by` in the body of every
   merged PR that lands a fix (both direct fixes and fixes for follow-up
   quests), where Quest's breakage tracker reads it.

## Waiting

- kixel-ai/quest: `v0.30.0` (the 7-rung reviewer ladder from https://github.com/kixel-ai/quest/pull/957) is published, this repository has merged `chore: bump quest to v0.30.0`, and every reviewer host's installed `quest` binary is confirmed at `>= v0.30.0`. Check `flake.lock` and `quest --version` on each reviewer host.
