Read `README.md` for the three sites (moq.dev, moq.pub, moq.watch), setup, and the broadcast URL scheme.

# Required

- Dig into the root cause and fix it at the source. Never work around a fixable bug with a retry, sleep, or timeout.
- Fail loud and early. Error on unsupported or malformed input rather than warn and continue.
- Reproduce bugs before fixing them. Land each fix with a regression test that fails without it, when one is easy.
- Keep the PR focused. No unrelated refactors, formatting churn, or drive-by changes; split when in doubt.
- Refactor aggressively for long-term maintainability, but re-evaluate the direction as you learn.
- Propose a course change, even suggest abandoning a PR, rather than finish a half-solution.
- When a decision is the maintainer's (design, copy, naming, scope), ask with 2-3 options and a recommendation.
- Never deploy to any environment, including staging, without the user's explicit permission for that deployment. A coding task or quest does not authorize a deploy.
- Protocol, player, and publisher fixes belong upstream in moq-dev/moq (`@moq/publish`, `@moq/watch`, ...). Fix them there first, then bump the `moq` submodule here; the `@moq/*` packages build from it.
- Never edit an `AGENTS.md`, `PROMPTING.md`, or skill without being prompted. Read `PROMPTING.md` before editing one or instructing other agents via context, memory, plans, or reviews.
- No em dashes in code, comments, or agent-written prose.
- Match the existing conventions, patterns, and naming when possible.
- Fix any outdated docs and comments inline; don't add a separate PR for it.
- Add the AI marker `(Written by <model>)` to any posts on GitHub, excluding commit messages that contain `Co-Authored-By:` trailers.
- Any AI comments may be challenged, and not confused with human maintainers.

# Guidelines

- Comments should explain the non-obvious why, and never the history.
- Inline simple helpers.
- Question whether functionality is needed at all before adding it.
- Deleting code is better than adding code.
- Prefer the simple solution.
- New dependencies use the newest stable version.
- Say it once, in the fewest words that hold up.
- Suggest follow up sessions and quests when finished, interactively prompting the user.
- Prefer a quest over a GitHub issue for work needing durable scope.
- Try to do stuff asynchronously. ex. ask about follow-ups while checks run.
- If the core problem is addressed, ship it instead of spinning your wheels on meaningless revisions.

# Development

PRs target `main`. Before starting, `git fetch origin` and set the upstream to the base branch.
`git stash` is one stack shared by every worktree; set work aside with a commit instead.
Use the Nix dev shell (direnv, or `nix develop --command just ...`) so tooling matches CI.
Run `just fix` before committing. `just check` alone is not verification: look at the change in the dev server (`just dev`, `just dev-pub`, or `just dev-watch`).
Hand-drawn art ships as SVG: `just trace` the drawn PNG, compare the two, then commit only the SVG.
Quests: before starting work, run `quest guide` and follow it. The `quest` binary comes from the kixelated/quest flake input and serves the quest skills; change them upstream and bump the input.
