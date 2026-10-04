#!/usr/bin/env bash
# Rebuild Sift's NFL research snapshot from the LIVE NFL publication, with NFL's own exporter.
#
# Why: chmoses98/nfl-edge-finder publishes its v1 app payload but its research explorer step fails
# (scripts/research_export.py, collect_players: a game's player_opportunity can be a status object).
# Until that is fixed upstream, Sift serves a same-run explorer built here. Nothing is modelled or
# invented: the exporter is NFL's, the inputs are NFL's committed branches, and the result must pass the
# contract's own verifier. When the live root publishes explorer/index.json this script exits 0 early
# (Sift then reads the live explorer directly).
#
#   scripts/refresh-nfl-snapshot.sh <out_dir> [work_dir]
#
# Writes <out_dir>/app/latest (v1 + explorer, minus whole-sport markets/model_prices) and
# <out_dir>/SNAPSHOT.json. Requires git, python3 (3.11+), curl. ~4 GB of quote captures are fetched.
set -euo pipefail
OUT="${1:?usage: refresh-nfl-snapshot.sh <out_dir> [work_dir]}"
WORK="${2:-$(mktemp -d)}"
LIVE=https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest
NFL=https://github.com/chmoses98/nfl-edge-finder
ROUTER=https://github.com/chmoses98/kalshi-bet-router

if curl -sfo /dev/null "$LIVE/explorer/index.json"; then
  echo "live NFL explorer is published; no snapshot needed"; echo "skipped=live" >> "${GITHUB_OUTPUT:-/dev/null}"; exit 0
fi

mkdir -p "$WORK"; cd "$WORK"
echo "::group::NFL exporter (main)"
git clone -q --depth 1 --filter=blob:none --sparse "$NFL" nfl
git -C nfl sparse-checkout set --no-cone /scripts/ /contract/ /nfl_edge/ /config/ /pyproject.toml
NFL_SHA=$(git -C nfl rev-parse HEAD)
echo "::endgroup::"

echo "::group::live report + app payload (handicap-reports)"
git -C nfl fetch -q --depth 1 --filter=blob:none origin handicap-reports:refs/remotes/origin/handicap-reports
git -C nfl worktree add -q --no-checkout -f "$WORK/hr" origin/handicap-reports
git -C "$WORK/hr" sparse-checkout set --no-cone /latest/ /app/
git -C "$WORK/hr" checkout -q
HR_SHA=$(git -C "$WORK/hr" rev-parse --short HEAD)
echo "::endgroup::"

echo "::group::market data (schedule, quote captures, scorecards, wagers)"
git -C nfl fetch -q --depth 1 --filter=blob:none origin market-data:refs/remotes/origin/market-data
git -C nfl worktree add -q --no-checkout -f "$WORK/md" origin/market-data
# The exporter reads captures from ten days before the earliest on-board kickoff; take 14 days back.
DAYS=()
for i in $(seq 0 14); do DAYS+=("/data/kalshi/capture/$(date -u -d "-$i day" +%F)/*.quotes.jsonl"); done
git -C "$WORK/md" sparse-checkout set --no-cone /data/kalshi/capture/schedule_cache.csv "${DAYS[@]}" \
  '/data/shadow/scorecards/*/cumulative.scorecard.json' /data/handicap/actual_wagers/
git -C "$WORK/md" checkout -q
MD_SHA=$(git -C "$WORK/md" rev-parse --short HEAD)
du -sh "$WORK/md/data" || true
echo "::endgroup::"

echo "::group::export the explorer"
# The one upstream defect, guarded locally (no-op once nfl-edge-finder fixes it).
python3 - "$WORK/nfl/scripts/research_export.py" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
old = '''                for x in lst or []:
                    opp_by_id[x.get("player")] = {**x, "team": team}'''
new = '''                if not isinstance(lst, list):
                    continue
                for x in lst or []:
                    opp_by_id[x.get("player")] = {**x, "team": team}'''
if old in s and new not in s:
    open(p, "w").write(s.replace(old, new)); print("applied player_opportunity guard")
else:
    print("guard not needed")
PY
rm -rf "$WORK/root"; mkdir -p "$WORK/root"; cp -r "$WORK/hr/app/latest" "$WORK/root/latest"
(cd "$WORK/nfl" && python3 scripts/research_export.py --reports-dir "$WORK/hr/latest" --market-data-root "$WORK/md" --out "$WORK/root/latest")
echo "::endgroup::"

echo "::group::verify with the contract"
git clone -q --depth 1 --filter=blob:none --sparse "$ROUTER" router
git -C router sparse-checkout set contract
(cd router/contract && python3 -m edge_finder_contract verify-explorer "$WORK/root/latest")
RUN=$(python3 -c "import json;print(json.load(open('$WORK/root/latest/manifest.json'))['run_id'])")
XRUN=$(python3 -c "import json;print(json.load(open('$WORK/root/latest/explorer/index.json'))['base_manifest_run_id'])")
[ "$RUN" = "$XRUN" ] || { echo "explorer run $XRUN != v1 run $RUN"; exit 1; }
echo "::endgroup::"

rm -f "$WORK/root/latest/markets.json" "$WORK/root/latest/model_prices.json"
rm -rf "$OUT/app"; mkdir -p "$OUT/app"; cp -r "$WORK/root/latest" "$OUT/app/latest"
python3 - "$OUT" "$RUN" "$NFL_SHA" "$HR_SHA" "$MD_SHA" <<'PY'
import json, sys, datetime
out, run, nfl, hr, md = sys.argv[1:]
m = json.load(open(f"{out}/app/latest/manifest.json"))
json.dump({
  "kind": "sift_data_snapshot", "sport": "NFL",
  "reason": "NFL's production explorer (app/latest/explorer/) is not published: scripts/research_export.py in chmoses98/nfl-edge-finder raises TypeError in collect_players() when a game's game_script_inputs.player_opportunity is a status object instead of per-team lists. The v1 payload publishes; the explorer step fails.",
  "run_id": run, "v1_generated_at": m["generated_at"],
  "explorer_built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "inputs": {"app_v1": f"chmoses98/nfl-edge-finder@handicap-reports {hr} app/latest (the live publication of this run, unchanged)",
             "report": f"chmoses98/nfl-edge-finder@handicap-reports {hr} latest/packet.json",
             "market_data": f"chmoses98/nfl-edge-finder@market-data {md} (schedule_cache.csv, last 15 days of Kalshi quote captures, shadow scorecards, actual_wagers)",
             "exporter": f"chmoses98/nfl-edge-finder@main {nfl[:7]} scripts/research_export.py, unmodified except a two-line guard that skips a non-list player_opportunity value"},
  "verification": "python -m edge_finder_contract verify-explorer <root> -> OK (kalshi-bet-router contract)",
  "omitted": ["markets.json", "model_prices.json"],
  "omitted_reason": "Sift reads per-event markets and model prices from event_detail/<evt>.json (the same rows).",
  "note": "Sift reads the live root first and uses this snapshot only while the live root has no explorer/index.json. Every number comes from the repository's committed production data; nothing is synthesized.",
}, open(f"{out}/SNAPSHOT.json", "w"), indent=2)
print("snapshot", run, m["generated_at"])
PY
echo "skipped=no" >> "${GITHUB_OUTPUT:-/dev/null}"
