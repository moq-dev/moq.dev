Read `README.md` for the three sites (moq.dev, moq.pub, moq.watch), setup, and the broadcast URL scheme.

# Rules

- Never deploy to any environment, including staging, without the user's explicit permission for that deployment. A coding task or quest does not authorize a deploy.
- Protocol, player, and publisher fixes belong upstream in moq-dev/moq (`@moq/publish`, `@moq/watch`, ...). Fix them there first, then bump the `moq` submodule here; the `@moq/*` packages build from it.

# Development

PRs target `main`.
Run `just fix` before committing. `just check` alone is not verification: look at the change in the dev server (`just dev`, `just dev-pub`, or `just dev-watch`).
Hand-drawn art ships as SVG: `just trace` the drawn PNG, compare the two, then commit only the SVG.

Quests: before starting work, run `quest context` and `quest guide`, and follow both.
The `quest` binary comes from the moq-dev/quest flake input and serves the quest skills; change them upstream and bump the input.
