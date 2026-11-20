# rind post data

The charts in `src/pages/blog/rind.mdx` read `src/components/rind/data/*.json`.
Each file records its source: the rind commit, host, CPU, and date.
Refresh them all just before posting, from rind main after its latest report collection, then run `just fix`.

## Build cost and libraries

Both come from a rind checkout at the commit being announced, after its nightly
`bench` run and `admin/bench-report` collection:

```bash
bun tools/rind/refresh.ts build <rind>       # build.json: benchmarks/data/<host>.json's build_cost
bun tools/rind/refresh.ts libraries <rind>   # libraries.json: every library's times and proofs, labeled by admin/bench-report (needs python3)
```

`build` leaves out a host whose report skipped its build cost (a busy host does) and says so; rerun that host's report to bring it back.
`libraries` charts the four hosts in `refresh.ts`'s `HOSTS`, Apple M4 included, timing rind on Mac with DIT held across each batch.
`libraries` reads end-to-end proofs from `verified.toml`. Partial proofs, where a proven routine does the core math under unproven glue, live in `refresh.ts`'s `PARTIAL`, by architecture; recheck them against each library's source for each architecture when a locked version changes.

## Runtimes

Release-build Bun twice from the same commit, without and with rind (the prototype branch), on an idle host.
Bun's flake ships a rustc whose LLVM trails its clang, and no `nasm`; inside `nix develop`, set `BUN_TOOLCHAIN_RUST` to the nightly in Bun's `rust-toolchain.toml` (rust-overlay has it) and put `nasm` on `PATH` before `bun run build:release`.
Then, there, from this repository:

```bash
tools/rind/runtimes.sh <core> <bun-base>/build/release/bun <bun-rind>/build/release/bun <out>
```

Copy `<out>` back, add the two Bun commits and the rind release the prototype builds on (0.2.1 or later) to its `source.json` under `bun`, then:

```bash
bun tools/rind/refresh.ts runtimes <out> <out>/*.tsv
```

## AI tally

`tally.json` contains the Opus-only subset of the final tally in [moq-dev/rind#499](https://github.com/moq-dev/rind/pull/499), with a `source` naming where it came from.
The maintainer fixed November 7, 2026, at 14:32:11 PT as the stopping point. Keep that cutoff when refreshing the other charts.
The receipt's usage, tokens, and list-price total cover only Claude Opus 5.5. Agent hours cover Claude Code sessions; human hours retain the tally's maintainer estimate.
