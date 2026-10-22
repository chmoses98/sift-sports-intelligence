#!/usr/bin/env bash
# Force-push the evidence files in $1 to the `live-scores-probe` branch (an evaluation branch: it is not part of the app and is deleted when the work is done).
set -u
SRC="$1"; PUB="$(mktemp -d)"
for f in report.json live-verify.json watch.jsonl watch-summary.json real-browser.json; do [ -f "$SRC/$f" ] && cp -f "$SRC/$f" "$PUB/"; done
[ -d "$SRC/terms" ] && mkdir -p "$PUB/terms" && cp -f "$SRC"/terms/*.txt "$PUB/terms/" 2>/dev/null
for f in "$SRC"/*.png; do [ -f "$f" ] && mkdir -p "$PUB/shots" && cp -f "$f" "$PUB/shots/"; done
[ -d "$SRC/samples" ] && mkdir -p "$PUB/samples" && cp -f "$SRC"/samples/*.json "$PUB/samples/" 2>/dev/null
cd "$PUB" && git init -q -b live-scores-probe \
  && git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com" \
  && git add -A && git commit -qm "probe $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  && git push -q -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" live-scores-probe
