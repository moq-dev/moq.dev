#!/usr/bin/env bash
# Times runtimes.mjs under Node, Deno, stock Bun, and Bun on rind on one pinned core, alternating five
# rounds so drift hits every runtime alike. `tools/rind/runtimes.sh <core> <bun> <bun-on-rind> <out>`,
# where the two Buns are release builds of the same commit, without and with rind.
# Then, here: `bun tools/rind/refresh.ts runtimes <out> <out>/*.tsv`.
set -euo pipefail
core="$1" bun="$(realpath "$2")" rind="$(realpath "$3")" out="$(mkdir -p "$4" && cd "$4" && pwd)"
script="$(dirname "$(realpath "$0")")/runtimes.mjs"
# A directory with no package.json, so Deno doesn't pick up a workspace.
work="$(mktemp -d)" && cp "$script" "$work/" && cd "$work"
node="$(nix build --no-link --print-out-paths nixpkgs#nodejs_24)/bin/node"
deno="$(nix build --no-link --print-out-paths nixpkgs#deno)/bin/deno"

load_before="$(cut -d' ' -f1 /proc/loadavg)"
for round in 1 2 3 4 5; do
	taskset -c "$core" "$node" runtimes.mjs Node > "$out/$round-node.tsv"
	taskset -c "$core" "$deno" run runtimes.mjs Deno > "$out/$round-deno.tsv"
	taskset -c "$core" "$bun" runtimes.mjs Bun > "$out/$round-bun.tsv"
	taskset -c "$core" "$rind" runtimes.mjs "Bun on rind" > "$out/$round-rind.tsv"
done
rm -r "$work"

cat > "$out/source.json" <<JSON
{
	"cpu": "$(sed -n 's/^model name\t*: //p' /proc/cpuinfo | head -1)",
	"core": $core,
	"date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
	"load": [$load_before, $(cut -d' ' -f1 /proc/loadavg)],
	"logical_cpus": $(nproc),
	"note": ""
}
JSON
