# m0: immediate priorities

## Goal

The agent context is lean and the checks cover what they claim, passing on a
developer's machine.

## Required

- [Lean AGENTS.md](/quest/m0/lean-agents-md.md) - agent context keeps only rules and conventions, no repo description
- [Biome passes locally](/quest/m0/biome-local.md) - `just check` passes with Claude Code's local files present
- [Type-check .astro files](/quest/m0/astro-typecheck.md) - `just check` covers `.astro` via the TypeScript 7.1 content mapper
