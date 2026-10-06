#!/usr/bin/env python3
"""Trim a real CFB `app/latest` publication to a few games, for Sift's tests.

    python3 scripts/make_cfb_fixture.py --app-root <cfb-edge-finder>/app/latest \
        --out tests/fixtures/cfb/app/latest --event evt_... [--event evt_...]

The result is a self-consistent edge_finder.app.v1 tree: every file the
explorer index and the board name exists, and nothing outside the chosen
events is referenced by the index. Documents are copied byte-for-byte; only
the list documents (board, events, markets, search index, explorer index)
are filtered to the chosen events and their teams. The CFB Script Engine
payload rides inside each event's research document unchanged.
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
    for event_id in keep:
        shutil.copyfile(src / "event_detail" / f"{event_id}.json", (out / "event_detail").mkdir(exist_ok=True)
                        or out / "event_detail" / f"{event_id}.json")

    exp_src, exp_out = src / "explorer", out / "explorer"
    index = _load(exp_src / "index.json")
    wanted = {"capabilities.json", "metrics.json", "search_index.json"}
    wanted |= {f"events/{e}.json" for e in keep} | {f"market_history/{e}.json" for e in keep}
    wanted |= {f"teams/{t}.json" for t in teams}
    files = {}
    for rel in sorted(wanted):
        if not (exp_src / rel).exists():
            continue
        (exp_out / rel).parent.mkdir(parents=True, exist_ok=True)
        if rel == "search_index.json":
            doc = _load(exp_src / rel)
            doc["items"] = [it for it in doc["items"] if it["id"] in keep | teams]
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
        "metrics": 0,
        "players": 0,
        "rankings": 0,
        "series": 0,
    }
    for key in ("events", "teams"):
        if isinstance(index.get(key), list):
            index[key] = [x for x in index[key] if (x.get("event_id") or x.get("participant_id") or x.get("id")) in keep | teams]
        elif isinstance(index.get(key), dict):
            index[key] = {k: v for k, v in index[key].items() if k in keep | teams}
    _dump(exp_out / "index.json", index)
    print(f"fixture: {len(keep)} events, {len(teams)} teams, {len(files)} explorer files -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
