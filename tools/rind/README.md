# rind post data

The charts in `src/pages/blog/rind.mdx` read `src/components/rind/data/*.json`.
Each file records its source: the rind commit, host, CPU, and date.
Refresh them all just before posting, after rind 0.2.0 and its QUIC quests land, then run `just fix`.

## Proofs, build cost, and libraries

All three come from a rind checkout at the commit being announced, after its nightly
`bench` run and `admin/bench-report` collection:

```bash
bun tools/rind/refresh.ts proofs <rind>      # proofs.json: ALGORITHMS.md, verified.toml, tiers.json
bun tools/rind/refresh.ts build <rind>       # build.json: benchmarks/data/<host>.json's build_cost
bun tools/rind/refresh.ts libraries <rind>   # libraries.json: every library's QUIC seal times and proofs
```

`libraries` reads end-to-end proofs from `verified.toml`. Partial proofs, where a proven routine does the core math under unproven glue, live in `refresh.ts`'s `PARTIAL`; recheck them against each library's source when a locked version changes.

## Runtimes

Release-build Bun twice from the same commit, without and with rind (the prototype branch), on an idle host.
Then, there, from this repository:

```bash
tools/rind/runtimes.sh <core> <bun-base>/build/release/bun <bun-rind>/build/release/bun <out>
```

Copy `<out>` back, add the two Bun commits to its `source.json` under `bun`, then:

```bash
bun tools/rind/refresh.ts runtimes <out> <out>/*.tsv
```

## AI tally

`tally.json` is the chart JSON from rind's `quest/m1/ai-usage` tally ([moq-dev/rind#400](https://github.com/moq-dev/rind/pull/400)), with a `source` naming where it came from.
That quest reruns the tally just before the post goes out; paste its new chart JSON in by hand and update `source`.
