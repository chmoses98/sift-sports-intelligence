#!/usr/bin/env python3
"""Trim a real edge_finder.app.v1 publication to a few events, for Sift's tests — reading straight from the
published root (a raw GitHub URL or a local directory), so no full archive checkout is needed.

    python3 scripts/make_sport_fixture.py \
        --base-url https://raw.githubusercontent.com/chmoses98/soccer-edge-finder/data-archive/app/latest \
        --out tests/fixtures/soccer/app/latest --event evt_... [--event evt_...]

Like make_nhl_fixture.py: a self-consistent app tree where every file the explorer index and the board name
exists. Documents are copied byte-for-byte; only list documents (board, events, markets, model_prices,
recommendations, theses, search index, explorer index) are filtered to the chosen events. Kept: the chosen
events (research, detail, market history), every participant they name (teams, or players for an individual
sport such as tennis), the players each event research lists (up to --max-players-per-event), and the
rankings the events' matchup rows cite. Nothing is synthesised: a file the publication does not have is simply
absent from the fixture, exactly as it is absent from production.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _dump(path: Path, doc: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


class Source:
    """Reads documents from a URL root or a directory; remembers raw bytes so copies are byte-for-byte."""

    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.is_url = base.startswith("http://") or base.startswith("https://")
        self.cache: dict[str, bytes | None] = {}
        self.ctx = None
        if self.is_url:
            ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("NODE_EXTRA_CA_CERTS")
            self.ctx = ssl.create_default_context(cafile=ca) if ca and Path(ca).exists() else ssl.create_default_context()

    def raw(self, rel: str) -> bytes | None:
        if rel in self.cache:
            return self.cache[rel]
        data: bytes | None
        if self.is_url:
            try:
                with urllib.request.urlopen(f"{self.base}/{rel}", context=self.ctx, timeout=120) as r:
                    data = r.read()
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                data = None
        else:
            p = Path(self.base) / rel
            data = p.read_bytes() if p.exists() else None
        self.cache[rel] = data
        return data

    def doc(self, rel: str) -> dict | None:
        b = self.raw(rel)
        return json.loads(b.decode("utf-8")) if b is not None else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True, help="published app root (URL or directory)")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--event", action="append", required=True)
    parser.add_argument("--max-players-per-event", type=int, default=8)
    args = parser.parse_args()
    src, out, keep = Source(args.base_url), args.out, set(args.event)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    def copy(rel: str) -> bool:
        b = src.raw(rel)
        if b is None:
            return False
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        (out / rel).write_bytes(b)
        return True

    participants: set[str] = set()
    # v1 list documents: filtered to the chosen events (count fields follow).
    for name in ("board.json", "events.json", "markets.json", "model_prices.json", "recommendations.json", "theses.json"):
        doc = src.doc(name)
        if doc is None:
            continue
        items = doc.get("items") or []
        doc["items"] = [it for it in items if it.get("event_id") in keep]
        if "count" in doc:
            doc["count"] = len(doc["items"])
        if name == "board.json":
            for it in doc["items"]:
                participants |= {p["participant_id"] for p in it.get("participants") or []}
        _dump(out / name, doc)
    for name in ("health.json", "manifest.json", "wagers.json", "settlements.json", "runs.json", "performance.json"):
        copy(name)
    for e in keep:
        if not copy(f"event_detail/{e}.json"):
            print(f"warning: no event_detail for {e}", file=sys.stderr)

    index = src.doc("explorer/index.json")
    if index is None:
        print("no explorer index at the root", file=sys.stderr)
        return 1
    files = index["files"]
    players: set[str] = set()
    rankings: set[str] = set()
    ranking_files = {f["entity_id"]: rel for rel, f in files.items() if f.get("kind") == "ranking" and f.get("entity_id")}
    wanted: set[str] = {"capabilities.json", "metrics.json", "search_index.json"}
    for e in keep:
        er = src.doc(f"explorer/events/{e}.json")
        if er is None:
            print(f"warning: no event research for {e}", file=sys.stderr)
            continue
        wanted.add(f"events/{e}.json")
        if f"market_history/{e}.json" in files:
            wanted.add(f"market_history/{e}.json")
        for p in er.get("participants") or []:
            participants.add(p["participant_id"])
            if p.get("path", "").startswith("explorer/"):
                wanted.add(p["path"][len("explorer/"):])
        listed = er.get("players") or []
        for p in listed[: args.max_players_per_event]:
            players.add(p["participant_id"])
            if p.get("path", "").startswith("explorer/"):
                wanted.add(p["path"][len("explorer/"):])
        for row in er.get("matchup") or []:
            for side in ("home", "away"):
                rid = ((row.get(side) or {}).get("context") or {}).get("ranking_id")
                if rid and rid in ranking_files:
                    rankings.add(ranking_files[rid])
    wanted |= rankings
    for t in participants:
        if f"teams/{t}.json" in files:
            wanted.add(f"teams/{t}.json")
        if f"players/{t}.json" in files:
            wanted.add(f"players/{t}.json")

    ids = keep | participants | players | {files[r]["entity_id"] for r in rankings}
    new_files: dict[str, dict] = {}
    for rel in sorted(wanted):
        if rel not in files and rel not in ("capabilities.json", "metrics.json", "search_index.json"):
            continue
        if rel == "search_index.json":
            doc = src.doc(f"explorer/{rel}")
            if doc is None:
                continue
            doc["items"] = [it for it in doc["items"] if it["id"] in ids or it["kind"] == "METRIC"]
            if "count" in doc:
                doc["count"] = len(doc["items"])
            _dump(out / "explorer" / rel, doc)
        elif not copy(f"explorer/{rel}"):
            continue
        data = (out / "explorer" / rel).read_bytes()
        new_files[rel] = {**files.get(rel, {}), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    index["files"] = new_files
    index["counts"] = {
        **index.get("counts", {}),
        "events": sum(1 for r in new_files if r.startswith("events/")),
        "market_history": sum(1 for r in new_files if r.startswith("market_history/")),
        "teams": sum(1 for r in new_files if r.startswith("teams/")),
        "players": sum(1 for r in new_files if r.startswith("players/")),
        "rankings": sum(1 for r in new_files if r.startswith("rankings/")),
        "series": 0,
    }
    index["events"] = [x for x in index["events"] if x["event_id"] in keep]
    index["teams"] = [t for t in index.get("teams", []) if t["participant_id"] in participants]
    pbt = index.get("players_by_team") or {}
    index["players_by_team"] = {t: [p for p in ps if p in players] for t, ps in pbt.items() if t in participants or t == "_none"}
    _dump(out / "explorer" / "index.json", index)
    print(f"fixture: {len(keep)} events, {len(participants)} participants, {len(players)} players, {len(rankings)} rankings, {len(new_files)} explorer files -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
