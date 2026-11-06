# rind post data

The charts in `src/pages/blog/rind.mdx` read `src/components/rind/data/*.json`.
Each file records its source: the rind commit, host, CPU, and date.
Refresh them all just before posting, after rind 0.2.0 and its QUIC quests land, then run `just fix`.

## Proofs and build cost

Both come from a rind checkout at the commit being announced, after its nightly
`bench` run and `admin/bench-report` collection:

```bash
bun tools/rind/refresh.ts proofs <rind>   # proofs.json: README's Algorithms, verified.toml, tiers.json
bun tools/rind/refresh.ts build <rind>    # build.json: benchmarks/data/<host>.json's build_cost
```

## QUIC

rind's bench-report doesn't time QUIC's sizes, so `quic.sh` does, on one pinned core of an idle host.
On each host:

```bash
tools/rind/quic.sh <rind> <core> <out>
```

Copy `<out>` back, then:

```bash
bun tools/rind/refresh.ts quic "Arrow Lake" <out> <out>/rounds/*/criterion
```

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

`tally.json` is placeholder data until rind's `quest/m1/ai-usage` lands.
Copy its numbers in by hand and set `placeholder` to false.
