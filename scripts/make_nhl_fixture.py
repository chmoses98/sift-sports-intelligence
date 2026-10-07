#!/usr/bin/env python3
"""Trim a real NHL `app/latest` publication to a few games, for Sift's tests.

    python3 scripts/make_nhl_fixture.py --app-root <NHL-edge-finder archive>/app/latest \
        --out tests/fixtures/nhl/app/latest --event evt_... [--event evt_...]

Like make_cfb_fixture.py: a self-consistent edge_finder.app.v1 tree where every file the explorer index and
the board name exists. Documents are copied byte-for-byte; only list documents (board, events, markets,
search index, explorer index) are filtered. Kept: the chosen events (research, detail, market history), their
teams, the players each event names (goalies, first power-play units), and the rankings of the
opponent-adjusted metrics plus the raw xG share (so raw and adjusted ranks can be compared). The NHL_SCRIPT_V1
payload and the learning scorecard ride inside the event research documents and metrics.json unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, doc: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--event", action="append", required=True)
    parser.add_argument("--max-players-per-event", type=int, default=8)
    args = parser.parse_args()
    src, out, keep = args.app_root, args.out, set(args.event)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    teams: set[str] = set()
    for name in ("board.json", "events.json"):
        doc = _load(src / name)
        doc["items"] = [it for it in doc["items"] if it["event_id"] in keep]
        doc["count"] = len(doc["items"])
        for it in doc["items"]:
            teams |= {p["participant_id"] for p in it.get("participants") or []}
        _dump(out / name, doc)
    markets = _load(src / "markets.json")
    markets["items"] = [m for m in markets["items"] if m["event_id"] in keep]
    markets["count"] = len(markets["items"])
    _dump(out / "markets.json", markets)
    for name in ("health.json", "manifest.json", "model_prices.json", "recommendations.json", "theses.json",
                 "wagers.json", "settlements.json", "runs.json", "performance.json"):
        if (src / name).exists():
            shutil.copyfile(src / name, out / name)
    (out / "event_detail").mkdir(exist_ok=True)
    for event_id in keep:
        shutil.copyfile(src / "event_detail" / f"{event_id}.json", out / "event_detail" / f"{event_id}.json")

    exp_src, exp_out = src / "explorer", out / "explorer"
    index = _load(exp_src / "index.json")
    players: set[str] = set()
    for e in keep:
        er = _load(exp_src / "events" / f"{e}.json")
        goalies = [p["participant_id"] for p in er["players"] if str(p.get("role") or "").startswith("G")]
        rest = [p["participant_id"] for p in er["players"] if p["participant_id"] not in goalies]
        players |= set(goalies) | set(rest[: max(0, args.max_players_per_event - len(goalies))])
    rankings: set[str] = set()
    for rel, f in index["files"].items():
        if f.get("kind") == "ranking":
            doc = _load(exp_src / rel)
            mid = doc["metric_id"]
            if mid.startswith("met_nhl.oa_") or (mid == "met_nhl.xgf_pct" and doc["window"]["label"] == "2025-26" and not doc.get("split")):
                rankings.add(rel)
    wanted = {"capabilities.json", "metrics.json", "search_index.json"}
    wanted |= {f"events/{e}.json" for e in keep} | {f"market_history/{e}.json" for e in keep}
    wanted |= {f"teams/{t}.json" for t in teams} | {f"players/{p}.json" for p in players} | rankings
    ids = keep | teams | players | {_load(exp_src / r)["ranking_id"] for r in rankings}
    files = {}
    for rel in sorted(wanted):
        if not (exp_src / rel).exists():
            continue
        (exp_out / rel).parent.mkdir(parents=True, exist_ok=True)
        if rel == "search_index.json":
            doc = _load(exp_src / rel)
            doc["items"] = [it for it in doc["items"] if it["id"] in ids or it["kind"] == "METRIC"]
            doc["count"] = len(doc["items"])
            _dump(exp_out / rel, doc)
        else:
            shutil.copyfile(exp_src / rel, exp_out / rel)
        data = (exp_out / rel).read_bytes()
        files[rel] = {**index["files"].get(rel, {}), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    index["files"] = files
    index["counts"] = {
        "events": sum(1 for r in files if r.startswith("events/")),
        "market_history": sum(1 for r in files if r.startswith("market_history/")),
        "teams": sum(1 for r in files if r.startswith("teams/")),
        "metrics": index["counts"].get("metrics", 0),
        "players": sum(1 for r in files if r.startswith("players/")),
        "rankings": sum(1 for r in files if r.startswith("rankings/")),
        "series": 0,
    }
    index["events"] = [x for x in index["events"] if x["event_id"] in keep]
    index["players_by_team"] = {t: [p for p in ps if p in players] for t, ps in index["players_by_team"].items() if t in teams}
    _dump(exp_out / "index.json", index)
    print(f"fixture: {len(keep)} events, {len(teams)} teams, {len(players)} players, {len(rankings)} rankings, {len(files)} explorer files -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
