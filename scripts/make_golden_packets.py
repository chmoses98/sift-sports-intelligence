#!/usr/bin/env python3
"""Generate golden handicap packets with the contract's own builder (kalshi-bet-router packet.py).

    python3 scripts/make_golden_packets.py --contract <kalshi-bet-router>/contract --app-root <full app/latest>

The app root must be a FULL publication (it needs markets.json and model_prices.json, which Sift does
not ship). Sift's TypeScript port (src/packet/) must reproduce these packets byte for byte from the
per-event files Sift does ship; tests/packet.golden.test.ts enforces it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "tests" / "golden"
GENERATED_AT = "2026-10-04T01:00:00Z"
GAME_EVENT = "evt_0cb333291f580a201a70"          # 2026_04_NE_BUF
SLATE = ("2026-10-04T16:00:00Z", "2026-10-04T18:00:00Z")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contract", required=True)
    ap.add_argument("--app-root", required=True)
    a = ap.parse_args()
    sys.path.insert(0, a.contract)
    from edge_finder_contract import packet as P  # noqa: E402

    root = Path(a.app_root)
    OUT.mkdir(parents=True, exist_ok=True)

    def write(name: str, pkt: dict) -> None:
        summary = {k: pkt[k] for k in ("packet_id", "packet_version", "scope", "sports", "generated_at", "data_as_of",
                                       "quality", "budget", "user_focus")}
        summary["counts"] = {"events": len(pkt["events"]), "evidence": len(pkt["evidence"]), "markets": len(pkt["markets"]),
                             "model_evidence": len(pkt["model_evidence"]),
                             "repo_recommendations": len(pkt["repo_recommendations"])}
        summary["evidence_entities"] = [e["entity_id"] for e in pkt["evidence"]]
        (OUT / f"{name}.summary.json").write_text(json.dumps(summary, sort_keys=True, indent=1) + "\n", encoding="utf-8")
        (OUT / f"{name}.packet.txt").write_text(P.render_text(pkt), encoding="utf-8")
        print(name, pkt["packet_id"], pkt["budget"])

    write("game", P.build(app_root=root, scope_kind="GAME", event_id=GAME_EVENT, generated_at=GENERATED_AT))
    write("slate", P.build(app_root=root, scope_kind="SLATE", window_start=SLATE[0], window_end=SLATE[1],
                           generated_at=GENERATED_AT))

    idx = json.loads((root / "explorer" / "index.json").read_text())
    team = {t["short_name"]: t["participant_id"] for t in idx["teams"]}
    buf = json.loads((root / "explorer" / "teams" / f"{team['BUF']}.json").read_text())
    ser = json.loads((root / buf["series"][0]["path"]).read_text())
    allen = next(p for p in buf["players"] if p["display_name"] == "Josh Allen")
    allen_doc = json.loads((root / allen["path"]).read_text())
    mkt = allen_doc["markets"][0]
    proj = allen_doc["projections"][0]
    rnk = next(r for r in buf["rankings"] if r["metric_id"] == "met_nfl.adj_def_db_epa")
    t0 = "2026-10-04T00:50:00Z"
    items = [
        P.tray_item(ref_kind="TEAM", sport="NFL", id=team["BAL"], added_at=t0),
        P.tray_item(ref_kind="PLAYER", sport="NFL", id=allen["participant_id"], added_at=t0, note="QB1 volume"),
        P.tray_item(ref_kind="METRIC", sport="NFL", id="met_nfl.adj_def_db_epa", added_at=t0),
        P.tray_item(ref_kind="RANKING", sport="NFL", id=rnk["ranking_id"], added_at=t0),
        P.tray_item(ref_kind="CHART_POINT", sport="NFL", id=ser["series_id"], added_at=t0,
                    extra={"series_id": ser["series_id"], "x": ser["points"][-1]["x"], "metric_id": ser["metric_id"],
                           "event_id": ser["points"][-1]["event_id"]}),
        P.tray_item(ref_kind="MARKET", sport="NFL", id=mkt["market_id"], added_at=t0,
                    extra={"market_id": mkt["market_id"], "event_id": mkt["event_id"]}),
        P.tray_item(ref_kind="PROJECTION", sport="NFL", id=proj["model_price_id"], added_at=t0,
                    extra={"market_id": proj["market_id"], "event_id": proj["event_id"]}),
        P.tray_item(ref_kind="EVENT", sport="NFL", id="evt_00000000000000000000", added_at=t0),
    ]
    tray = P.tray(items, updated_at=t0)
    (OUT / "tray.json").write_text(json.dumps(tray, sort_keys=True, indent=1) + "\n", encoding="utf-8")
    write("tray", P.build(app_root=root, scope_kind="CUSTOM", tray_doc=tray, generated_at=GENERATED_AT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
