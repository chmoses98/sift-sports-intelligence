#!/usr/bin/env python3
"""Build Sift's MLB test fixture (tests/fixtures/mlb/app/latest) from the REAL edge-finder-api publication.

    # 1. download the live publication (read-only) into a scratch directory: manifest, health, board, events,
    #    markets, model_prices, recommendations, event_detail/<id>.json for every board item, and explorer/
    #    (index, capabilities, metrics, search_index, events/<id>, market_history/<id>, teams/<id>, players/<id>)
    # 2. build
    python3 scripts/make_mlb_fixture.py --raw raw --out tests/fixtures/mlb/app/latest

Every document is the real 2026-10-07 publication (four postseason games: CLE@CWS, LAD@ATL, TB@NYY, MIL@SD), trimmed
to those games, their teams and their players. ONE thing is synthesized: on LAD@ATL the player-prop markets carry
`market.extensions.player_prop` (schema mlb.player_prop.v1) and `market.player_id` (where the player resolves to an
explorer profile), the shape the MLB exporter is about to publish; every projection number in them is SYNTHETIC TEST
DATA, not model output. Stolen-base markets are left without one (an "Other player markets" example), Andy Pages is
left unresolved (plain text, no profile link), and the other three games carry none (today's production shape).
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

# The game whose prop markets get mlb.player_prop.v1 examples (Kalshi event suffix: ET date + start + AWAY + HOME).
PROPS_GAME = "26OCT071800LADATL"

FAMILY = {  # market_family as published -> mlb.player_prop.v1 family
    "pitcher_strikeouts": "pitcher_strikeouts", "pitcher_outs": "pitcher_outs", "hitter_hits": "hitter_hits",
    "hitter_total_bases": "hitter_total_bases", "hitter_hits_runs_rbis": "hitter_hrr", "hitter_rbis": "hitter_rbi",
    "hitter_stolen_bases": "hitter_stolen_bases",
}
STAT = {
    "pitcher_strikeouts": ("Strikeouts", "strikeouts", "K"), "pitcher_outs": ("Outs recorded", "outs", "outs"),
    "hitter_hits": ("Hits", "hits", "H"), "hitter_total_bases": ("Total bases", "total_bases", "TB"),
    "hitter_hrr": ("Hits + runs + RBIs", "hrr", "H+R+RBI"), "hitter_rbi": ("RBIs", "rbi", "RBI"),
    "hitter_stolen_bases": ("Stolen bases", "stolen_bases", "SB"),
}
YES_WORDS = {
    "pitcher_strikeouts": "strikeouts", "pitcher_outs": "outs recorded", "hitter_hits": "hits", "hitter_total_bases": "total bases",
    "hitter_hrr": "hits + runs + RBIs", "hitter_rbi": "RBIs", "hitter_stolen_bases": "stolen bases",
}
# Synthetic research projections (Poisson means) and statuses for LAD@ATL. NOT model output.
PLAN: dict[tuple[str, str], tuple[str, float | None, str]] = {}
for name, mean in (("Tyler Glasnow", 6.2), ("Tyler Mahle", 4.6)):
    PLAN[(name, "pitcher_strikeouts")] = ("RESEARCH_PROJECTION", mean, "Research projection from the pitcher strikeout engine.")
    PLAN[(name, "pitcher_outs")] = ("NO_MODEL_SUPPORT", None, "No pitcher-outs model is published yet.")
for name, hits, tb in (("Freddie Freeman", 1.05, 1.7), ("Shohei Ohtani", 1.0, 1.9), ("Matt Olson", 0.95, 1.6), ("Ronald Acuña Jr.", 1.0, 1.6), ("Austin Riley", 0.9, 1.5), ("Ozzie Albies", 0.95, 1.4)):
    PLAN[(name, "hitter_hits")] = ("RESEARCH_PROJECTION", hits, "Research projection from the hitter engine.")
    PLAN[(name, "hitter_total_bases")] = ("RESEARCH_PROJECTION", tb, "Research projection from the hitter engine.")
    PLAN[(name, "hitter_hrr")] = ("NO_MODEL_SUPPORT", None, "Hits + runs + RBIs depends on teammates; no model is published.")
    PLAN[(name, "hitter_rbi")] = ("NO_MODEL_SUPPORT", None, "RBIs depend on lineup context; no model is published.")
for name in ("Mookie Betts", "Andy Pages"):
    for fam in ("hitter_hits", "hitter_total_bases", "hitter_hrr", "hitter_rbi"):
        PLAN[(name, fam)] = ("LINEUP_UNCONFIRMED", None, "The lineup is not confirmed yet; no projection until it is.")
# Hitters whose player_id is withheld (the exporter could not resolve the participant): rendered as plain text.
UNRESOLVED = {"Andy Pages"}


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _dump(p: Path, doc: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def p_at_least(mean: float, k: float) -> float:
    k = int(math.ceil(k))
    cdf = sum(math.exp(-mean) * mean ** i / math.factorial(i) for i in range(k))
    return round(max(0.0, 1 - cdf), 4)


def quantile(mean: float, q: float) -> int:
    acc, i = 0.0, 0
    while True:
        acc += math.exp(-mean) * mean ** i / math.factorial(i)
        if acc >= q:
            return i
        i += 1


def player_prop(m: dict, team_abbr: dict[str, str], ids: dict[str, dict]) -> dict | None:
    fam = FAMILY.get(m["market_family"])
    name = (m.get("extensions") or {}).get("player")
    if not fam or not name or fam == "hitter_stolen_bases":
        return None  # stolen bases stay unsupported: an "Other player markets" example
    status, mean, reason = PLAN.get((name, fam), ("NO_MODEL_SUPPORT", None, "No model is published for this market."))
    team = m["extensions"].get("team")
    opp = next(a for a in team_abbr.values() if a != team)
    label, stat, unit = STAT[fam]
    prof = ids.get(name)
    projected = status.endswith("_PROJECTION")
    t = m["threshold"]
    out = {
        "schema": "mlb.player_prop.v1",
        "player_name": name,
        "mlbam_player_id": (prof or {}).get("mlbam"),
        "player_id": None if name in UNRESOLVED or not prof else prof["id"],
        "role": "PITCHER" if fam.startswith("pitcher_") else "HITTER",
        "team": team, "opponent": opp, "family": fam, "stat_label": label,
        "threshold": int(t) if t is not None and float(t).is_integer() else t,
        "comparison": "AT_LEAST",
        "yes_semantics": f"{name} records {int(t)}+ {YES_WORDS[fam]}",
        "projection_status": status, "status_reason": reason,
        "model_probability_yes": p_at_least(mean, t) if projected and mean is not None else None,
        "expected_stat": {"stat": stat, "mean": mean, "median": quantile(mean, 0.5), "p10": quantile(mean, 0.1), "p90": quantile(mean, 0.9), "unit": unit} if projected else None,
        "projection_generated_at": "2026-10-07T18:40:00Z" if projected else None,
        "inputs_as_of": "2026-10-07T18:30:00Z" if projected else None,
        "lineup_status": "CONFIRMED" if status == "RESEARCH_PROJECTION" and fam.startswith("hitter_") else ("UNCONFIRMED" if status == "LINEUP_UNCONFIRMED" else None),
        "lineup_slot": None,  # the publication does not carry batting orders
        "drivers": ([{"label": "Opp lineup K%", "value": "24.1%" if team == "LAD" else "21.7%"}, {"label": "Pitcher K% (season)", "value": "29.8%" if name == "Tyler Glasnow" else "22.3%"}, {"label": "Expected batters faced", "value": "22.5" if name == "Tyler Glasnow" else "21.0"}, {"label": "Park K factor", "value": "1.01"}, {"label": "Umpire K tendency", "value": "neutral"}]
                    if fam == "pitcher_strikeouts" and projected else
                    [{"label": "Expected plate appearances", "value": "4.4"}, {"label": "Opp starter xBA allowed", "value": ".231"}, {"label": "Platoon split", "value": "neutral"}] if projected else []),
        "provenance": {"engine": "SYNTHETIC TEST FIXTURE", "engine_version": "0.0.0-test", "source": "scripts/make_mlb_fixture.py"},
        "limitations": ["SYNTHETIC TEST FIXTURE: not a model output.", "Research projection: not validated against market prices."] if projected else [],
        "validation": {"status": "RESEARCH", "summary": "Prospective evaluation in progress (synthetic test fixture).", "n": 412, "model_brier": 0.2141, "market_brier": 0.2098} if projected else None,
        "betting_eligible": False,
    }
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    raw, out = a.raw, a.out
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    board = _load(raw / "board.json")
    if not board["items"]:
        raise SystemExit("the MLB board is empty: nothing real to build a fixture from")
    keep = {it["event_id"] for it in board["items"]}
    index = _load(raw / "explorer/index.json")
    search = _load(raw / "explorer/search_index.json")
    ids: dict[str, dict] = {}
    for entry in (i for i in search["items"] if i["kind"] == "PLAYER"):
        prof = _load(raw / entry["path"]) if (raw / entry["path"]).exists() else None
        ids[entry["label"]] = {"id": entry["id"], "mlbam": ((prof or {}).get("entity") or {}).get("source_ids", {}).get("mlbam_player_id")}

    teams: set[str] = set()
    for it in board["items"]:
        detail = _load(raw / it["detail_path"])
        ev = detail["event"]
        teams |= {ev["home_participant"], ev["away_participant"]}
        if (ev.get("extensions") or {}).get("kalshi_event_ticker_suffix") == PROPS_GAME:
            team_abbr = {p["participant_id"]: p["short_name"] for p in ev["participants"]}
            for m in detail["markets"]:
                pp = player_prop(m, team_abbr, ids)
                if pp:
                    m["extensions"]["player_prop"] = pp
                    m["player_id"] = pp["player_id"]
        _dump(out / it["detail_path"], detail)
    _dump(out / "board.json", board)
    for name in ("events.json", "markets.json", "model_prices.json", "recommendations.json", "theses.json"):
        doc = _load(raw / name)
        doc["items"] = [x for x in doc["items"] if x.get("event_id") in keep]
        doc["count"] = len(doc["items"])
        _dump(out / name, doc)
    for name in ("manifest.json", "health.json"):
        shutil.copyfile(raw / name, out / name)

    # explorer: real documents, trimmed to the four games, their teams and their players
    players = {p for t in teams for p in index["players_by_team"].get(t, [])}
    files = {}
    for rel, f in index["files"].items():
        wanted = f["kind"] in ("capability_manifest", "metric_registry", "search_index") \
            or (f["kind"] == "entity_profile" and f["entity_id"] in teams | players) \
            or (f["kind"] in ("event_research", "market_history") and f["entity_id"] in keep)
        if not wanted:
            continue
        files[rel] = f
        if f["kind"] not in ("capability_manifest", "metric_registry", "search_index"):
            (out / "explorer" / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(raw / "explorer" / rel, out / "explorer" / rel)
    index["files"] = files
    index["events"] = [e for e in index["events"] if e["event_id"] in keep]
    index["players_by_team"] = {t: ps for t, ps in index["players_by_team"].items() if t in teams}
    _dump(out / "explorer/index.json", index)
    for name in ("capabilities.json", "metrics.json"):
        shutil.copyfile(raw / "explorer" / name, out / "explorer" / name)
    search["items"] = [i for i in search["items"] if i["kind"] in ("TEAM", "METRIC") or (i["kind"] == "PLAYER" and i["id"] in players)]
    search["count"] = len(search["items"])
    _dump(out / "explorer/search_index.json", search)
    print(f"wrote {len(board['items'])} games, {len(files)} explorer files to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
