#!/usr/bin/env python3
"""Combined Player Prop Explorer row contract (`prop_explorer_projection.v2`): validator, display rules, upgrader.

Read-only research tooling. Standard library only, Python 3.10+. It sits on top of `prop_explorer.py` (v1) and
`pure_gate.py`, both reused unchanged: every sports-only projection inside a v2 row embeds one valid
`prop_explorer_projection.v1` record, which embeds one valid `pure_forecast.v1` row.

A v2 row is one player-game-statistic as the explorer shows it, with every projection of it side by side:

* the best validated projection (by accuracy status) and an independent sports-only projection where one exists,
  each with model id/version and provenance that says whether it is market-informed and which inputs are
  market-derived (directly or indirectly);
* outcome probabilities (threshold ladder, quantiles), expected workload, opponent-adjusted matchup inputs,
  game-script sensitivity, ranked drivers, calibration with sample sizes, freshness and validation status, where
  accuracy status and betting-value status are separate enums;
* the current Kalshi quotes and, per rung and side, the estimated edge after fees and spread and the bet-up-to
  price, each recomputed here;
* a computed `display_label` per rung and per row that encodes the display rules (see PROP_EXPLORER.md).

A v2 row is a display record. It never feeds a PURE model, its training population, its evaluation population or
its scoring. It makes no accuracy claim and changes no wagering, staking or authority path.

Subcommands
-----------
validate  Validate a JSONL of v2 rows, or of v1 projections (v1 stays readable; it is validated by v1 rules).
upgrade   Build v2 rows from v1 projection JSONL(s) plus a v2 context JSON (refuses to overwrite).

See PROP_EXPLORER.md.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

try:  # `python -I` drops the script directory from sys.path
    import prop_explorer as v1
    import pure_gate as gate
except ImportError:  # pragma: no cover - exercised by the CLI under -I
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import prop_explorer as v1
    import pure_gate as gate

GateError = gate.GateError
_obj, _enum, _same = v1._obj, v1._enum, v1._same
_str_or_null, _num_or_null, _int_or_null = v1._str_or_null, v1._num_or_null, v1._int_or_null

EXPLORER_V2_VERSION = "prop_explorer 2.0.0"
SCHEMA_V2 = "prop_explorer_projection.v2"
RECORD_ROW = "explorer_row"
TOL = 1e-6

# ---------------------------------------------------------------------------------------------
# Field sets (the JSON Schema and the TypeScript declarations mirror these; tests keep them in sync)
# ---------------------------------------------------------------------------------------------

ROW_FIELDS = ("schema_version", "record_type", "row_id", "research_only", "identity", "capture", "player", "game",
              "projections", "best_validated_projection_id", "sports_only_projection_id", "primary_projection_id",
              "market", "market_evaluation", "display_label", "freshness", "null_reasons")
ROW_IDENTITY_FIELDS = ("sport", "game_id", "player_id", "statistic", "conditional_on_playing", "snapshot_at")
PROJECTION_FIELDS = ("projection_id", "role", "model", "provenance", "explorer_projection", "outcome",
                     "expected_workload", "matchup", "game_script", "drivers", "uncertainty", "calibration",
                     "freshness", "validation")
ROLES = ("champion", "challenger", "baseline", "best_accuracy", "other")
MODEL_FIELDS = ("model_id", "model_version", "model_frozen_hash")
MODEL_PROVENANCE_FIELDS = ("market_informed", "market_derived_inputs", "source")
MARKET_INPUT_FIELDS = ("input", "dependency", "market_source", "derivation")
DEPENDENCIES = ("direct", "indirect")
MARKET_SOURCES = ("sportsbook", "kalshi", "other_exchange", "settlement", "unknown")
SOURCE_FIELDS = ("repo", "commit", "path")
OUTCOME_FIELDS = ("unit", "mean", "median", "p10", "p90", "quantiles", "thresholds", "pmf")
MATCHUP_FIELDS = ("opponent_team_id", "opponent_adjusted", "opponent_inputs", "opponent_adjusted_by")
DRIVER_FIELDS = v1.DRIVER_FIELDS + ("importance_rank", "importance_basis")
IMPORTANCE_BASES = ("not_ranked", "producer_attribution", "model_structure")
CALIBRATION_FIELDS = ("status", "metrics", "sample_size", "scope", "evidence_id")
CALIBRATION_STATUSES = ("CALIBRATED", "ASSESSED", "MISCALIBRATED", "NOT_ASSESSED")
CALIBRATION_METRICS = ("interval_coverage_80", "threshold_ece", "brier", "log_loss", "crps", "calibration_slope")
SAMPLE_FIELDS = ("n_rows", "n_games")
PROJECTION_FRESHNESS_FIELDS = ("as_of", "inputs_max_observed_at", "staleness_seconds", "oldest_input_observed_at",
                               "kickoff_lead_seconds")
VALIDATION_FIELDS = ("accuracy_status", "value_status", "research_only", "accuracy_scope", "value_scope",
                     "source_verdict", "compared_against", "evidence", "caveats", "strict_rule_verdicts")
EVIDENCE_KINDS = v1.EVIDENCE_KINDS + ("value_results", "calibration", "promotion_decision")

# Accuracy promotion and betting-value promotion are separate questions with separate statuses.
ACCURACY_STATUSES = ("ACCURACY_PROMOTED", "ACCURACY_ACCEPTED_RESEARCH", "ACCURACY_SHADOW_PROSPECTIVE",
                     "ACCURACY_NOT_TESTED", "ACCURACY_INCONCLUSIVE", "ACCURACY_REJECTED", "ACCURACY_BLOCKED_DATA",
                     "BLOCKED_NOT_VALIDATED_POSTSEASON")
VALUE_STATUSES = ("VALIDATED_VALUE", "VALUE_SHADOW_PROSPECTIVE", "VALUE_NOT_TESTED", "VALUE_INCONCLUSIVE",
                  "VALUE_REJECTED", "VALUE_BLOCKED_DATA")
# Eligible to be the best validated projection.
ACCURACY_VALIDATED = ("ACCURACY_PROMOTED", "ACCURACY_ACCEPTED_RESEARCH")
# Eligible to be shown as the primary or sports-only projection, or to be priced against the market.
ACCURACY_DISPLAYABLE = ACCURACY_VALIDATED + ("ACCURACY_SHADOW_PROSPECTIVE", "ACCURACY_NOT_TESTED")
ACCURACY_RANK = {"ACCURACY_PROMOTED": 4, "ACCURACY_ACCEPTED_RESEARCH": 3, "ACCURACY_SHADOW_PROSPECTIVE": 2,
                 "ACCURACY_NOT_TESTED": 1}
# The v2 accuracy statuses a v1 status may become (a postseason row of any status may carry the source's label).
ACCURACY_OF_V1 = {"RESEARCH_HISTORICAL_ACCEPTED": ("ACCURACY_ACCEPTED_RESEARCH", "ACCURACY_PROMOTED"),
                  "SHADOW_PROSPECTIVE": ("ACCURACY_SHADOW_PROSPECTIVE",),
                  "INCONCLUSIVE": ("ACCURACY_INCONCLUSIVE",),
                  "REJECTED": ("ACCURACY_REJECTED", "BLOCKED_NOT_VALIDATED_POSTSEASON"),
                  "BLOCKED_DATA": ("ACCURACY_BLOCKED_DATA", "BLOCKED_NOT_VALIDATED_POSTSEASON"),
                  "NOT_VALIDATED": ("ACCURACY_NOT_TESTED", "BLOCKED_NOT_VALIDATED_POSTSEASON")}
# The accuracy status a binding negative strict-rule verdict forces (a row label overrides it).
ACCURACY_OF_VERDICT = {"REJECTED": "ACCURACY_REJECTED", "INCONCLUSIVE": "ACCURACY_INCONCLUSIVE",
                       "BLOCKED_DATA": "ACCURACY_BLOCKED_DATA"}

MARKET_FIELDS = ("venue", "event_ticker", "captured_at", "quotes")
VENUES = ("kalshi",)
QUOTE_FIELDS = ("contract_ticker", "at_least", "yes_bid", "yes_ask", "no_bid", "no_ask", "last_price", "observed_at")
EVALUATION_FIELDS = ("evaluated_projection_id", "fee_model", "slippage_per_contract", "min_edge",
                     "max_quote_age_seconds", "rungs")
FEE_MODEL_FIELDS = ("name", "rate", "multiplier", "rounding", "price_tick")
FEE_MODELS = ("kalshi_general_taker", "flat_per_contract")
FEE_ROUNDINGS = ("ceil_cent", "none")
EVALUATION_RUNG_FIELDS = ("contract_ticker", "at_least", "side", "model_probability", "executable_price", "spread",
                          "fee_per_contract", "edge_after_fees", "bet_up_to_price", "quote_age_seconds",
                          "display_label")
SIDES = ("yes", "no")
RUNG_LABELS = ("VALIDATED_OPPORTUNITY", "NO_EDGE", "RESEARCH", "MARKET_INFORMED", "NOT_EXECUTABLE", "STALE_QUOTE")
ROW_LABELS = ("VALIDATED_OPPORTUNITY", "MARKET_INFORMED", "RESEARCH", "NO_ELIGIBLE_PROJECTION")
ROW_FRESHNESS_FIELDS = ("snapshot_at", "projections_as_of_max", "inputs_max_observed_at", "market_observed_at_max",
                        "kickoff_lead_seconds")
TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9._-]*$")

# The contract publishes probabilities, prices and edges. It never sizes or recommends a bet.
STAKE_TOKENS = frozenset({"recommendation", "recommendations", "recommend", "recommended", "pick", "picks", "stake",
                          "stakes", "staking", "kelly", "bankroll", "units", "unit_size", "wager", "wagers", "tout",
                          "lean", "leans", "bet_size", "position_size"})


# ---------------------------------------------------------------------------------------------
# Display rules (pure functions; the validator recomputes and compares)
# ---------------------------------------------------------------------------------------------

def scope_covers(scope: dict | None, statistic: str, game: dict) -> bool:
    """A status scope covers a row when it names the statistic and the row's season type / season (when known)."""
    if not scope or not scope.get("statistics") or statistic not in scope["statistics"]:
        return False
    gst, season = game.get("season_type"), game.get("season")
    if scope.get("season_type") is not None and gst is not None and gst != scope["season_type"]:
        return False
    if scope.get("seasons") and season is not None and str(season) not in scope["seasons"]:
        return False
    return True


