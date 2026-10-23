# [S] Lean AGENTS.md

## Goal

AGENTS.md holds only the rules and conventions that steer agents, in the shape
of [moq-dev/moq's root AGENTS.md](https://github.com/moq-dev/moq/blob/main/AGENTS.md).
The repository description leaves it: the site table, command list, tech stack
and version pins, architecture, URL scheme, deployment, and tips. Stale facts
like the Bun version stop drifting because they are no longer written down.

## Plan

- Delete rather than relocate. The README already explains the three sites and
  the URL scheme, and the two easy-to-break pitfalls are comments next to the
  code (`sites/*/wrangler.jsonc`, `sites/lib/worker.ts`). If something
  load-bearing turns out to be missing, add it as a comment beside that code.
- The Bun pin-sync rule goes too. Make the flake's Bun assertion failure name
  both pins (nixpkgs and `packageManager` in `package.json`), so the guidance appears exactly when CI catches the drift.
- Read `PROMPTING.md` first. `CLAUDE.md` is a symlink to `AGENTS.md`.
