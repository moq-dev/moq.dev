Read `README.md` for the three sites (moq.dev, moq.pub, moq.watch), setup, and the broadcast URL scheme.

# Rules

- Never deploy to any environment, including staging, without the user's explicit permission for that deployment. A coding task or quest does not authorize a deploy.
- Protocol, player, and publisher fixes belong upstream in moq-dev/moq (`@moq/publish`, `@moq/watch`, ...). Fix them there first, then bump the `moq` submodule here; the `@moq/*` packages build from it.

# Development

PRs target `main` and land as squash merges.
Dependabot PRs need no review once CI passes.
Verify in the dev server (`just dev`, `just dev-pub`, `just dev-watch`).
Hand-drawn art ships as SVG: `just trace` the drawn PNG, compare the two, then commit only the SVG.

Quests: before any work, run `quest context` and follow it, unless this session already holds its rules.
The `quest` binary comes from the moq-dev/quest flake input and serves the quest skills; change them upstream and bump the input.
