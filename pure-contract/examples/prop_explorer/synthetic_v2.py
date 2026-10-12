#!/usr/bin/env python3
"""SYNTHETIC v2 display-rule fixtures (stdlib only). Not forecasts of any real player or game, and not quotes of any
real contract: every id starts with SYN, every evidence entry points at `example/sport-repo`, and every row carries
`x_synthetic: true`. They exist so the explorer UI and the tests can exercise each display label:

* S1 sports-only projection, value not tested, live quotes      -> rungs RESEARCH / NOT_EXECUTABLE, row RESEARCH
* S2 market-informed best-accuracy projection (NFL-style PROE,  -> rungs MARKET_INFORMED, row MARKET_INFORMED
     pass rate and team ratings derived from sportsbook lines)
* S3 sports-only projection with (synthetic) VALIDATED_VALUE    -> VALIDATED_OPPORTUNITY / NO_EDGE / STALE_QUOTE,
     and CALIBRATED calibration                                    row VALIDATED_OPPORTUNITY
* S4 postseason row whose challenger is REJECTED under a strict -> BLOCKED_NOT_VALIDATED_POSTSEASON for every arm,
     rule and whose arms are labelled BLOCKED_NOT_VALIDATED_POSTSEASON  row NO_ELIGIBLE_PROJECTION

Built by build_examples.py into synthetic.prop_explorer_projection.v2.example.jsonl (checked byte-for-byte in CI).
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import prop_explorer as px  # noqa: E402
import prop_explorer_v2 as v2  # noqa: E402

KICKOFF = "2026-10-18T17:00:00Z"
AS_OF = "2026-10-18T15:00:00Z"
SNAPSHOT = "2026-10-18T15:10:00Z"
QUOTED = "2026-10-18T15:08:00Z"
SMO = "2026-10-18T14:55:00Z"
HASH = "sha256:" + "a" * 64
FEES = {"name": "kalshi_general_taker", "rate": 0.07, "multiplier": 1, "rounding": "ceil_cent", "price_tick": 0.01}
EVALUATION = {"fee_model": FEES, "slippage_per_contract": 0.01, "min_edge": 0.02, "max_quote_age_seconds": 600}
CAPTURE = {"captured_at": "2026-10-18T15:11:00Z", "capture_mode": "prospective_pregame",
           "builder": "pure-contract/examples/prop_explorer/synthetic_v2.py (SYNTHETIC)"}


def ev(i, kind):
    return {"id": i, "kind": kind, "repo": "example/sport-repo", "commit": "abcdef1", "path": f"docs/{i}.md",
            "url": None}


def forecast(model="SYN_SPORTS_V1", stat="receiving_yards", sport="NFL", game="SYN-G1", player="SYN-P1",
             thresholds=((40, 0.70), (60, 0.48), (80, 0.25)), mean=60.0, as_of=AS_OF, kickoff=KICKOFF):
    return {
        "schema_version": "pure_forecast.v1", "sport": sport, "game_id": game, "player_id": player,
        "statistic": stat, "as_of": as_of, "kickoff": kickoff, "source_max_observed_at": SMO,
        "projection_mode": "PURE_INDEPENDENT", "model_version": model, "model_frozen_hash": HASH,
        "conditional_on_playing": True, "participation_probability": 0.95,
        "projection": {"mean": mean, "median": mean - 2, "p10": mean - 30, "p90": mean + 30,
                       "quantiles": [{"q": 0.25, "value": mean - 15}, {"q": 0.75, "value": mean + 14}],
                       "thresholds": [{"at_least": a, "probability": p} for a, p in thresholds]},
        "sources": [{"source_id": "pbp", "class": "sports_only", "max_observed_at": "2026-10-14T04:00:00Z"},
                    {"source_id": "injuries", "class": "sports_only", "max_observed_at": SMO}],
        "feature_lineage": [
            {"name": "targets_ewm", "value": 6.1, "source": "pbp", "observed_at": "2026-10-14T04:00:00Z",
             "class": "sports_only"},
            {"name": "opp_yards_allowed_per_target", "value": 8.4, "source": "pbp",
             "observed_at": "2026-10-14T04:00:00Z", "class": "sports_only"},
            {"name": "status", "value": "ACTIVE", "source": "injuries", "observed_at": SMO, "class": "sports_only"}],
    }


def v1_context(model="SYN_SPORTS_V1", status="RESEARCH_HISTORICAL_ACCEPTED", season_type="regular",
               strict=None, stat="receiving_yards", game="SYN-G1"):
    validation = {
        "status": status, "research_only": True,
        "scope": {"season_type": "regular", "seasons": ["2026"], "statistics": [stat],
                  "population": "SYNTHETIC population"},
        "source_verdict": "ACCEPTED_CHALLENGER (SYNTHETIC)" if status == "RESEARCH_HISTORICAL_ACCEPTED" else None,
        "compared_against": ["SYN_BASELINE"],
        "evidence": [ev("prereg", "preregistration"), ev("results", "results"), ev("scorecard", "scorecard")],
        "caveats": ["SYNTHETIC fixture: not a real model, player, game or quote."]}
    if strict is not None:
        validation["strict_rule_verdicts"] = strict
    reasons = {"validation.evidence[*].url": "SYNTHETIC: pinned by repo and commit",
               "distribution.pmf": "SYNTHETIC: quantiles and a ladder only",
               "game_script": "SYNTHETIC: no script-conditional projection",
               "expected_workload": "SYNTHETIC: no workload sibling in this fixture"}
    if validation["source_verdict"] is None:
        reasons["validation.source_verdict"] = "SYNTHETIC: comparator only"
    return {
        "capture": {"captured_at": "2026-10-18T15:05:00Z", "capture_mode": "prospective_pregame",
                    "builder": "SYNTHETIC"},
        "players": {"SYN-P1": {"name": "Synthetic Player One", "position": "WR", "team_id": "SYA", "team_abbr": "SYA"}},
        "games": {game: {"season": "2026", "season_type": season_type, "week": None if season_type == "postseason" else 7,
                             "home_team_id": "SYA", "away_team_id": "SYB", "opponent_team_id": "SYB", "is_home": True}},
        "units": {stat: "yards"},
        "drivers": {model: {
            "targets_ewm": {"label": "Targets, player EWM", "role": "opportunity", "matchup_role": "not_matchup"},
            "opp_yards_allowed_per_target": {"label": "Opponent yards allowed per target", "role": "opponent",
                                             "matchup_role": "opponent_input"},
            "status": {"label": "Listed status", "role": "participation", "matchup_role": "not_matchup"}}},
        "validation": {model: validation},
        "coverage": {model: {stat: {"observed": 0.79, "n_rows": 4000, "n_games": 270, "scope": "SYNTHETIC holdout",
                                    "evidence_id": "scorecard"}}},
        "null_reasons": {**reasons, **({"game.week": "SYNTHETIC: no weeks in this postseason"}
                                      if season_type == "postseason" else {})},
    }


def v1_record(**kw) -> dict:
    ctx_kw = {k: kw.pop(k) for k in ("status", "season_type", "strict") if k in kw}
    f = forecast(**kw)
    return px.convert([f], v1_context(model=f["model_version"], stat=f["statistic"], game=f["game_id"],
                                      **ctx_kw))[0]


def sports_entry(rec, role="champion", model_id="syn.sports", **mctx):
    return v2.entry_from_v1(rec, {"role": role, "model_id": model_id, **mctx})


def market_informed_entry(rec_like: dict, *, accuracy="ACCURACY_ACCEPTED_RESEARCH", mean=64.0,
                          thresholds=((40, 0.76), (60, 0.55), (80, 0.30))) -> dict:
    """A best-accuracy projection whose inputs include sportsbook-derived features (NFL-style)."""
    drivers = [
        {"feature": "targets_ewm", "label": "Targets, player EWM", "role": "opportunity", "matchup_role": "not_matchup",
         "value": 6.1, "source": "pbp", "observed_at": "2026-10-14T04:00:00Z", "importance_rank": 2,
         "importance_basis": "producer_attribution"},
        {"feature": "team_proe", "label": "Team pass rate over expected (fitted to sportsbook lines)",
         "role": "team_environment", "matchup_role": "opponent_adjusted", "value": 0.031, "source": "team_model",
         "observed_at": SMO, "importance_rank": 1, "importance_basis": "producer_attribution"},
        {"feature": "implied_team_total", "label": "Implied team total from the consensus sportsbook line",
         "role": "team_environment", "matchup_role": "not_matchup", "value": 24.5, "source": "odds_feed",
         "observed_at": SMO, "importance_rank": 3, "importance_basis": "producer_attribution"}]
    outcome = {"unit": "yards", "mean": mean, "median": mean - 2, "p10": mean - 30, "p90": mean + 30,
               "quantiles": [{"q": 0.1, "value": mean - 30}, {"q": 0.5, "value": mean - 2}, {"q": 0.9, "value": mean + 30}],
               "thresholds": [{"at_least": a, "probability": p} for a, p in thresholds], "pmf": None}
    game = rec_like["game"]
    return {
        "projection_id": "SYN_BEST_ACCURACY_V1", "role": "best_accuracy",
        "model": {"model_id": "syn.best_accuracy", "model_version": "SYN_BEST_ACCURACY_V1", "model_frozen_hash": HASH},
        "provenance": {"market_informed": True, "market_derived_inputs": [
            {"input": "team_proe", "dependency": "indirect", "market_source": "sportsbook",
             "derivation": "team pass-rate-over-expected model fitted with closing spreads and totals as features"},
            {"input": "implied_team_total", "dependency": "direct", "market_source": "sportsbook",
             "derivation": "consensus pregame total and spread converted to the team's implied points"},
            {"input": "team_ratings", "dependency": "indirect", "market_source": "sportsbook",
             "derivation": "team strength ratings regressed on historical closing lines (enters through team_proe)"}],
            "source": None},
        "explorer_projection": None,
        "outcome": outcome,
        "expected_workload": None,
        "matchup": v2.matchup_from_drivers(drivers, game["opponent_team_id"]),
        "game_script": None,
        "drivers": drivers,
        "uncertainty": {"p10_p90_width": 60.0, "interval_nominal_coverage": 0.8, "holdout_interval_coverage": None},
        "calibration": {"status": "ASSESSED", "metrics": {"interval_coverage_80": 0.80, "threshold_ece": 0.012,
                                                          "brier": 0.214, "log_loss": 0.61, "crps": None,
                                                          "calibration_slope": 0.97},
                        "sample_size": {"n_rows": 5200, "n_games": 270}, "scope": "SYNTHETIC holdout",
                        "evidence_id": "results"},
        "freshness": {"as_of": AS_OF, "inputs_max_observed_at": SMO, "staleness_seconds": 300,
                      "oldest_input_observed_at": "2026-10-14T04:00:00Z",
                      "kickoff_lead_seconds": px._seconds(game["kickoff"], AS_OF, "f")},
        "validation": {"accuracy_status": accuracy, "value_status": "VALUE_NOT_TESTED", "research_only": True,
                       "accuracy_scope": {"season_type": "regular", "seasons": ["2026"],
                                          "statistics": ["receiving_yards"], "population": "SYNTHETIC population"},
                       "value_scope": None, "source_verdict": "ACCEPTED_CHALLENGER on accuracy (SYNTHETIC)",
                       "compared_against": ["SYN_SPORTS_V1"],
                       "evidence": [ev("prereg", "preregistration"), ev("results", "results")],
                       "caveats": ["SYNTHETIC fixture. Market-informed: its disagreement with the market it learned "
                                   "from is not independent evidence."],
                       "strict_rule_verdicts": []},
    }


def quotes(asks=((0.71, 0.27), (0.46, 0.52), (0.22, None)), observed=QUOTED):
    out = []
    for (yes_ask, no_ask), strike in zip(asks, (40, 60, 80)):
        out.append({"contract_ticker": f"SYNKXNFLRECYDS-26OCT18-P1-{strike}", "at_least": strike,
                    "yes_bid": round(yes_ask - 0.02, 2), "yes_ask": yes_ask,
                    "no_bid": None if no_ask is None else round(no_ask - 0.02, 2), "no_ask": no_ask,
                    "last_price": round(yes_ask - 0.01, 2), "observed_at": observed})
    return {"venue": "kalshi", "event_ticker": "SYNKXNFLRECYDS-26OCT18", "captured_at": "2026-10-18T15:09:00Z",
            "quotes": out}




def row(entries, rec, *, market=None, evaluation=None, reasons=None):
    base = {"best_validated_projection_id": "SYNTHETIC: no projection has an accepted or promoted accuracy status",
            "sports_only_projection_id": "SYNTHETIC: no displayable sports-only projection",
            "primary_projection_id": "SYNTHETIC: every projection is rejected or blocked for this game",
            "market": "SYNTHETIC: no quotes in this fixture", "market_evaluation": "SYNTHETIC: nothing is priced",
            "projections[*].expected_workload": "SYNTHETIC: no workload sibling in this fixture",
            "projections[*].game_script": "SYNTHETIC: no script-conditional projection",
            "projections[*].outcome.pmf": "SYNTHETIC: quantiles and a ladder only",
            "projections[*].validation.evidence[*].url": "SYNTHETIC: pinned by repo and commit",
            "projections[*].uncertainty.holdout_interval_coverage": "SYNTHETIC: not scored",
            "projections[*].validation.source_verdict": "SYNTHETIC: comparator only",
            "projections[*].provenance.source": "SYNTHETIC: no source repository",
            "game.week": "SYNTHETIC: no weeks in this postseason"}
    ident = {"sport": rec["identity"]["sport"], "game_id": rec["identity"]["game_id"],
             "player_id": rec["identity"]["player_id"], "statistic": rec["identity"]["statistic"],
             "conditional_on_playing": rec["identity"]["conditional_on_playing"], "snapshot_at": SNAPSHOT}
    r = v2.assemble_row(ident, dict(CAPTURE), copy.deepcopy(rec["player"]), copy.deepcopy(rec["game"]),
                        entries, market=market, evaluation=evaluation, reasons={**base, **(reasons or {})})
    r["x_synthetic"] = True
    return r


def s1_sports_only_research():
    rec = v1_record(game="SYN-G1")
    return row([sports_entry(rec)], rec, market=quotes(), evaluation=dict(EVALUATION))


def s2_market_informed_best_accuracy():
    rec = v1_record(status="NOT_VALIDATED", game="SYN-G2")
    return row([market_informed_entry(rec), sports_entry(rec)], rec, market=quotes(), evaluation=dict(EVALUATION))


VALUE_SCOPE = {"season_type": "regular", "seasons": ["2026"], "statistics": ["receiving_yards"],
               "population": "SYNTHETIC: every pregame-listed rung in the value holdout"}
CALIBRATED = {"status": "CALIBRATED", "metrics": {"interval_coverage_80": 0.80, "threshold_ece": 0.009,
                                                  "brier": 0.205, "log_loss": 0.59, "crps": 9.8,
                                                  "calibration_slope": 0.99},
              "sample_size": {"n_rows": 6100, "n_games": 300}, "scope": "SYNTHETIC preregistered calibration test",
              "evidence_id": "value_results"}


def s3_validated_opportunity():
    rec = v1_record(thresholds=((40, 0.70), (60, 0.62), (80, 0.25)), game="SYN-G3")
    entry = sports_entry(rec, value_status="VALIDATED_VALUE", value_scope=VALUE_SCOPE, calibration=CALIBRATED,
                         extra_evidence=[ev("value_results", "value_results")])
    mk = quotes(asks=((0.71, 0.27), (0.50, 0.48), (0.22, 0.76)))
    mk["quotes"][2]["observed_at"] = "2026-10-18T14:40:00Z"  # older than max_quote_age_seconds
    return row([entry], rec, market=mk, evaluation=dict(EVALUATION))


def s4_postseason_blocked():
    strict = [{"model_version": "SYN_CHALLENGER_V1", "lane": "syn_lane", "rule": "strict_preregistered",
               "verdict": "REJECTED", "disposition": "SCOPE_BLOCKED",
               "scope": {"season_type": "postseason", "seasons": ["2026"], "statistics": ["receiving_yards"],
                         "population": "SYNTHETIC postseason population"},
               "row_label": "BLOCKED_NOT_VALIDATED_POSTSEASON", "promoted": False,
               "evidence_ids": ["prereg", "results"], "summary": "SYNTHETIC: REJECTED under the strict rule"}]
    chal = v1_record(model="SYN_CHALLENGER_V1", status="REJECTED", season_type="postseason", strict=strict,
                     game="SYN-G4")
    champ = v1_record(model="SYN_SPORTS_V1", status="NOT_VALIDATED", season_type="postseason", strict=strict,
                      game="SYN-G4")
    entries = [sports_entry(champ, accuracy_status="BLOCKED_NOT_VALIDATED_POSTSEASON"),
               sports_entry(chal, role="challenger", model_id="syn.challenger",
                            accuracy_status="BLOCKED_NOT_VALIDATED_POSTSEASON")]
    return row(entries, champ, market=quotes(), evaluation=None,
               reasons={"market_evaluation": "SYNTHETIC: no displayable projection, so nothing is priced"})


def build_synthetic() -> list[dict]:
    rows = [s1_sports_only_research(), s2_market_informed_best_accuracy(), s3_validated_opportunity(),
            s4_postseason_blocked()]
    for i, r in enumerate(rows, 1):
        r["x_scenario"] = f"S{i}"
    return rows
