#!/usr/bin/env python3
"""Build Sift's MLB test fixture (tests/fixtures/mlb/app/latest) from the REAL edge-finder-api publication.

    # 1. download the live publication (read-only) into a scratch directory
    B=https://raw.githubusercontent.com/chmoses98/edge-finder-api/main/app/latest
    for f in manifest health board events markets model_prices explorer/index explorer/capabilities \
             explorer/metrics explorer/search_index; do mkdir -p raw/$(dirname $f); curl -sS -o raw/$f.json $B/$f.json; done
    # (plus explorer/teams/<id>.json and explorer/players/<id>.json for the teams kept below)
    # 2. build
    python3 scripts/make_mlb_fixture.py --raw raw --out tests/fixtures/mlb/app/latest

What is real and what is synthesized (on 2026-10-07 the production board was EMPTY: "no model price could be
exported", explorer "no v1 events"):
  REAL       manifest, health, model_prices (empty), markets.json rows (byte-identical market rows of the four
             postseason games), explorer index / capabilities / metrics / search index, team and player profiles.
  SYNTHETIC  board.json, events.json and event_detail/*.json for the four 2026-10-07 games (event ids are a hash
             of the Kalshi event suffix). Their markets ARE the real rows above, with event_id filled in.
             LAD@ATL additionally carries `market.extensions.player_prop` (mlb.player_prop.v1) on its player-prop
             markets and `market.player_id` where the player resolves to an explorer profile: the shape the MLB
             exporter will publish. Every projection number in them is SYNTHETIC test data, not a model output.
             The other three games carry no player_prop at all (today's production shape).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

GAMES = [
    # Kalshi event suffix (ET date + time + AWAY + HOME), first pitch UTC
    ("26OCT071600CLECWS", "2026-10-07T20:00:00Z"),
    ("26OCT071800LADATL", "2026-10-07T22:00:00Z"),
    ("26OCT072000TBNYY", "2026-10-08T00:00:00Z"),
    ("26OCT072200MILSD", "2026-10-08T02:00:00Z"),
]
PROPS_GAME = "26OCT071800LADATL"
GENERATED = "2026-10-07T19:21:16Z"

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
for name in ("Mookie Betts", "Andy Pages", "Drake Baldwin"):
    for fam in ("hitter_hits", "hitter_total_bases", "hitter_hrr", "hitter_rbi"):
        PLAN[(name, fam)] = ("LINEUP_UNCONFIRMED", None, "The lineup is not confirmed yet; no projection until it is.")
# Hitters whose player_id is withheld (the exporter could not resolve the participant): rendered as plain text.
UNRESOLVED = {"Andy Pages"}


def _load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _dump(p: Path, doc: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def evt(suffix: str) -> str:
    return "evt_" + hashlib.sha1(f"MLB|{suffix}".encode()).hexdigest()[:20]


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
        "yes_semantics": f"{name} records {int(t)}+ {label.lower()}",
        "projection_status": status, "status_reason": reason,
        "model_probability_yes": p_at_least(mean, t) if projected and mean is not None else None,
        "expected_stat": {"stat": stat, "mean": mean, "median": quantile(mean, 0.5), "p10": quantile(mean, 0.1), "p90": quantile(mean, 0.9), "unit": unit} if projected else None,
        "projection_generated_at": "2026-10-07T18:40:00Z" if projected else None,
        "inputs_as_of": "2026-10-07T18:30:00Z" if projected else None,
        "lineup_status": "PROJECTED" if status == "RESEARCH_PROJECTION" and fam.startswith("hitter_") else ("UNCONFIRMED" if status == "LINEUP_UNCONFIRMED" else None),
        "lineup_slot": {"Freddie Freeman": 3, "Shohei Ohtani": 1, "Matt Olson": 4, "Ronald Acuña Jr.": 1, "Austin Riley": 3, "Ozzie Albies": 2}.get(name) if projected and fam.startswith("hitter_") else None,
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

    index = _load(raw / "explorer/index.json")
    teams = {t["short_name"]: t for t in index["teams"]}
    search = _load(raw / "explorer/search_index.json")
    players = {i["label"]: i for i in search["items"] if i["kind"] == "PLAYER"}
    ids: dict[str, dict] = {}
    for name, entry in players.items():
        prof = _load(raw / entry["path"]) if (raw / entry["path"]).exists() else None
        ids[name] = {"id": entry["id"], "mlbam": ((prof or {}).get("entity") or {}).get("source_ids", {}).get("mlbam_player_id")}

    market_rows = _load(raw / "markets.json")
    keep_keys = {g for g, _ in GAMES}
    rows = [m for m in market_rows["items"] if m["kalshi_ticker"].split("-")[1] in keep_keys]

    board_items, events, kept_teams = [], [], set()
    for suffix, start in GAMES:
        away_abbr, home_abbr = next((a, suffix[11:][len(a):]) for a in teams if suffix[11:].startswith(a) and suffix[11:][len(a):] in teams)
        away, home = teams[away_abbr], teams[home_abbr]
        kept_teams |= {away["participant_id"], home["participant_id"]}
        eid = evt(suffix)
        parts = [{"display_name": t["display_name"], "participant_id": t["participant_id"], "participant_type": "TEAM", "short_name": t["short_name"]} for t in (home, away)]
        event = {
            "away_participant": away["participant_id"], "broadcast": None, "competition": "MLB 2026 postseason",
            "effective_start_time_utc": None, "event_id": eid, "extensions": {"kalshi_event_suffix": suffix, "synthetic_fixture": True},
            "home_participant": home["participant_id"], "last_updated_at": GENERATED, "league": "MLB", "participants": parts,
            "schedule_updated_at": "2026-10-07T01:09:42Z", "season": "2026", "source_ids": {"kalshi_event_ticker": f"KXMLBGAME-{suffix}"},
            "sport": "MLB", "start_time_confidence": "SCHEDULED", "start_time_local": None, "start_time_source": "mlb_statsapi_schedule",
            "start_time_utc": start, "status": "SCHEDULED", "venue": None,
        }
        events.append(event)
        team_abbr = {home["participant_id"]: home_abbr, away["participant_id"]: away_abbr}
        markets = []
        for m in rows:
            if m["kalshi_ticker"].split("-")[1] != suffix:
                continue
            m = json.loads(json.dumps(m))
            m["event_id"] = eid
            if suffix == PROPS_GAME:
                pp = player_prop(m, team_abbr, ids)
                if pp:
                    m["extensions"]["player_prop"] = pp
                    m["player_id"] = pp["player_id"]
            markets.append(m)
        markets.sort(key=lambda m: m["kalshi_ticker"])
        detail = {
            "context": None, "data_freshness": "STALE", "event": event, "generated_at": GENERATED, "kind": "event_detail",
            "markets": markets, "model_prices": [], "price_history": [], "recommendations": [], "run_id": "run_ec8c4135037776c3c03d",
            "schema_version": "edge_finder.app.v1", "settlements": [], "sport": "MLB", "theses": [], "wagers": [],
        }
        _dump(out / f"event_detail/{eid}.json", detail)
        board_items.append({
            "away_participant": away["participant_id"], "competition": "MLB 2026 postseason", "data_freshness": "STALE",
            "detail_path": f"event_detail/{eid}.json", "event_id": eid, "health_flags": [], "home_participant": home["participant_id"],
            "league": "MLB", "market_captured_at": max(m["captured_at"] for m in markets), "markets_available": len(markets),
            "markets_priced": 0, "model_generated_at": None, "participants": parts, "recommendations_count": 0,
            "start_time_utc": start, "status": "SCHEDULED", "wagers_count": 0,
        })

    base = {"generated_at": GENERATED, "run_id": "run_ec8c4135037776c3c03d", "schema_version": "edge_finder.app.v1", "sport": "MLB"}
    _dump(out / "board.json", {**base, "bet_authority": "MANUAL", "count": len(board_items), "items": board_items, "kind": "board", "overall_status": "DEGRADED"})
    _dump(out / "events.json", {**base, "count": len(events), "items": events, "kind": "events"})
    _dump(out / "markets.json", {**market_rows, "items": [{**m, "event_id": evt(m["kalshi_ticker"].split("-")[1])} for m in rows], "count": len(rows)})
    for name in ("manifest.json", "health.json", "model_prices.json"):
        shutil.copyfile(raw / name, out / name)

    # explorer: real documents, trimmed to the kept teams and their players (every file the index names exists)
    keep_players = {p for t in kept_teams for p in index["players_by_team"].get(t, [])}
    files = {}
    for rel, f in index["files"].items():
        if f["kind"] in ("capability_manifest", "metric_registry", "search_index") or (f["kind"] == "entity_profile" and f["entity_id"] in kept_teams | keep_players):
            files[rel] = f
            if f["kind"] == "entity_profile":
                shutil.copyfile(raw / "explorer" / rel, (out / "explorer" / rel).parent.mkdir(parents=True, exist_ok=True) or out / "explorer" / rel)
    index["files"] = files
    index["players_by_team"] = {t: ps for t, ps in index["players_by_team"].items() if t in kept_teams}
    _dump(out / "explorer/index.json", index)
    for name in ("capabilities.json", "metrics.json"):
        shutil.copyfile(raw / "explorer" / name, out / "explorer" / name)
    search["items"] = [i for i in search["items"] if i["kind"] in ("TEAM", "METRIC") or (i["kind"] == "PLAYER" and i["id"] in keep_players)]
    search["count"] = len(search["items"])
    _dump(out / "explorer/search_index.json", search)
    print(f"wrote {len(board_items)} games, {len(rows)} markets, {len(files)} explorer files to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
