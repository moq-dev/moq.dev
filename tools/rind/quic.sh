#!/usr/bin/env bash
# Times the QUIC chart's rows for rind, aws-lc-rs, and ring on one pinned core, three rounds.
# Run on the measured host from a rind checkout: `tools/rind/quic.sh <rind> <core> <out>`.
# Then, here: `bun tools/rind/refresh.ts quic "<CPU name>" <out> <out>/rounds/*/criterion`.
set -euo pipefail
rind="$(cd "$1" && pwd)" core="$2" out="$(mkdir -p "$3" && cd "$3" && pwd)"
cd "$rind"
export CARGO_BUILD_JOBS="${JOBS:-6}" CARGO_TARGET_DIR="$rind/target"
benches=(cargo bench -p rind-bench --bench aes_gcm --bench cipher --bench rustls)
filter='^(aes128-gcm(-open)?/(rind|aws-lc-rs|ring)/(32B|1200B|1350B|quic-32B|quic-64B)|quic-header-protection/aes128/(rind|aws-lc-rs|ring)|rustls-full-handshake-group/(x25519|x25519mlkem768)/(rind|aws-lc-rs|ring))$'

nix develop "path:$rind" --command "${benches[@]}" --no-run
load_before="$(cut -d' ' -f1 /proc/loadavg)"
for round in 1 2 3; do
	rm -rf target/criterion
	nix develop "path:$rind" --command taskset -c "$core" "${benches[@]}" -- \
		--noplot --warm-up-time 1 --measurement-time 3 "$filter" > "$out/bench-$round.log" 2>&1
	mkdir -p "$out/rounds/$round" && cp -r target/criterion "$out/rounds/$round/"
done

version() { grep -A1 "^name = \"$1\"$" Cargo.lock | sed -n 's/^version = "\(.*\)"$/\1/p' | head -1; }
cat > "$out/source.json" <<JSON
{
	"rind": "$(git rev-parse HEAD)",
	"aws-lc-rs": "$(version aws-lc-rs)",
	"ring": "$(version ring)",
	"rustls": "$(version rustls)",
	"cpu": "$(sed -n 's/^model name\t*: //p' /proc/cpuinfo | head -1)",
	"core": $core,
	"date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
	"load": [$load_before, $(cut -d' ' -f1 /proc/loadavg)],
	"logical_cpus": $(nproc),
	"note": ""
}
JSON