def value_validated_for(proj: dict, statistic: str, game: dict) -> bool:
    """Betting value is demonstrated for this row: VALIDATED_VALUE inside its value scope, calibrated, sports-only."""
    v = proj["validation"]
    return (v["value_status"] == "VALIDATED_VALUE" and scope_covers(v["value_scope"], statistic, game)
            and proj["calibration"]["status"] == "CALIBRATED" and not proj["provenance"]["market_informed"]
            and v["accuracy_status"] in ACCURACY_DISPLAYABLE)


def fee_per_contract(price: float, fee_model: dict) -> float:
    """Fee per contract at ``price`` (dollars). The Kalshi general taker schedule is rate x multiplier x P x (1-P),
    rounded up to the cent per contract (conservative for a one-contract order)."""
    if fee_model["name"] == "flat_per_contract":
        raw = float(fee_model["rate"]) * float(fee_model["multiplier"])
    else:
        raw = float(fee_model["rate"]) * float(fee_model["multiplier"]) * price * (1.0 - price)
    if fee_model["rounding"] == "ceil_cent":
        return math.ceil(raw * 100.0 - 1e-9) / 100.0
    return raw


def edge_after_fees(p: float, price: float, fee_model: dict, slippage: float) -> float:
    """Model probability minus everything paid per $1 contract when crossing the spread at ``price``."""
    return round(p - price - fee_per_contract(price, fee_model) - slippage, 6) + 0.0  # no -0.0


def bet_up_to_price(p: float, fee_model: dict, slippage: float, min_edge: float) -> float | None:
    """The highest price on the tick grid at which the edge after fees is still at least ``min_edge`` (and > 0)."""
    tick = float(fee_model["price_tick"])
    n = int(round(1.0 / tick))
    best = None
    for k in range(1, n):
        price = round(k * tick, 10)
        e = edge_after_fees(p, price, fee_model, slippage)
        if e > 0 and e >= min_edge - 1e-12:
            best = price
    return best


def threshold_probability(outcome: dict, at_least: float) -> float:
    for t in outcome["thresholds"]:
        if _same(float(t["at_least"]), float(at_least)):
            return float(t["probability"])
    raise GateError(f"the evaluated projection has no threshold at exactly {at_least}; quotes are priced at exact "
                    "strikes only (nothing is interpolated between rungs)")


def rung_label(proj: dict, statistic: str, game: dict, price: float | None, quote_age: int, edge: float | None,
               evaluation: dict) -> str:
    if proj["provenance"]["market_informed"]:
        return "MARKET_INFORMED"
    if price is None:
        return "NOT_EXECUTABLE"
    if quote_age > evaluation["max_quote_age_seconds"]:
        return "STALE_QUOTE"
    if not value_validated_for(proj, statistic, game):
        return "RESEARCH"
    if edge is not None and edge > 0 and edge >= float(evaluation["min_edge"]) - 1e-12:
        return "VALIDATED_OPPORTUNITY"
    return "NO_EDGE"


def compute_rungs(row: dict, evaluation: dict) -> list[dict]:
    """Every quote x side, priced against the evaluated projection's exact-strike ladder."""
    projs = {p["projection_id"]: p for p in row["projections"]}
    proj = projs[evaluation["evaluated_projection_id"]]
    snap = row["identity"]["snapshot_at"]
    fm, slip = evaluation["fee_model"], float(evaluation["slippage_per_contract"])
    min_edge = float(evaluation["min_edge"])
    out = []
    for q in row["market"]["quotes"]:
        p_yes = threshold_probability(proj["outcome"], q["at_least"])
        age = v1._seconds(snap, q["observed_at"], "quote age")
        for side in SIDES:
            p = p_yes if side == "yes" else round(1.0 - p_yes, 12)
            ask, bid = (q["yes_ask"], q["yes_bid"]) if side == "yes" else (q["no_ask"], q["no_bid"])
            price = None if ask is None else float(ask)
            edge = None if price is None else edge_after_fees(p, price, fm, slip)
            out.append({
                "contract_ticker": q["contract_ticker"], "at_least": q["at_least"], "side": side,
                "model_probability": round(p, 6), "executable_price": price,
                "spread": None if ask is None or bid is None else round(float(ask) - float(bid), 6) + 0.0,
                "fee_per_contract": None if price is None else fee_per_contract(price, fm),
                "edge_after_fees": edge, "bet_up_to_price": bet_up_to_price(p, fm, slip, min_edge),
                "quote_age_seconds": age,
                "display_label": rung_label(proj, row["identity"]["statistic"], row["game"], price, age, edge,
                                            evaluation)})
    return out


def compute_display_label(row: dict) -> str:
    """The row's headline label. A market-informed primary projection is always labelled MARKET_INFORMED, so its
    disagreement with the market is never shown as independent value; a model-market disagreement without
    demonstrated value is RESEARCH; only a rung with demonstrated value and a positive edge is an opportunity."""
    projs = {p["projection_id"]: p for p in row["projections"]}
    primary = projs.get(row["primary_projection_id"]) if row["primary_projection_id"] is not None else None
    if primary is None:
        return "NO_ELIGIBLE_PROJECTION"
    if primary["provenance"]["market_informed"]:
        return "MARKET_INFORMED"
    ev = row["market_evaluation"]
    if ev is not None and any(r["display_label"] == "VALIDATED_OPPORTUNITY" for r in ev["rungs"]):
        return "VALIDATED_OPPORTUNITY"
    return "RESEARCH"


def row_id(identity: dict) -> str:
    parts = [identity["sport"], identity["game_id"], identity["player_id"], identity["statistic"],
             "cond" if identity["conditional_on_playing"] else "unc", identity["snapshot_at"]]
    for p in parts:
        if "|" in str(p):
            raise GateError(f"identity component {p!r} contains '|'")
    return "|".join(str(p) for p in parts)


# ---------------------------------------------------------------------------------------------
# What a sports-only entry must mirror from its embedded v1 record
# ---------------------------------------------------------------------------------------------

def outcome_from_v1(rec: dict) -> dict:
    p = rec["forecast"]["projection"]
    return {"unit": rec["distribution"]["unit"], "mean": p["mean"], "median": p["median"], "p10": p["p10"],
            "p90": p["p90"], "quantiles": rec["distribution"]["quantiles"], "thresholds": p["thresholds"],
            "pmf": rec["distribution"]["pmf"]}


