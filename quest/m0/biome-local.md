# [XS] Biome passes with Claude Code's local files

## Goal

`just check` passes on a checkout where Claude Code has written its per-user
`.claude/settings.local.json`, and Biome stops printing warnings for files it
cannot handle.

## Plan

- Gitignore `.claude/settings.local.json`. It is untracked today, so Biome
  formats it and fails.
- Drop Markdown from Biome's `files.includes`. Biome has no Markdown handler, so
  every tracked `SKILL.md` prints a `files/missingHandler` warning.