def matchup_from_drivers(drivers: list[dict] | None, opponent_team_id: str | None) -> dict | None:
    if drivers is None:
        return None
    inputs = [d["feature"] for d in drivers if d["matchup_role"] == "opponent_input"]
    adjusted = [d["feature"] for d in drivers if d["matchup_role"] == "opponent_adjusted"]
    return {"opponent_team_id": opponent_team_id, "opponent_adjusted": bool(inputs or adjusted),
            "opponent_inputs": inputs, "opponent_adjusted_by": adjusted}


def freshness_from_v1(rec: dict) -> dict:
    f = rec["freshness"]
    return {"as_of": f["as_of"], "inputs_max_observed_at": f["source_max_observed_at"],
            "staleness_seconds": f["staleness_seconds"], "oldest_input_observed_at": f["oldest_input_observed_at"],
            "kickoff_lead_seconds": f["kickoff_lead_seconds"]}


def calibration_from_v1(rec: dict) -> dict:
    hc = rec["uncertainty"]["holdout_interval_coverage"]
    if hc is None:
        return {"status": "NOT_ASSESSED", "metrics": {m: None for m in CALIBRATION_METRICS}, "sample_size": None,
                "scope": None, "evidence_id": None}
    return {"status": "ASSESSED", "metrics": {**{m: None for m in CALIBRATION_METRICS},
                                              "interval_coverage_80": hc["observed"]},
            "sample_size": {"n_rows": hc["n_rows"], "n_games": hc["n_games"]}, "scope": hc["scope"],
            "evidence_id": hc["evidence_id"]}


# ---------------------------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------------------------

def _scan_stake_keys(obj: Any, loc: str) -> None:
    if isinstance(obj, dict):
        for k, val in obj.items():
            if not (loc.endswith(".explorer_projection") or ".explorer_projection." in loc):
                for t in gate.tokens(str(k)):
                    if t in STAKE_TOKENS:
                        raise GateError(f"stake/recommendation key forbidden in an explorer row ({t!r}): {loc}.{k}")
            _scan_stake_keys(val, f"{loc}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _scan_stake_keys(item, f"{loc}[{i}]")


def _has_market_vocabulary(text: Any) -> bool:
    if not isinstance(text, str):
        return False
    try:
        gate.scan_value(text, "x")
    except GateError:
        return True
    return False


def _validate_outcome(o: Any, loc: str) -> None:
    _obj(o, loc, OUTCOME_FIELDS)
    _str_or_null(o["unit"], f"{loc}.unit")
    vals = {k: gate.finite_number(o[k], f"{loc}.{k}") for k in ("mean", "median", "p10", "p90")}
    if not vals["p10"] <= vals["median"] <= vals["p90"]:
        raise GateError(f"{loc}: p10 <= median <= p90")
    th = o["thresholds"]
    if not isinstance(th, list) or not th:
        raise GateError(f"{loc}.thresholds must be a nonempty ladder of {{at_least, probability}}")
    last_t, last_p = -math.inf, math.inf
    for i, t in enumerate(th):
        _obj(t, f"{loc}.thresholds[{i}]", ("at_least", "probability"))
        a = gate.finite_number(t["at_least"], f"{loc}.thresholds[{i}].at_least")
        pr = gate.finite_number(t["probability"], f"{loc}.thresholds[{i}].probability")
        if a <= last_t:
            raise GateError(f"{loc}.thresholds: strikes strictly ascending")
        if not 0.0 <= pr <= 1.0 or pr > last_p + v1.TOL:
            raise GateError(f"{loc}.thresholds: probabilities in [0,1] and non-increasing in the strike")
        last_t, last_p = a, pr
    pseudo = {"projection": {**vals, "thresholds": th,
                             "quantiles": [q for q in (o["quantiles"] or []) if isinstance(q, dict)
                                           and q.get("q") not in (0.1, 0.5, 0.9)]}}
    try:
        v1._validate_distribution({"unit": o["unit"], "quantiles": o["quantiles"], "pmf": o["pmf"]}, pseudo)
    except GateError as exc:
        raise GateError(f"{loc}: {str(exc).replace('distribution.', '')}") from exc


def _validate_drivers(drivers: Any, loc: str, *, market_informed: bool, market_inputs: set[str],
                      as_of: str) -> None:
    if drivers is None:
        return
    if not isinstance(drivers, list) or not drivers:
        raise GateError(f"{loc} must be a nonempty list, or null with a reason")
    names, ranks = set(), set()
    for i, d in enumerate(drivers):
        dl = f"{loc}[{i}]"
        _obj(d, dl, DRIVER_FIELDS)
        name = gate.nonempty_str(d["feature"], f"{dl}.feature")
        if name in names:
            raise GateError(f"duplicate driver {name!r}")
        names.add(name)
        _str_or_null(d["label"], f"{dl}.label")
        _enum(d["role"], v1.DRIVER_ROLES, f"{dl}.role")
        _enum(d["matchup_role"], v1.MATCHUP_ROLES, f"{dl}.matchup_role", nullable=True)
        gate.nonempty_str(d["source"], f"{dl}.source")
        if gate.iso_utc(d["observed_at"], f"{dl}.observed_at") > gate.iso_utc(as_of, "as_of"):
            raise GateError(f"{dl}.observed_at is after the projection's as_of")
        basis = _enum(d["importance_basis"], IMPORTANCE_BASES, f"{dl}.importance_basis")
        rank = _int_or_null(d["importance_rank"], f"{dl}.importance_rank")
        if basis == "not_ranked" and rank is not None:
            raise GateError(f"{dl}: importance_rank needs a ranking basis (importance_basis is not_ranked)")
        if basis != "not_ranked":
            if rank is None or rank < 1 or rank in ranks:
                raise GateError(f"{dl}.importance_rank must be a unique positive integer when ranked")
            ranks.add(rank)
        undisclosed = name not in market_inputs and (_has_market_vocabulary(name) or _has_market_vocabulary(d["label"]))
        if undisclosed:
            if not market_informed:
                raise GateError(f"{dl}: a sports-only projection's driver names a market input ({name!r})")
            raise GateError(f"{dl}: driver {name!r} reads market data but is not listed in "
                            "provenance.market_derived_inputs (undisclosed market input)")


def _validate_calibration(c: Any, loc: str, evidence: dict[str, dict]) -> None:
    _obj(c, loc, CALIBRATION_FIELDS)
    status = _enum(c["status"], CALIBRATION_STATUSES, f"{loc}.status")
    m = _obj(c["metrics"], f"{loc}.metrics", CALIBRATION_METRICS)
    for k in CALIBRATION_METRICS:
        x = _num_or_null(m[k], f"{loc}.metrics.{k}")
        if x is None:
            continue
        if k in ("interval_coverage_80", "threshold_ece", "brier") and not 0.0 <= x <= 1.0:
            raise GateError(f"{loc}.metrics.{k} must be in [0,1]")
        if k in ("log_loss", "crps") and x < 0:
            raise GateError(f"{loc}.metrics.{k} must be >= 0")
    if status == "NOT_ASSESSED":
        if any(m[k] is not None for k in CALIBRATION_METRICS) or any(c[k] is not None for k in
                                                                      ("sample_size", "scope", "evidence_id")):
            raise GateError(f"{loc}: NOT_ASSESSED carries no metrics, sample size, scope or evidence (nulls)")
        return
    if all(m[k] is None for k in CALIBRATION_METRICS):
        raise GateError(f"{loc}: {status} reports at least one metric")
    ss = _obj(c["sample_size"], f"{loc}.sample_size", SAMPLE_FIELDS)
    n = _int_or_null(ss["n_rows"], f"{loc}.sample_size.n_rows")
    if n is None or n < 1:
        raise GateError(f"{loc}.sample_size.n_rows must be a positive integer")
    g = _int_or_null(ss["n_games"], f"{loc}.sample_size.n_games")
    if g is not None and g < 1:
        raise GateError(f"{loc}.sample_size.n_games must be a positive integer or null")
    gate.nonempty_str(c["scope"], f"{loc}.scope")
    v1._scan_overstatement(c["scope"], f"{loc}.scope")
    e = evidence.get(c["evidence_id"]) if isinstance(c["evidence_id"], str) else None
    if e is None:
        raise GateError(f"{loc}.evidence_id must name an entry of the projection's validation.evidence")
    if status == "CALIBRATED" and e["kind"] not in ("calibration", "results", "value_results"):
        raise GateError(f"{loc}: CALIBRATED cites calibration, results or value_results evidence (a preregistered "
                        "criterion), not a bare scorecard")


def _validate_validation(v: Any, loc: str, proj: dict, statistic: str, game: dict) -> dict[str, dict]:
    _obj(v, loc, VALIDATION_FIELDS)
    acc = _enum(v["accuracy_status"], ACCURACY_STATUSES, f"{loc}.accuracy_status")
    val = _enum(v["value_status"], VALUE_STATUSES, f"{loc}.value_status")
    if v["research_only"] is not True:
        raise GateError(f"{loc}.research_only must be true")
    ascope = v1._validate_scope(v["accuracy_scope"], f"{loc}.accuracy_scope")
    vscope = None if v["value_scope"] is None else v1._validate_scope(v["value_scope"], f"{loc}.value_scope")
    _str_or_null(v["source_verdict"], f"{loc}.source_verdict")
    v1._scan_overstatement(v["source_verdict"], f"{loc}.source_verdict")
    if v["compared_against"] is not None and (not isinstance(v["compared_against"], list)
                                              or not all(isinstance(x, str) and x for x in v["compared_against"])):
        raise GateError(f"{loc}.compared_against must be a list of model versions or null")
    if not isinstance(v["caveats"], list) or not all(isinstance(c, str) and c.strip() for c in v["caveats"]):
        raise GateError(f"{loc}.caveats must be a list of nonempty strings")
    for i, c in enumerate(v["caveats"]):
        v1._scan_overstatement(c, f"{loc}.caveats[{i}]")
    evidence = v1.validate_evidence(v["evidence"], f"{loc}.evidence", EVIDENCE_KINDS)
    kinds = {e["kind"] for e in evidence.values()}
    mv = proj["model"]["model_version"]
    entries = v1.validate_strict_verdicts(v["strict_rule_verdicts"], evidence, f"{loc}.strict_rule_verdicts")
    for e in v1.binding_strict_verdicts(entries, mv, statistic, game):
        want = e["row_label"] or ACCURACY_OF_VERDICT.get(e["verdict"])
        if want is not None and acc != want:
            raise GateError(f"{loc}.accuracy_status must be {want}: the strict preregistered rule returned "
                            f"{e['verdict']} for {mv!r} on {e['scope']['season_type']} {statistic} ({e['lane']})")

    def need(kind_set: set[str], what: str) -> None:
        missing = kind_set - kinds
        if missing:
            raise GateError(f"{loc}: {what} needs evidence of kind {sorted(missing)}")

    if acc in ACCURACY_VALIDATED:
        need({"preregistration", "results"} | ({"promotion_decision"} if acc == "ACCURACY_PROMOTED" else set()), acc)
        if v["source_verdict"] is None:
            raise GateError(f"{loc}: {acc} needs the source's verdict verbatim (source_verdict)")
        if not scope_covers(ascope, statistic, game):
            raise GateError(f"{loc}.accuracy_scope does not cover this row ({statistic}, {game.get('season_type')} "
                            f"{game.get('season')}); a status applies only inside its evaluated scope")
    elif acc in ("ACCURACY_REJECTED", "ACCURACY_INCONCLUSIVE"):
        need({"results"}, acc)
    elif acc == "ACCURACY_SHADOW_PROSPECTIVE":
        need({"shadow_collection"}, acc)
    elif acc in ("ACCURACY_BLOCKED_DATA", "BLOCKED_NOT_VALIDATED_POSTSEASON") and not v["caveats"]:
        raise GateError(f"{loc}: {acc} needs a caveat naming what is missing")
    if acc == "BLOCKED_NOT_VALIDATED_POSTSEASON" and game.get("season_type") != "postseason":
        raise GateError(f"{loc}: BLOCKED_NOT_VALIDATED_POSTSEASON labels postseason games only")

    if val == "VALUE_NOT_TESTED":
        if vscope is not None:
            raise GateError(f"{loc}.value_scope is null when the value is not tested")
    elif val == "VALUE_BLOCKED_DATA":
        if not v["caveats"]:
            raise GateError(f"{loc}: VALUE_BLOCKED_DATA needs a caveat naming what is missing")
    else:
        if vscope is None:
            raise GateError(f"{loc}: {val} needs the value test's scope (value_scope)")
        if val == "VALUE_SHADOW_PROSPECTIVE":
            need({"shadow_collection"}, val)
        else:
            need({"value_results"}, val)
    if val == "VALIDATED_VALUE":
        need({"preregistration", "value_results"}, val)
        if proj["provenance"]["market_informed"]:
            raise GateError(f"{loc}: VALIDATED_VALUE needs a sports-only projection; a market-informed projection's "
                            "disagreement with the market is not independent evidence of value")
        if acc not in ACCURACY_DISPLAYABLE:
            raise GateError(f"{loc}: a {acc} projection cannot carry VALIDATED_VALUE")
        if proj["calibration"]["status"] != "CALIBRATED":
            raise GateError(f"{loc}: VALIDATED_VALUE needs calibration.status CALIBRATED")
    return evidence


def _check_mirrors_v1(proj: dict, rec: dict, loc: str, row: dict) -> None:
    """A sports-only entry shows exactly what its embedded v1 record proves."""
    ident = rec["identity"]
    for f in ("sport", "game_id", "player_id", "statistic", "conditional_on_playing"):
        if ident[f] != row["identity"][f]:
            raise GateError(f"{loc}.explorer_projection.identity.{f} disagrees with the row identity")
    if proj["model"]["model_version"] != ident["model_version"] or \
            proj["model"]["model_frozen_hash"] != ident["model_frozen_hash"]:
        raise GateError(f"{loc}.model must equal the embedded v1 record's model_version and model_frozen_hash")
    for name, want in (("player", rec["player"]), ("game", rec["game"])):
        if row[name] != want:
            raise GateError(f"row {name} disagrees with {loc}.explorer_projection.{name}")
    checks = (("outcome", outcome_from_v1(rec)), ("expected_workload", rec["expected_workload"]),
              ("game_script", rec["game_script"]), ("uncertainty", rec["uncertainty"]),
              ("freshness", freshness_from_v1(rec)),
              ("matchup", matchup_from_drivers(rec["drivers"], rec["game"]["opponent_team_id"])))
    for name, want in checks:
        if proj[name] != want:
            raise GateError(f"{loc}.{name} must mirror the embedded v1 record")
    vd = proj["drivers"]
    if (vd is None) != (rec["drivers"] is None) or (vd is not None and (
            len(vd) != len(rec["drivers"])
            or any({k: a[k] for k in v1.DRIVER_FIELDS} != b for a, b in zip(vd, rec["drivers"])))):
        raise GateError(f"{loc}.drivers must be the embedded v1 record's drivers, in order (plus importance)")
    va, vv = proj["validation"], rec["validation"]
    if proj["validation"]["accuracy_status"] not in ACCURACY_OF_V1[vv["status"]]:
        raise GateError(f"{loc}.validation.accuracy_status {va['accuracy_status']} is not a v2 reading of the v1 "
                        f"status {vv['status']} (allowed: {list(ACCURACY_OF_V1[vv['status']])})")
    for a, b in (("accuracy_scope", "scope"), ("source_verdict", "source_verdict"),
                 ("compared_against", "compared_against")):
        if va[a] != vv[b]:
            raise GateError(f"{loc}.validation.{a} must equal the embedded v1 validation.{b}")
    if va["strict_rule_verdicts"] != vv.get("strict_rule_verdicts", []):
        raise GateError(f"{loc}.validation.strict_rule_verdicts must equal the embedded v1 record's")
    if va["evidence"][:len(vv["evidence"])] != vv["evidence"]:
        raise GateError(f"{loc}.validation.evidence must start with the embedded v1 evidence, unchanged")
    missing = [c for c in vv["caveats"] if c not in va["caveats"]]
    if missing:
        raise GateError(f"{loc}.validation.caveats drop v1 caveats: {missing}")


def _validate_projection_entry(proj: Any, i: int, row: dict, snapshot) -> dict:
    loc = f"projections[{i}]"
    _obj(proj, loc, PROJECTION_FIELDS)
    pid = gate.nonempty_str(proj["projection_id"], f"{loc}.projection_id")
    if "|" in pid:
        raise GateError(f"{loc}.projection_id contains '|'")
    _enum(proj["role"], ROLES, f"{loc}.role")
    model = _obj(proj["model"], f"{loc}.model", MODEL_FIELDS)
    gate.nonempty_str(model["model_id"], f"{loc}.model.model_id")
    gate.nonempty_str(model["model_version"], f"{loc}.model.model_version")
    if not isinstance(model["model_frozen_hash"], str) or not gate.FROZEN_HASH_RE.match(model["model_frozen_hash"]):
        raise GateError(f"{loc}.model.model_frozen_hash must be 'sha256:<64 hex>' or 'git:<7-40 hex>'")
    prov = _obj(proj["provenance"], f"{loc}.provenance", MODEL_PROVENANCE_FIELDS)
    mi = prov["market_informed"]
    if not isinstance(mi, bool):
        raise GateError(f"{loc}.provenance.market_informed must be boolean")
    inputs = prov["market_derived_inputs"]
    if not isinstance(inputs, list):
        raise GateError(f"{loc}.provenance.market_derived_inputs must be a list (empty for a sports-only model)")
    names = set()
    for k, m in enumerate(inputs):
        ml = f"{loc}.provenance.market_derived_inputs[{k}]"
        _obj(m, ml, MARKET_INPUT_FIELDS)
        n = gate.nonempty_str(m["input"], f"{ml}.input")
        if n in names:
            raise GateError(f"duplicate market-derived input {n!r}")
        names.add(n)
        _enum(m["dependency"], DEPENDENCIES, f"{ml}.dependency")
        _enum(m["market_source"], MARKET_SOURCES, f"{ml}.market_source")
        gate.nonempty_str(m["derivation"], f"{ml}.derivation")
    if mi != bool(inputs):
        raise GateError(f"{loc}.provenance.market_informed must be true exactly when market_derived_inputs is "
                        "nonempty (an indirect input such as a rating fitted to sportsbook lines counts)")
    if prov["source"] is not None:
        src = _obj(prov["source"], f"{loc}.provenance.source", SOURCE_FIELDS)
        if not isinstance(src["repo"], str) or not v1.REPO_RE.match(src["repo"]):
            raise GateError(f"{loc}.provenance.source.repo must be 'owner/name'")
        if not isinstance(src["commit"], str) or not v1.COMMIT_RE.match(src["commit"]):
            raise GateError(f"{loc}.provenance.source.commit must be a 7-40 hex commit id")
        gate.nonempty_str(src["path"], f"{loc}.provenance.source.path")

    stat, game = row["identity"]["statistic"], row["game"]
    kickoff = gate.iso_utc(game["kickoff"], "game.kickoff")
    rec = proj["explorer_projection"]
    if mi:
        if rec is not None:
            raise GateError(f"{loc}: a market-informed projection embeds no v1 record (v1 is sports-only by "
                            "construction); explorer_projection is null")
    else:
        if rec is None:
            raise GateError(f"{loc}: a sports-only projection embeds its prop_explorer_projection.v1 record "
                            "(explorer_projection), which proves its inputs are sports-only")
        if not isinstance(rec, dict) or "forecast" not in rec:
            raise GateError(f"{loc}.explorer_projection must embed its pure_forecast.v1 row (a forecast_ref-only v1 "
                            "record is resolved before it goes into a v2 row)")
        try:
            v1.validate_projection(rec)
        except GateError as exc:
            raise GateError(f"{loc}.explorer_projection: {exc}") from exc

    _validate_outcome(proj["outcome"], f"{loc}.outcome")
    fr = _obj(proj["freshness"], f"{loc}.freshness", PROJECTION_FRESHNESS_FIELDS)
    as_of = gate.iso_utc(fr["as_of"], f"{loc}.freshness.as_of")
    smo = gate.iso_utc(fr["inputs_max_observed_at"], f"{loc}.freshness.inputs_max_observed_at")
    oldest = gate.iso_utc(fr["oldest_input_observed_at"], f"{loc}.freshness.oldest_input_observed_at")
    if not oldest <= smo <= as_of <= kickoff:
        raise GateError(f"{loc}.freshness: oldest_input_observed_at <= inputs_max_observed_at <= as_of <= kickoff")
    if as_of > snapshot:
        raise GateError(f"{loc}.freshness.as_of is after the row's snapshot_at")
    if fr["staleness_seconds"] != v1._seconds(fr["as_of"], fr["inputs_max_observed_at"], "freshness"):
        raise GateError(f"{loc}.freshness.staleness_seconds must equal as_of - inputs_max_observed_at")
    if fr["kickoff_lead_seconds"] != v1._seconds(game["kickoff"], fr["as_of"], "freshness"):
        raise GateError(f"{loc}.freshness.kickoff_lead_seconds must equal kickoff - as_of")

    _validate_drivers(proj["drivers"], f"{loc}.drivers", market_informed=mi, market_inputs=names, as_of=fr["as_of"])
    if proj["drivers"] is not None:
        obs = [gate.iso_utc(d["observed_at"]) for d in proj["drivers"]]
        if min(obs) < oldest or max(obs) > smo:
            raise GateError(f"{loc}.freshness must bracket every driver's observed_at")
    lineage = [{"name": d["feature"], "value": d["value"], "source": d["source"], "observed_at": d["observed_at"]}
               for d in (proj["drivers"] or [])]
    pseudo = {"projection": proj["outcome"], "feature_lineage": lineage, "statistic": stat}
    if proj["expected_workload"] is not None:
        try:
            v1._validate_workload(proj["expected_workload"], pseudo)
        except GateError as exc:
            raise GateError(f"{loc}.{exc}") from exc
    m = proj["matchup"]
    if m is not None:
        _obj(m, f"{loc}.matchup", MATCHUP_FIELDS)
        if m != matchup_from_drivers(proj["drivers"], game["opponent_team_id"]):
            raise GateError(f"{loc}.matchup must list the drivers whose matchup_role is opponent_input / "
                            "opponent_adjusted, with opponent_team_id = game.opponent_team_id")
    elif proj["drivers"] is not None:
        raise GateError(f"{loc}.matchup is derived from the drivers; it is null only when drivers are null")
    if proj["game_script"] is not None:
        try:
            v1._validate_game_script(proj["game_script"], pseudo)
        except GateError as exc:
            raise GateError(f"{loc}.{exc}") from exc
    u = _obj(proj["uncertainty"], f"{loc}.uncertainty", v1.UNCERTAINTY_FIELDS)
    if not _same(gate.finite_number(u["p10_p90_width"], f"{loc}.uncertainty.p10_p90_width"),
                 float(proj["outcome"]["p90"]) - float(proj["outcome"]["p10"])):
        raise GateError(f"{loc}.uncertainty.p10_p90_width must equal outcome p90 - p10")
    if u["interval_nominal_coverage"] != 0.8:
        raise GateError(f"{loc}.uncertainty.interval_nominal_coverage is 0.8 (the p10-p90 interval)")

    evidence = _validate_validation(proj["validation"], f"{loc}.validation", proj, stat, game)
    if u["holdout_interval_coverage"] is not None:
        _obj(u["holdout_interval_coverage"], f"{loc}.uncertainty.holdout_interval_coverage", v1.COVERAGE_FIELDS)
        if u["holdout_interval_coverage"]["evidence_id"] not in evidence:
            raise GateError(f"{loc}.uncertainty.holdout_interval_coverage.evidence_id must name an evidence entry")
    _validate_calibration(proj["calibration"], f"{loc}.calibration", evidence)
    if not mi:
        _check_mirrors_v1(proj, rec, loc, row)
    return proj


def _validate_market(mk: Any, snapshot, kickoff) -> None:
    _obj(mk, "market", MARKET_FIELDS)
    _enum(mk["venue"], VENUES, "market.venue")
    if mk["event_ticker"] is not None and not (isinstance(mk["event_ticker"], str)
                                               and TICKER_RE.match(mk["event_ticker"])):
        raise GateError("market.event_ticker must be an uppercase exchange ticker or null")
    captured = gate.iso_utc(mk["captured_at"], "market.captured_at")
    if captured > snapshot:
        raise GateError("market.captured_at is after the row's snapshot_at")
    quotes = mk["quotes"]
    if not isinstance(quotes, list) or not quotes:
        raise GateError("market.quotes must be a nonempty list (a row without quotes has market = null)")
    last, tickers = -math.inf, set()
    for i, q in enumerate(quotes):
        ql = f"market.quotes[{i}]"
        _obj(q, ql, QUOTE_FIELDS)
        t = q["contract_ticker"]
        if not isinstance(t, str) or not TICKER_RE.match(t) or t in tickers:
            raise GateError(f"{ql}.contract_ticker must be a unique uppercase exchange ticker")
        tickers.add(t)
        a = gate.finite_number(q["at_least"], f"{ql}.at_least")
        if a <= last:
            raise GateError("market.quotes must be strictly ascending in at_least (one ladder per row)")
        last = a
        vals = {f: _num_or_null(q[f], f"{ql}.{f}") for f in QUOTE_FIELDS[2:7]}
        for f, x in vals.items():
            if x is not None and not 0.0 < x < 1.0:
                raise GateError(f"{ql}.{f} must be a price in (0,1) dollars or null (no resting order)")
        for b, k in (("yes_bid", "yes_ask"), ("no_bid", "no_ask")):
            if vals[b] is not None and vals[k] is not None and vals[b] > vals[k] + v1.TOL:
                raise GateError(f"{ql}: {b} above {k}")
        obs = gate.iso_utc(q["observed_at"], f"{ql}.observed_at")
        if obs > captured:
            raise GateError(f"{ql}.observed_at is after market.captured_at")
        if obs >= kickoff:
            raise GateError(f"{ql}.observed_at is not before kickoff (the explorer prices pregame quotes only)")


def _validate_evaluation(ev: Any, row: dict, projs: dict[str, dict]) -> None:
    _obj(ev, "market_evaluation", EVALUATION_FIELDS)
    pid = ev["evaluated_projection_id"]
    if pid not in projs:
        raise GateError("market_evaluation.evaluated_projection_id must name one of the row's projections")
    if projs[pid]["validation"]["accuracy_status"] not in ACCURACY_DISPLAYABLE:
        raise GateError(f"market_evaluation: a {projs[pid]['validation']['accuracy_status']} projection is never "
                        "priced against the market")
    fm = _obj(ev["fee_model"], "market_evaluation.fee_model", FEE_MODEL_FIELDS)
    _enum(fm["name"], FEE_MODELS, "market_evaluation.fee_model.name")
    _enum(fm["rounding"], FEE_ROUNDINGS, "market_evaluation.fee_model.rounding")
    for f in ("rate", "multiplier"):
        if gate.finite_number(fm[f], f"market_evaluation.fee_model.{f}") < 0:
            raise GateError(f"market_evaluation.fee_model.{f} must be >= 0")
    tick = gate.finite_number(fm["price_tick"], "market_evaluation.fee_model.price_tick")
    if not 0 < tick <= 0.5 or abs(1.0 / tick - round(1.0 / tick)) > 1e-9:
        raise GateError("market_evaluation.fee_model.price_tick must divide 1 (e.g. 0.01)")
    for f in ("slippage_per_contract", "min_edge"):
        if gate.finite_number(ev[f], f"market_evaluation.{f}") < 0:
            raise GateError(f"market_evaluation.{f} must be >= 0")
    age = _int_or_null(ev["max_quote_age_seconds"], "market_evaluation.max_quote_age_seconds")
    if age is None or age < 1:
        raise GateError("market_evaluation.max_quote_age_seconds must be a positive integer")
    rungs = ev["rungs"]
    if not isinstance(rungs, list):
        raise GateError("market_evaluation.rungs must be a list")
    want = compute_rungs(row, ev)
    if len(rungs) != len(want):
        raise GateError("market_evaluation.rungs: one entry per quote and side (yes, then no), in quote order")
    for i, (got, exp) in enumerate(zip(rungs, want)):
        rl = f"market_evaluation.rungs[{i}]"
        _obj(got, rl, EVALUATION_RUNG_FIELDS)
        _enum(got["display_label"], RUNG_LABELS, f"{rl}.display_label")
        for f in EVALUATION_RUNG_FIELDS:
            a, b = got[f], exp[f]
            same = a == b if (a is None or b is None or isinstance(a, str) or isinstance(b, str)
                              or isinstance(a, bool)) else abs(float(a) - float(b)) <= TOL
            if not same:
                raise GateError(f"{rl}.{f} is {a!r}; recomputed {b!r}")


def null_paths(obj: Any, path: str = "") -> list[str]:
    """Null paths of a v2 row that need a reason. Exempt: the embedded v1 record (v1 owns its nulls, and it is null
    exactly when the projection is market-informed), null_reasons, x_ metadata, scenario margin bounds (unbounded),
    strict-verdict row labels (no label), driver ranks when not ranked, calibration metrics (not reported), the
    calibration sample/scope/evidence when NOT_ASSESSED, value_scope when the value is not tested, the matchup's
    opponent (mirrors game.opponent_team_id), quote prices (no resting order), computed rung fields, and the row's
    market time (null exactly when market is null)."""
    out: list[str] = []
    if obj is None:
        return [path]
    if isinstance(obj, dict):
        for k, val in obj.items():
            p = f"{path}.{k}" if path else k
            if not path and (k == "null_reasons" or k.startswith("x_")):
                continue
            if re.fullmatch(r"projections\[\d+\]", path) and k == "explorer_projection":
                continue
            if re.search(r"\.game_script\.scenarios\[\d+\]$", path) and k in ("margin_min", "margin_max"):
                continue
            if ".strict_rule_verdicts[" in path and k == "row_label":
                continue
            if re.search(r"\.drivers\[\d+\]$", path) and k == "importance_rank" and obj.get("importance_basis") == "not_ranked":
                continue
            if path.endswith(".calibration.metrics"):
                continue
            if path.endswith(".calibration") and k in ("sample_size", "scope", "evidence_id") \
                    and obj.get("status") == "NOT_ASSESSED":
                continue
            if path.endswith(".validation") and k == "value_scope" and obj.get("value_status") == "VALUE_NOT_TESTED":
                continue
            if path.endswith(".matchup") and k == "opponent_team_id":
                continue
            if re.fullmatch(r"market\.quotes\[\d+\]", path) and k in QUOTE_FIELDS[2:7]:
                continue
            if re.fullmatch(r"market_evaluation\.rungs\[\d+\]", path):
                continue
            if path == "freshness" and k == "market_observed_at_max":
                continue
            out.extend(null_paths(val, p))
    elif isinstance(obj, list):
        for i, val in enumerate(obj):
            out.extend(null_paths(val, f"{path}[{i}]"))
    return out


def validate_row(row: Any) -> dict:
    """Validate one v2 explorer row. Returns a small summary for file-level reporting."""
    if not isinstance(row, dict):
        raise GateError("row must be an object")
    if row.get("schema_version") != SCHEMA_V2:
        raise GateError(f"schema_version must be {SCHEMA_V2!r}, got {row.get('schema_version')!r}")
    if row.get("record_type") != RECORD_ROW:
        raise GateError(f"record_type must be {RECORD_ROW!r}")
    extra = sorted(k for k in set(row) - set(ROW_FIELDS) if not k.startswith("x_"))
    if extra:
        raise GateError(f"unexpected fields in an explorer row: {extra}")
    _obj({k: v for k, v in row.items() if k in ROW_FIELDS}, "row", ROW_FIELDS)
    _scan_stake_keys(row, "row")
    if row["research_only"] is not True:
        raise GateError("research_only must be true")
    ident = _obj(row["identity"], "identity", ROW_IDENTITY_FIELDS)
    for f in ("sport", "game_id", "player_id", "statistic"):
        gate.nonempty_str(ident[f], f"identity.{f}")
    if not isinstance(ident["conditional_on_playing"], bool):
        raise GateError("identity.conditional_on_playing must be boolean")
    snapshot = gate.iso_utc(ident["snapshot_at"], "identity.snapshot_at")
    if row["row_id"] != row_id(ident):
        raise GateError(f"row_id must be {row_id(ident)!r}")
    game = _obj(row["game"], "game", v1.GAME_FIELDS)
    kickoff = gate.iso_utc(game["kickoff"], "game.kickoff")
    v1._validate_player_game(row["player"], game, kickoff)
    if snapshot >= kickoff:
        raise GateError("identity.snapshot_at must be before kickoff (a pregame row)")
    cap = _obj(row["capture"], "capture", v1.CAPTURE_FIELDS)
    captured = gate.iso_utc(cap["captured_at"], "capture.captured_at")
    mode = _enum(cap["capture_mode"], v1.CAPTURE_MODES, "capture.capture_mode")
    gate.nonempty_str(cap["builder"], "capture.builder")
    if captured < snapshot:
        raise GateError("capture.captured_at is before the row's snapshot_at")
    if mode == "prospective_pregame" and captured >= kickoff:
        raise GateError("a prospective_pregame row must be captured before kickoff")

    projs_list = row["projections"]
    if not isinstance(projs_list, list) or not projs_list:
        raise GateError("projections must be a nonempty list")
    projs: dict[str, dict] = {}
    for i, p in enumerate(projs_list):
        _validate_projection_entry(p, i, row, snapshot)
        if p["projection_id"] in projs:
            raise GateError(f"duplicate projection_id {p['projection_id']!r}")
        projs[p["projection_id"]] = p

    def ref(field: str) -> dict | None:
        pid = row[field]
        if pid is None:
            return None
        if pid not in projs:
            raise GateError(f"{field} {pid!r} is not one of the row's projections")
        return projs[pid]

    def acc(p: dict) -> str:
        return p["validation"]["accuracy_status"]

    validated = [p for p in projs_list if acc(p) in ACCURACY_VALIDATED]
    displayable = [p for p in projs_list if acc(p) in ACCURACY_DISPLAYABLE]
    sports = [p for p in displayable if not p["provenance"]["market_informed"]]
    best = ref("best_validated_projection_id")
    if best is not None:
        if acc(best) not in ACCURACY_VALIDATED:
            raise GateError(f"best_validated_projection_id names a {acc(best)} projection; only "
                            f"{list(ACCURACY_VALIDATED)} can be the best validated projection (a REJECTED or BLOCKED "
                            "challenger never is)")
        if ACCURACY_RANK[acc(best)] < max(ACCURACY_RANK[acc(p)] for p in validated):
            raise GateError("best_validated_projection_id must have the highest accuracy status in the row")
    elif validated:
        raise GateError("best_validated_projection_id is null although a projection has a validated accuracy status")
    so = ref("sports_only_projection_id")
    if so is not None:
        if so["provenance"]["market_informed"]:
            raise GateError("sports_only_projection_id names a market-informed projection")
        if acc(so) not in ACCURACY_DISPLAYABLE:
            raise GateError(f"sports_only_projection_id names a {acc(so)} projection")
        if ACCURACY_RANK[acc(so)] < max(ACCURACY_RANK[acc(p)] for p in sports):
            raise GateError("sports_only_projection_id must have the highest accuracy status among the sports-only "
                            "projections")
    elif sports:
        raise GateError("sports_only_projection_id is null although a displayable sports-only projection exists")
    primary = ref("primary_projection_id")
    if primary is None:
        if displayable:
            raise GateError("primary_projection_id is null although a displayable projection exists")
    else:
        if acc(primary) not in ACCURACY_DISPLAYABLE:
            raise GateError(f"primary_projection_id names a {acc(primary)} projection")
        if best is not None and primary is not best:
            raise GateError("primary_projection_id must be the best validated projection when there is one")
        if ACCURACY_RANK[acc(primary)] < max(ACCURACY_RANK[acc(p)] for p in displayable):
            raise GateError("primary_projection_id must have the highest accuracy status in the row")

    mk, ev = row["market"], row["market_evaluation"]
    if mk is not None:
        _validate_market(mk, snapshot, kickoff)
    if ev is not None:
        if mk is None:
            raise GateError("market_evaluation needs market quotes (market is null)")
        _validate_evaluation(ev, row, projs)

    label = _enum(row["display_label"], ROW_LABELS, "display_label")
    want = compute_display_label(row)
    if label != want:
        raise GateError(f"display_label is {label}; the display rules give {want}")

    fr = _obj(row["freshness"], "freshness", ROW_FRESHNESS_FIELDS)
    if fr["snapshot_at"] != ident["snapshot_at"]:
        raise GateError("freshness.snapshot_at must equal identity.snapshot_at")
    as_ofs = [p["freshness"]["as_of"] for p in projs_list]
    smos = [p["freshness"]["inputs_max_observed_at"] for p in projs_list]
    for f, vals in (("projections_as_of_max", as_ofs), ("inputs_max_observed_at", smos)):
        if gate.iso_utc(fr[f], f"freshness.{f}") != max(gate.iso_utc(x) for x in vals):
            raise GateError(f"freshness.{f} must be the latest over the row's projections")
    mo = None if mk is None else max(gate.iso_utc(q["observed_at"]) for q in mk["quotes"])
    if (fr["market_observed_at_max"] is None) != (mo is None) or (
            mo is not None and gate.iso_utc(fr["market_observed_at_max"], "freshness.market_observed_at_max") != mo):
        raise GateError("freshness.market_observed_at_max must be the latest quote observed_at (null without quotes)")
    if fr["kickoff_lead_seconds"] != v1._seconds(game["kickoff"], ident["snapshot_at"], "freshness"):
        raise GateError("freshness.kickoff_lead_seconds must equal kickoff - snapshot_at")

    reasons = row["null_reasons"]
    if not isinstance(reasons, dict):
        raise GateError("null_reasons must be an object {path: reason}")
    nulls = set(null_paths(row))
    for path in sorted(nulls):
        r = reasons.get(path)
        if not isinstance(r, str) or not r.strip():
            raise GateError(f"{path} is null without a reason in null_reasons")
    stale = sorted(set(reasons) - nulls)
    if stale:
        raise GateError(f"null_reasons names fields that are not null (or need no reason): {stale}")
    for path, r in reasons.items():
        v1._scan_overstatement(r, f"null_reasons[{path!r}]")
    return {"display_label": label,
            "rung_labels": [r["display_label"] for r in (ev["rungs"] if ev else [])],
            "market_informed": [p["projection_id"] for p in projs_list if p["provenance"]["market_informed"]]}


def validate_file(rows: list[dict]) -> dict:
    """Validate a JSONL of v2 rows, or of v1 projections (v1 stays readable and is validated by the v1 rules)."""
    versions = {r.get("schema_version") if isinstance(r, dict) else None for r in rows}
    if versions == {v1.SCHEMA_PROJECTION}:
        return v1.validate_projection_file(rows)
    if versions != {SCHEMA_V2}:
        raise GateError(f"a file holds one schema version ({SCHEMA_V2!r} or {v1.SCHEMA_PROJECTION!r}), got "
                        f"{sorted(map(str, versions))}")
    ids: set[str] = set()
    labels: dict[str, int] = {}
    rung_labels: dict[str, int] = {}
    statuses: dict[str, int] = {}
    for i, row in enumerate(rows, 1):
        try:
            res = validate_row(row)
        except GateError as exc:
            rid = row.get("row_id", "?") if isinstance(row, dict) else "?"
            raise GateError(f"row {i} ({rid}): {exc}") from exc
        if row["row_id"] in ids:
            raise GateError(f"duplicate row_id {row['row_id']!r}")
        ids.add(row["row_id"])
        labels[res["display_label"]] = labels.get(res["display_label"], 0) + 1
        for lab in res["rung_labels"]:
            rung_labels[lab] = rung_labels.get(lab, 0) + 1
        for p in row["projections"]:
            k = f"{p['validation']['accuracy_status']}/{p['validation']['value_status']}"
            statuses[k] = statuses.get(k, 0) + 1
    return {"passed": True, "n": len(rows), "schema_version": SCHEMA_V2, "display_labels": dict(sorted(labels.items())),
            "rung_labels": dict(sorted(rung_labels.items())), "statuses": dict(sorted(statuses.items())),
            "tool": EXPLORER_V2_VERSION, "gate": gate.GATE_VERSION,
            "note": "Validates an exported display artifact. It makes no accuracy or value claim; it never feeds a "
                    "PURE model."}


# ---------------------------------------------------------------------------------------------
# Upgrader: v1 projections (+ context) -> v2 rows
# ---------------------------------------------------------------------------------------------

def _lookup(reasons: dict[str, str], path: str) -> str | None:
    return reasons.get(path) or reasons.get(re.sub(r"\[\d+\]", "[*]", path))


def entry_from_v1(rec: dict, mctx: dict) -> dict:
    """A sports-only projection entry built from one v1 record and its model context."""
    vv = rec["validation"]
    acc = mctx.get("accuracy_status") or ACCURACY_OF_V1[vv["status"]][0]
    prov = rec.get("provenance") or None
    return {
        "projection_id": mctx.get("projection_id", rec["identity"]["model_version"]),
        "role": mctx["role"],
        "model": {"model_id": mctx["model_id"], "model_version": rec["identity"]["model_version"],
                  "model_frozen_hash": rec["identity"]["model_frozen_hash"]},
        "provenance": {"market_informed": False, "market_derived_inputs": [],
                       "source": None if prov is None else {k: prov[k] for k in SOURCE_FIELDS}},
        "explorer_projection": rec,
        "outcome": outcome_from_v1(rec),
        "expected_workload": rec["expected_workload"],
        "matchup": matchup_from_drivers(rec["drivers"], rec["game"]["opponent_team_id"]),
        "game_script": rec["game_script"],
        "drivers": None if rec["drivers"] is None else [
            {**d, "importance_rank": None, "importance_basis": "not_ranked"} for d in rec["drivers"]],
        "uncertainty": rec["uncertainty"],
        "calibration": mctx.get("calibration") or calibration_from_v1(rec),
        "freshness": freshness_from_v1(rec),
        "validation": {
            "accuracy_status": acc, "value_status": mctx.get("value_status", "VALUE_NOT_TESTED"), "research_only": True,
            "accuracy_scope": vv["scope"], "value_scope": mctx.get("value_scope"),
            "source_verdict": vv["source_verdict"], "compared_against": vv["compared_against"],
            "evidence": vv["evidence"] + mctx.get("extra_evidence", []),
            "caveats": vv["caveats"] + mctx.get("extra_caveats", []),
            "strict_rule_verdicts": vv.get("strict_rule_verdicts", [])},
    }


def assemble_row(identity: dict, capture: dict, player: dict, game: dict, projections: list[dict], *,
                 market: dict | None = None,
                 evaluation: dict | None = None, reasons: dict[str, str] | None = None) -> dict:
    """Pick the best validated / sports-only / primary projection, price the quotes, compute the labels and
    freshness, and attach a reason to every null (``reasons`` maps v2 paths, ``[*]`` allowed, to reasons)."""
    def rank(p: dict) -> int:
        return ACCURACY_RANK.get(p["validation"]["accuracy_status"], 0)

    def top(cands: list[dict]) -> dict | None:
        cands = [p for p in cands if rank(p) > 0]
        if not cands:
            return None
        best_rank = max(rank(p) for p in cands)
        tied = [p for p in cands if rank(p) == best_rank]
        return next((p for p in tied if p["role"] == "champion"), tied[0])

    best = top([p for p in projections if p["validation"]["accuracy_status"] in ACCURACY_VALIDATED])
    sports = top([p for p in projections if not p["provenance"]["market_informed"]])
    primary = best or top(projections)
    row: dict[str, Any] = {
        "schema_version": SCHEMA_V2, "record_type": RECORD_ROW, "row_id": row_id(identity), "research_only": True,
        "identity": identity, "capture": capture, "player": player, "game": game, "projections": projections,
        "best_validated_projection_id": best and best["projection_id"],
        "sports_only_projection_id": sports and sports["projection_id"],
        "primary_projection_id": primary and primary["projection_id"],
        "market": market, "market_evaluation": None, "display_label": None,
    }
    if evaluation is not None and market is not None:
        ev = {**evaluation, "evaluated_projection_id": evaluation.get("evaluated_projection_id")
              or (primary and primary["projection_id"]), "rungs": []}
        ev["rungs"] = compute_rungs(row, ev)
        row["market_evaluation"] = {k: ev[k] for k in EVALUATION_FIELDS}
    row["display_label"] = compute_display_label(row)
    row["freshness"] = {
        "snapshot_at": identity["snapshot_at"],
        "projections_as_of_max": max(projections, key=lambda p: gate.iso_utc(p["freshness"]["as_of"]))["freshness"]["as_of"],
        "inputs_max_observed_at": max(projections, key=lambda p: gate.iso_utc(p["freshness"]["inputs_max_observed_at"]))[
            "freshness"]["inputs_max_observed_at"],
        "market_observed_at_max": None if market is None else max(
            market["quotes"], key=lambda q: gate.iso_utc(q["observed_at"]))["observed_at"],
        "kickoff_lead_seconds": v1._seconds(game["kickoff"], identity["snapshot_at"], "freshness")}
    out = {}
    for path in null_paths(row):
        r = _lookup(reasons or {}, path)
        if not r:
            raise GateError(f"{row['row_id']}: {path} is null and the context gives no reason; refusing to emit an "
                            "unexplained null")
        out[path] = r
    row["null_reasons"] = dict(sorted(out.items()))
    return row


def upgrade(records: list[dict], ctx: dict) -> list[dict]:
    """v2 rows from v1 projection records (one row per player-game-statistic and conditionality, in first-seen
    order). For several captures of one model, the latest at or before the snapshot is used."""
    for i, r in enumerate(records, 1):
        try:
            v1.validate_projection(r)
        except GateError as exc:
            raise GateError(f"v1 record {i}: {exc}") from exc
    groups: dict[tuple, list[dict]] = {}
    for r in records:
        ident = r["identity"]
        key = (ident["sport"], ident["game_id"], ident["player_id"], ident["statistic"], ident["conditional_on_playing"])
        groups.setdefault(key, []).append(r)
    if not isinstance(ctx, dict) or "capture" not in ctx:
        raise GateError("context must be an object with at least `capture` and `models`")
    models = ctx.get("models", {})
    rows = []
    for key, recs in groups.items():
        snap = ctx.get("snapshot_at") or max(recs, key=lambda r: gate.iso_utc(r["identity"]["as_of"]))["identity"]["as_of"]
        latest: dict[str, dict] = {}
        for r in sorted(recs, key=lambda r: gate.iso_utc(r["identity"]["as_of"])):
            if gate.iso_utc(r["identity"]["as_of"]) <= gate.iso_utc(snap):
                latest[r["identity"]["model_version"]] = r
        order = [r["identity"]["model_version"] for r in recs if r["identity"]["model_version"] in latest]
        order = list(dict.fromkeys(order))
        entries = []
        for mv in order:
            if mv not in models:
                raise GateError(f"context.models has no entry for model_version {mv!r} (role and model_id are required)")
            entries.append(entry_from_v1(latest[mv], models[mv]))
        first = latest[order[0]]
        identity = {"sport": key[0], "game_id": key[1], "player_id": key[2], "statistic": key[3],
                    "conditional_on_playing": key[4], "snapshot_at": snap}
        inherited = {f"projections[{i}]": latest[mv]["null_reasons"] for i, mv in enumerate(order)}
        inherited[""] = first["null_reasons"]
        reasons = {**_flatten(inherited), **ctx.get("null_reasons", {})}
        rows.append(assemble_row(identity, {k: ctx["capture"][k] for k in v1.CAPTURE_FIELDS}, first["player"],
                                 first["game"], entries, reasons=reasons))
    validate_file(rows)
    return rows


def _flatten(inherited: dict[str, dict]) -> dict[str, str]:
    """Inherited v1 reasons rewritten to their v2 paths."""
    out: dict[str, str] = {}
    for prefix, reasons in inherited.items():
        for p, r in reasons.items():
            if prefix == "":
                if p.startswith(("player.", "game.")):
                    out[p] = r
                continue
            q = re.sub(r"^distribution\.(pmf|unit)$", r"outcome.\1", p)
            q = re.sub(r"^validation\.scope\.", "validation.accuracy_scope.", q)
            out[f"{prefix}.{q}"] = r
            if p == "drivers":
                out[f"{prefix}.matchup"] = r
    return out


def dumps_jsonl(rows: list[dict]) -> str:
    return "".join(json.dumps(r, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n" for r in rows)


# ---------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    v = sub.add_parser("validate", help="Validate v2 explorer rows (or v1 projections)")
    v.add_argument("--rows", required=True)
    u = sub.add_parser("upgrade", help="Build v2 rows from v1 projections and a v2 context JSON")
    u.add_argument("--projections", required=True, nargs="+")
    u.add_argument("--context", required=True)
    u.add_argument("--out", required=True, help="output JSONL; refuses to overwrite an existing file")
    ns = parser.parse_args(argv)
    try:
        if ns.command == "validate":
            result = validate_file(gate.load_jsonl(ns.rows))
        else:
            out = Path(ns.out)
            if out.exists():
                raise GateError(f"{out} exists; explorer rows are write-once")
            ctx = json.loads(Path(ns.context).read_text(encoding="utf-8"))
            recs = [r for p in ns.projections for r in gate.load_jsonl(p)]
            built = upgrade(recs, ctx)
            out.write_text(dumps_jsonl(built), encoding="utf-8")
            result = {"passed": True, "n": len(built), "out": str(out), "tool": EXPLORER_V2_VERSION}
    except (GateError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
