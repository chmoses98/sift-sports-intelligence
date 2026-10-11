#!/usr/bin/env python3
"""Combined Player Prop Explorer projection contract (`prop_explorer_projection.v1`): validator and converter.

Read-only research tooling. Standard library only, Python 3.10+. It sits beside `pure_gate.py` and reuses it
unchanged: every explorer projection embeds (or references) one valid `pure_forecast.v1` row, and the market
vocabulary check is pure_gate's own.

Two record types, kept in separate files:

* ``projection`` (`prop_explorer_projection.v1`): everything the explorer shows about one model's forecast of
  one player-game-statistic at one cutoff: identity, player and game context, the outcome distribution, the
  threshold ladder (inside the embedded v1 row), expected workload, named drivers with lineage, game-script
  sensitivity, uncertainty and freshness, the model's validation status with evidence, and what changed since
  the previous capture. It never carries a market price, a line, a recommendation or a stake.
* ``market_comparison`` (`prop_explorer_market_comparison.v1`): an optional record keyed by the same identity,
  written by the downstream market reader, for side-by-side display. It never carries model output.

Subcommands
-----------
validate  Validate a projections JSONL (and optionally a market-comparison JSONL against it).
convert   Build explorer projections from pure_forecast.v1 rows plus a context JSON. Every field the source
          does not provide becomes an explicit null with a reason from the context; it refuses otherwise.

See PROP_EXPLORER.md.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable

try:  # `python -I` drops the script directory from sys.path
    import pure_gate as gate
except ImportError:  # pragma: no cover - exercised by the CLI under -I
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import pure_gate as gate

GateError = gate.GateError

EXPLORER_VERSION = "prop_explorer 1.0.0"
SCHEMA_PROJECTION = "prop_explorer_projection.v1"
SCHEMA_MARKET = "prop_explorer_market_comparison.v1"
RECORD_PROJECTION = "projection"
RECORD_MARKET = "market_comparison"
TOL = 1e-9

# ---------------------------------------------------------------------------------------------
# Field sets (the JSON Schema mirrors these; a test keeps them in sync)
# ---------------------------------------------------------------------------------------------

PROJECTION_REQUIRED = ("schema_version", "record_type", "explorer_id", "research_only", "identity", "capture",
                       "player", "game", "distribution", "expected_workload", "drivers", "game_script",
                       "uncertainty", "freshness", "validation", "change_explanation", "null_reasons")
PROJECTION_OPTIONAL = ("forecast", "forecast_ref", "provenance")
IDENTITY_FIELDS = ("sport", "game_id", "player_id", "statistic", "model_version", "model_frozen_hash",
                   "conditional_on_playing", "as_of")
CAPTURE_FIELDS = ("captured_at", "capture_mode", "builder")
CAPTURE_MODES = ("prospective_pregame", "historical_research_replay")
PLAYER_FIELDS = ("name", "position", "team_id", "team_abbr")
GAME_FIELDS = ("kickoff", "season", "season_type", "week", "home_team_id", "away_team_id", "opponent_team_id",
               "is_home")
SEASON_TYPES = ("preseason", "regular", "play_in", "postseason")
DISTRIBUTION_FIELDS = ("unit", "quantiles", "pmf")
WORKLOAD_FIELDS = ("measure", "unit", "mean", "median", "p10", "p90", "lineage")
WORKLOAD_MEASURES = ("snaps", "snap_share", "routes_run", "targets", "carries", "touches", "pass_attempts",
                     "minutes", "plate_appearances", "batters_faced", "pitches", "outs_recorded", "time_on_ice",
                     "shifts")
WORKLOAD_LINEAGE_KINDS = ("self", "sibling_forecast", "feature")
DRIVER_FIELDS = ("feature", "label", "role", "matchup_role", "value", "source", "observed_at")
DRIVER_ROLES = ("opportunity", "efficiency", "workload", "team_environment", "participation", "rest_schedule",
                "history_depth", "opponent", "other")
MATCHUP_ROLES = ("opponent_input", "opponent_adjusted", "not_matchup")
SCRIPT_FIELDS = ("conditioning", "perspective_team_id", "exhaustive", "source", "scenarios")
SCRIPT_CONDITIONING = ("team_final_margin",)
SCRIPT_SOURCE_FIELDS = ("model_version", "model_frozen_hash", "class", "description")
SCENARIO_FIELDS = ("scenario_id", "label", "margin_min", "margin_max", "probability", "probability_kind",
                   "projection")
PROBABILITY_KINDS = ("simulation_share", "model_probability")
SCENARIO_PROJECTION_FIELDS = ("mean", "median", "p10", "p90")
SCRIPT_MIXTURE_TOL_REL, SCRIPT_MIXTURE_TOL_ABS = 0.02, 0.05
UNCERTAINTY_FIELDS = ("p10_p90_width", "interval_nominal_coverage", "holdout_interval_coverage")
COVERAGE_FIELDS = ("observed", "n_rows", "n_games", "scope", "evidence_id")
FRESHNESS_FIELDS = ("as_of", "source_max_observed_at", "staleness_seconds", "oldest_input_observed_at",
                    "kickoff_lead_seconds")
VALIDATION_FIELDS = ("status", "research_only", "scope", "source_verdict", "compared_against", "evidence",
                     "caveats")
VALIDATION_STATUSES = ("RESEARCH_HISTORICAL_ACCEPTED", "SHADOW_PROSPECTIVE", "INCONCLUSIVE", "REJECTED",
                       "BLOCKED_DATA", "NOT_VALIDATED")
SCOPE_FIELDS = ("season_type", "seasons", "statistics", "population")
EVIDENCE_FIELDS = ("id", "kind", "repo", "commit", "path", "url")
EVIDENCE_KINDS = ("preregistration", "results", "scorecard", "source_audit", "rerun", "pull_request",
                  "shadow_collection", "sidecar_sample", "other")
CHANGE_FIELDS = ("prior", "model_changed", "delta", "method", "attributed_drivers")
CHANGE_PRIOR_FIELDS = ("explorer_id", "as_of", "model_version", "model_signature")
CHANGE_METHODS = ("driver_value_diff", "producer_attribution")
DELTA_FIELDS = ("mean", "median", "p10", "p90")
FORECAST_REF_FIELDS = ("uri", "model_signature")
PROVENANCE_FIELDS = ("repo", "commit", "path", "file_sha256", "selection", "conversion")

MARKET_REQUIRED = ("schema_version", "record_type", "research_only", "identity", "projection_explorer_id",
                   "venue", "market_ref", "listed_at", "quoted_at", "captured_at", "rungs", "null_reasons")
MARKET_IDENTITY = ("sport", "game_id", "player_id", "statistic")
RUNG_FIELDS = ("at_least", "yes_bid", "yes_ask", "no_bid", "no_ask", "quote_probability")

SIGNATURE_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
# A rung spelled into a statistic name ("receiving_yards_over_60", "points_25+").
MARKET_RUNG_RE = re.compile(r"(?:[_\- ](?:over|under|at_least|ge|gte)[_\- ]?\d+(?:\.\d+)?|\d+(?:\.\d+)?\+)$")
COMMIT_RE = re.compile(r"^[0-9a-f]{7,40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")

# Betting-recommendation vocabulary, refused as keys of a projection (pure_gate already refuses market terms).
RECOMMENDATION_TOKENS = frozenset({
    "recommendation", "recommendations", "recommend", "recommended", "pick", "picks", "lean", "leans", "stake",
    "stakes", "staking", "kelly", "bankroll", "edge", "edges", "ev", "fair", "line", "lines", "venue", "payout",
    "roi", "units", "unit_size", "tout",
})
# Keys that are model output: refused inside a market-comparison record.
MODEL_OUTPUT_KEYS = frozenset({
    "forecast", "forecast_ref", "projection", "distribution", "drivers", "expected_workload", "game_script",
    "validation", "change_explanation", "mean", "median", "p10", "p90", "quantiles", "thresholds", "pmf",
    "model_version", "model_frozen_hash", "model_probability", "model_p", "fair_probability", "edge", "ev",
    "recommendation", "stake", "kelly", "pick",
})
# Words that overstate evidence. Refused in status text (the validation block and null reasons) unless negated
# ("not validated"). Driver and scenario labels get the market check only ("edge rusher" is a football word).
OVERSTATEMENT_TOKENS = frozenset({
    "validated", "verified", "proven", "profitable", "profit", "profits", "guaranteed", "guarantee", "certified",
    "edge", "edges", "ev", "roi",
})
_PLUS_EV_RE = re.compile(r"\+\s?ev\b", re.I)
NEGATIONS = frozenset({"not", "no", "never", "un", "without", "nothing", "none", "nor"})


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------

def _obj(value: Any, loc: str, fields: tuple[str, ...], optional: tuple[str, ...] = ()) -> dict:
    """Object with exactly ``fields`` present (values may be null) plus any of ``optional``."""
    if not isinstance(value, dict):
        raise GateError(f"{loc} must be an object")
    missing = [f for f in fields if f not in value]
    if missing:
        raise GateError(f"{loc} missing {missing} (a field the source lacks is an explicit null with a reason)")
    extra = sorted(set(value) - set(fields) - set(optional))
    if extra:
        raise GateError(f"{loc} unexpected fields {extra}")
    return value


def _str_or_null(value: Any, loc: str) -> str | None:
    if value is None:
        return None
    return gate.nonempty_str(value, loc)


def _num_or_null(value: Any, loc: str) -> float | None:
    if value is None:
        return None
    return gate.finite_number(value, loc)


def _int_or_null(value: Any, loc: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise GateError(f"{loc} must be an integer or null")
    return value


def _enum(value: Any, allowed: tuple[str, ...], loc: str, *, nullable: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if value not in allowed:
        raise GateError(f"{loc} must be one of {list(allowed)}{' or null' if nullable else ''}, got {value!r}")
    return value


def _same(a: Any, b: Any) -> bool:
    """Exact equality for scalars, numerically tolerant for floats."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= TOL * max(1.0, abs(float(a)), abs(float(b)))
    return a == b


def _seconds(later: str, earlier: str, desc: str) -> int:
    delta = gate.iso_utc(later, desc) - gate.iso_utc(earlier, desc)
    return int(round(delta.total_seconds()))


def _scan_text_market(value: Any, loc: str) -> None:
    if value is not None:
        gate.scan_value(value, loc)


def overstatement(text: str) -> str | None:
    """The first overstating word in ``text`` that no nearby negation qualifies, or None."""
    toks = gate.tokens(text)
    for i, t in enumerate(toks):
        if t in OVERSTATEMENT_TOKENS and not NEGATIONS.intersection(toks[max(0, i - 3):i]):
            return t
        if t == "plus" and i + 1 < len(toks) and toks[i + 1] == "ev":
            return "plus_ev"
    if _PLUS_EV_RE.search(text):
        return "+EV"
    return None


def _scan_overstatement(value: Any, loc: str) -> None:
    if isinstance(value, str):
        hit = overstatement(value)
        if hit:
            raise GateError(f"{loc} overstates the evidence ({hit!r}): {value!r}. Use the validation status "
                            f"enum and plain caveats")


def _scan_recommendation_keys(obj: Any, loc: str) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            for t in gate.tokens(str(k)):
                if t in RECOMMENDATION_TOKENS:
                    raise GateError(f"betting/market key forbidden in a projection ({t!r}): {loc}.{k}")
            _scan_recommendation_keys(v, f"{loc}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _scan_recommendation_keys(item, f"{loc}[{i}]")


def model_signature(forecast: dict) -> str:
    return "sha256:" + gate.model_signature(forecast)


def explorer_id(identity: dict) -> str:
    parts = [identity["sport"], identity["game_id"], identity["player_id"], identity["statistic"],
             identity["model_version"], "cond" if identity["conditional_on_playing"] else "unc", identity["as_of"]]
    for p in parts:
        if "|" in str(p):
            raise GateError(f"identity component {p!r} contains '|'")
    return "|".join(str(p) for p in parts)


def null_paths(obj: Any, path: str = "") -> list[str]:
    """Dotted paths of every null value in an explorer record, excluding the embedded forecast (pure_gate owns
    its nulls), null_reasons itself, x_ metadata, change-explanation values that mirror lineage, and scenario
    margin bounds (null means unbounded)."""
    out: list[str] = []
    if obj is None:
        return [path]
    if isinstance(obj, dict):
        for k, v in obj.items():
            if not path and (k in ("forecast", "null_reasons") or k.startswith("x_")):
                continue
            if path.startswith("change_explanation.attributed_drivers[") and k in ("prior_value", "current_value"):
                continue
            if path.startswith("game_script.scenarios[") and k in ("margin_min", "margin_max"):
                continue  # null = unbounded by definition
            out.extend(null_paths(v, f"{path}.{k}" if path else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.extend(null_paths(v, f"{path}[{i}]"))
    return out


# ---------------------------------------------------------------------------------------------
# Projection validation
# ---------------------------------------------------------------------------------------------

Resolver = Callable[[str], "dict | None"]


def _resolve_forecast(row: dict, resolver: Resolver | None) -> dict:
    ref = row.get("forecast_ref")
    if ref is not None:
        _obj(ref, "forecast_ref", FORECAST_REF_FIELDS)
        gate.nonempty_str(ref["uri"], "forecast_ref.uri")
        if not isinstance(ref["model_signature"], str) or not SIGNATURE_RE.match(ref["model_signature"]):
            raise GateError("forecast_ref.model_signature must be 'sha256:<64 hex>' of the v1 row's model-owned fields")
    if "forecast" in row:
        forecast = row["forecast"]
    elif ref is not None:
        forecast = resolver(ref["model_signature"]) if resolver else None
        if forecast is None:
            raise GateError(f"forecast_ref {ref['model_signature']} could not be resolved; pass the pure_forecast.v1 "
                            "file it points to (validate --forecasts)")
    else:
        raise GateError("a projection embeds `forecast` (a pure_forecast.v1 row) or references it with `forecast_ref`")
    if not isinstance(forecast, dict):
        raise GateError("forecast must be a pure_forecast.v1 object")
    try:
        version = gate.validate(forecast)
    except GateError as exc:
        raise GateError(f"forecast: {exc}") from exc
    if version != gate.SCHEMA_V1:
        raise GateError("forecast must be pure_forecast.v1 (convert kit-interim v0 rows with the sport's own "
                        "converter first)")
    if ref is not None and ref["model_signature"] != model_signature(forecast):
        raise GateError("forecast_ref.model_signature does not match the forecast row")
    return forecast


def _validate_distribution(d: Any, forecast: dict) -> None:
    _obj(d, "distribution", DISTRIBUTION_FIELDS)
    _str_or_null(d["unit"], "distribution.unit")
    p = forecast["projection"]
    if not isinstance(d["quantiles"], list) or not d["quantiles"]:
        raise GateError("distribution.quantiles must be a nonempty list of {q, value}")
    anchors = {0.1: float(p["p10"]), 0.5: float(p["median"]), 0.9: float(p["p90"])}
    for item in p.get("quantiles", []):
        anchors[round(float(item["q"]), 12)] = float(item["value"])
    seen: dict[float, float] = {}
    last_q, last_v = 0.0, -math.inf
    for i, item in enumerate(d["quantiles"]):
        _obj(item, f"distribution.quantiles[{i}]", ("q", "value"))
        q = gate.finite_number(item["q"], f"distribution.quantiles[{i}].q")
        v = gate.finite_number(item["value"], f"distribution.quantiles[{i}].value")
        if not 0.0 < q < 1.0 or q <= last_q:
            raise GateError("distribution.quantiles: q strictly ascending inside (0,1)")
        if v < last_v - TOL:
            raise GateError("distribution.quantiles: values non-decreasing in q")
        last_q, last_v = q, v
        seen[round(q, 12)] = v
    for q, v in anchors.items():
        if q not in seen:
            raise GateError(f"distribution.quantiles must include every quantile of the forecast (missing q={q})")
        if not _same(seen[q], v):
            raise GateError(f"distribution.quantiles q={q} disagrees with the forecast ({seen[q]} != {v})")
    pmf = d["pmf"]
    if pmf is None:
        return
    if not isinstance(pmf, list) or not pmf:
        raise GateError("distribution.pmf must be a nonempty list of {value, probability} or null")
    total, mean, last = 0.0, 0.0, -math.inf
    values, probs = [], []
    for i, item in enumerate(pmf):
        _obj(item, f"distribution.pmf[{i}]", ("value", "probability"))
        v = gate.finite_number(item["value"], f"distribution.pmf[{i}].value")
        pr = gate.finite_number(item["probability"], f"distribution.pmf[{i}].probability")
        if v <= last:
            raise GateError("distribution.pmf values must be strictly ascending")
        if not 0.0 <= pr <= 1.0:
            raise GateError("distribution.pmf probabilities must be in [0,1]")
        last = v
        total += pr
        mean += v * pr
        values.append(v)
        probs.append(pr)
    if abs(total - 1.0) > 1e-6:
        raise GateError(f"distribution.pmf must sum to 1 (got {total:.8f})")
    if abs(mean - float(p["mean"])) > 1e-3 * max(1.0, abs(float(p["mean"]))):
        raise GateError(f"distribution.pmf mean {mean:.6f} disagrees with forecast mean {p['mean']}")
    for t in p["thresholds"]:
        tail = sum(pr for v, pr in zip(values, probs) if v >= float(t["at_least"]) - TOL)
        if abs(tail - float(t["probability"])) > 1e-3:
            raise GateError(f"distribution.pmf P(X >= {t['at_least']}) = {tail:.6f} disagrees with the forecast "
                            f"threshold probability {t['probability']}")


def _validate_workload(w: Any, forecast: dict) -> dict | None:
    """Returns the sibling reference to cross-check at file level, if any."""
    if w is None:
        return None
    _obj(w, "expected_workload", WORKLOAD_FIELDS)
    _enum(w["measure"], WORKLOAD_MEASURES, "expected_workload.measure")
    gate.nonempty_str(w["unit"], "expected_workload.unit")
    mean = gate.finite_number(w["mean"], "expected_workload.mean")
    vals = {k: _num_or_null(w[k], f"expected_workload.{k}") for k in ("median", "p10", "p90")}
    if all(v is not None for v in vals.values()) and not vals["p10"] <= vals["median"] <= vals["p90"]:
        raise GateError("expected_workload: p10 <= median <= p90")
    lin = w["lineage"]
    if not isinstance(lin, dict):
        raise GateError("expected_workload.lineage must be an object")
    kind = _enum(lin.get("kind"), WORKLOAD_LINEAGE_KINDS, "expected_workload.lineage.kind")
    p = forecast["projection"]
    if kind == "self":
        _obj(lin, "expected_workload.lineage", ("kind",))
        for k, v in (("mean", mean), *vals.items()):
            if v is None or not _same(v, p[k]):
                raise GateError(f"expected_workload (self) {k} must equal the forecast's {k}")
        return None
    if kind == "feature":
        _obj(lin, "expected_workload.lineage", ("kind", "feature"))
        feat = {f["name"]: f for f in forecast["feature_lineage"]}.get(lin["feature"])
        if feat is None:
            raise GateError(f"expected_workload.lineage.feature {lin['feature']!r} is not in the forecast's "
                            "feature_lineage")
        if not _same(feat["value"], mean):
            raise GateError("expected_workload.mean must equal its lineage feature's value")
        if any(v is not None for v in vals.values()):
            raise GateError("expected_workload from a single feature carries no median/p10/p90 (explicit nulls)")
        return None
    _obj(lin, "expected_workload.lineage", ("kind", "statistic", "model_signature"))
    stat = gate.nonempty_str(lin["statistic"], "expected_workload.lineage.statistic")
    if stat == forecast["statistic"]:
        raise GateError("expected_workload.lineage: a sibling forecast is a different statistic (use kind 'self')")
    if not isinstance(lin["model_signature"], str) or not SIGNATURE_RE.match(lin["model_signature"]):
        raise GateError("expected_workload.lineage.model_signature must be 'sha256:<64 hex>'")
    return {"statistic": stat, "model_signature": lin["model_signature"], "mean": mean, **vals}


def _validate_drivers(drivers: Any, forecast: dict) -> None:
    if drivers is None:
        return
    if not isinstance(drivers, list) or not drivers:
        raise GateError("drivers must be a nonempty list, or null with a reason")
    lineage = {f["name"]: f for f in forecast["feature_lineage"]}
    names: set[str] = set()
    for i, d in enumerate(drivers):
        loc = f"drivers[{i}]"
        _obj(d, loc, DRIVER_FIELDS)
        name = gate.nonempty_str(d["feature"], f"{loc}.feature")
        if name in names:
            raise GateError(f"duplicate driver {name!r}")
        names.add(name)
        gate.scan_value(name, f"{loc}.feature")
        _str_or_null(d["label"], f"{loc}.label")
        _scan_text_market(d["label"], f"{loc}.label")
        _enum(d["role"], DRIVER_ROLES, f"{loc}.role")
        _enum(d["matchup_role"], MATCHUP_ROLES, f"{loc}.matchup_role", nullable=True)
        feat = lineage.get(name)
        if feat is None:
            raise GateError(f"{loc}.feature {name!r} is not in the forecast's feature_lineage (drivers carry "
                            "lineage; a driver the model did not read is not a driver)")
        for k, lk in (("value", "value"), ("source", "source"), ("observed_at", "observed_at")):
            if not _same(d[k], feat[lk]):
                raise GateError(f"{loc}.{k} {d[k]!r} disagrees with feature_lineage {name!r} ({feat[lk]!r})")


def _validate_game_script(s: Any, forecast: dict) -> None:
    if s is None:
        return
    _obj(s, "game_script", SCRIPT_FIELDS)
    _enum(s["conditioning"], SCRIPT_CONDITIONING, "game_script.conditioning")
    _str_or_null(s["perspective_team_id"], "game_script.perspective_team_id")
    if not isinstance(s["exhaustive"], bool):
        raise GateError("game_script.exhaustive must be boolean")
    src = _obj(s["source"], "game_script.source", SCRIPT_SOURCE_FIELDS)
    gate.nonempty_str(src["model_version"], "game_script.source.model_version")
    if not isinstance(src["model_frozen_hash"], str) or not gate.FROZEN_HASH_RE.match(src["model_frozen_hash"]):
        raise GateError("game_script.source.model_frozen_hash must be 'sha256:<64 hex>' or 'git:<7-40 hex>'")
    if src["class"] != gate.SPORTS_ONLY:
        raise GateError("game_script.source.class must be 'sports_only' (scripts are never market-derived)")
    _str_or_null(src["description"], "game_script.source.description")
    for f in ("model_version", "description"):
        _scan_text_market(src[f], f"game_script.source.{f}")
    scen = s["scenarios"]
    if not isinstance(scen, list) or len(scen) < 2:
        raise GateError("game_script.scenarios needs at least two scenarios")
    ids: set[str] = set()
    total, mixture, have_all = 0.0, 0.0, True
    ranges = []
    for i, sc in enumerate(scen):
        loc = f"game_script.scenarios[{i}]"
        _obj(sc, loc, SCENARIO_FIELDS)
        sid = gate.nonempty_str(sc["scenario_id"], f"{loc}.scenario_id")
        if sid in ids:
            raise GateError(f"duplicate scenario_id {sid!r}")
        ids.add(sid)
        for f in ("scenario_id", "label"):
            gate.nonempty_str(sc[f], f"{loc}.{f}")
            gate.scan_value(sc[f], f"{loc}.{f}")
        lo, hi = _int_or_null(sc["margin_min"], f"{loc}.margin_min"), _int_or_null(sc["margin_max"], f"{loc}.margin_max")
        if lo is not None and hi is not None and lo > hi:
            raise GateError(f"{loc}: margin_min > margin_max")
        ranges.append((lo, hi, sid))
        pr = gate.finite_number(sc["probability"], f"{loc}.probability")
        if not 0.0 <= pr <= 1.0:
            raise GateError(f"{loc}.probability outside [0,1]")
        total += pr
        _enum(sc["probability_kind"], PROBABILITY_KINDS, f"{loc}.probability_kind")
        proj = sc["projection"]
        if proj is None:
            have_all = False
            continue
        _obj(proj, f"{loc}.projection", SCENARIO_PROJECTION_FIELDS)
        m = gate.finite_number(proj["mean"], f"{loc}.projection.mean")
        qs = [_num_or_null(proj[k], f"{loc}.projection.{k}") for k in ("p10", "median", "p90")]
        known = [q for q in qs if q is not None]
        if any(b < a - TOL for a, b in zip(known, known[1:])):
            raise GateError(f"{loc}.projection: p10 <= median <= p90")
        mixture += pr * m
    if s["exhaustive"]:
        if abs(total - 1.0) > 1e-6:
            raise GateError(f"exhaustive game_script probabilities must sum to 1 (got {total:.8f})")
        ordered = sorted(ranges, key=lambda r: -math.inf if r[0] is None else r[0])
        if ordered[0][0] is not None or ordered[-1][1] is not None:
            raise GateError("exhaustive team_final_margin scenarios must be open-ended at both ends")
        for (_, hi, a), (lo, _, b) in zip(ordered, ordered[1:]):
            if hi is None or lo is None or lo != hi + 1:
                raise GateError(f"exhaustive team_final_margin scenarios must tile the integers without gaps or "
                                f"overlap ({a!r} then {b!r})")
        if have_all:
            fm = float(forecast["projection"]["mean"])
            if abs(mixture - fm) > max(SCRIPT_MIXTURE_TOL_REL * abs(fm), SCRIPT_MIXTURE_TOL_ABS):
                raise GateError(f"game_script mixture mean {mixture:.4f} is inconsistent with the forecast mean {fm}")
    elif total > 1.0 + 1e-6:
        raise GateError("game_script probabilities sum above 1")


def _validate_validation(v: Any, forecast: dict, row: dict) -> set[str]:
    _obj(v, "validation", VALIDATION_FIELDS)
    status = _enum(v["status"], VALIDATION_STATUSES, "validation.status")
    if v["research_only"] is not True:
        raise GateError("validation.research_only must be true")
    scope = _obj(v["scope"], "validation.scope", SCOPE_FIELDS)
    _enum(scope["season_type"], SEASON_TYPES, "validation.scope.season_type", nullable=True)
    for f in ("seasons", "statistics"):
        if scope[f] is not None and (not isinstance(scope[f], list) or not scope[f]
                                     or not all(isinstance(x, str) and x for x in scope[f])):
            raise GateError(f"validation.scope.{f} must be a nonempty list of strings or null")
    _str_or_null(scope["population"], "validation.scope.population")
    _scan_overstatement(scope["population"], "validation.scope.population")
    _str_or_null(v["source_verdict"], "validation.source_verdict")
    _scan_overstatement(v["source_verdict"], "validation.source_verdict")
    if v["compared_against"] is not None and (not isinstance(v["compared_against"], list)
                                              or not all(isinstance(x, str) and x for x in v["compared_against"])):
        raise GateError("validation.compared_against must be a list of model versions or null")
    if not isinstance(v["caveats"], list) or not all(isinstance(c, str) and c.strip() for c in v["caveats"]):
        raise GateError("validation.caveats must be a list of nonempty strings")
    for i, c in enumerate(v["caveats"]):
        _scan_overstatement(c, f"validation.caveats[{i}]")
    if not isinstance(v["evidence"], list):
        raise GateError("validation.evidence must be a list")
    ids, kinds = set(), set()
    for i, e in enumerate(v["evidence"]):
        loc = f"validation.evidence[{i}]"
        _obj(e, loc, EVIDENCE_FIELDS)
        eid = gate.nonempty_str(e["id"], f"{loc}.id")
        if eid in ids:
            raise GateError(f"duplicate evidence id {eid!r}")
        ids.add(eid)
        kinds.add(_enum(e["kind"], EVIDENCE_KINDS, f"{loc}.kind"))
        if not isinstance(e["repo"], str) or not REPO_RE.match(e["repo"]):
            raise GateError(f"{loc}.repo must be 'owner/name'")
        if not isinstance(e["commit"], str) or not COMMIT_RE.match(e["commit"]):
            raise GateError(f"{loc}.commit must be a 7-40 hex commit id (evidence is pinned)")
        gate.nonempty_str(e["path"], f"{loc}.path")
        if e["url"] is not None and not (isinstance(e["url"], str) and e["url"].startswith("https://")):
            raise GateError(f"{loc}.url must be an https URL or null")
    stat = forecast["statistic"]
    if status == "RESEARCH_HISTORICAL_ACCEPTED":
        need = {"preregistration", "results"} - kinds
        if need:
            raise GateError(f"RESEARCH_HISTORICAL_ACCEPTED needs evidence of kind {sorted(need)}")
        if v["source_verdict"] is None:
            raise GateError("RESEARCH_HISTORICAL_ACCEPTED needs the source's verdict verbatim (source_verdict)")
        if not scope["statistics"] or stat not in scope["statistics"]:
            raise GateError(f"validation scope does not cover statistic {stat!r}; a status applies only inside "
                            "its evaluated scope")
        gst = row["game"]["season_type"] if isinstance(row.get("game"), dict) else None
        if scope["season_type"] is not None and gst is not None and gst != scope["season_type"]:
            raise GateError(f"validation scope season_type {scope['season_type']!r} does not cover this "
                            f"{gst!r} game")
        if scope["seasons"] and isinstance(row.get("game"), dict) and row["game"].get("season") is not None \
                and str(row["game"]["season"]) not in scope["seasons"]:
            raise GateError(f"validation scope seasons {scope['seasons']} do not cover season "
                            f"{row['game']['season']!r}")
    elif status in ("REJECTED", "INCONCLUSIVE"):
        if "results" not in kinds:
            raise GateError(f"{status} needs evidence of kind 'results'")
    elif status == "BLOCKED_DATA":
        if not v["caveats"]:
            raise GateError("BLOCKED_DATA needs a caveat naming the missing data")
    elif status == "SHADOW_PROSPECTIVE":
        if "shadow_collection" not in kinds:
            raise GateError("SHADOW_PROSPECTIVE needs evidence of kind 'shadow_collection'")
        if row.get("capture", {}).get("capture_mode") != "prospective_pregame":
            raise GateError("SHADOW_PROSPECTIVE rows are prospective_pregame captures")
    return ids


def _validate_change(c: Any, row: dict, forecast: dict) -> None:
    if c is None:
        return
    _obj(c, "change_explanation", CHANGE_FIELDS, optional=("unattributed",))
    prior = _obj(c["prior"], "change_explanation.prior", CHANGE_PRIOR_FIELDS)
    gate.nonempty_str(prior["explorer_id"], "change_explanation.prior.explorer_id")
    gate.nonempty_str(prior["model_version"], "change_explanation.prior.model_version")
    if not isinstance(prior["model_signature"], str) or not SIGNATURE_RE.match(prior["model_signature"]):
        raise GateError("change_explanation.prior.model_signature must be 'sha256:<64 hex>'")
    if gate.iso_utc(prior["as_of"], "prior.as_of") >= gate.iso_utc(forecast["as_of"], "as_of"):
        raise GateError("change_explanation.prior.as_of must be before this capture's as_of")
    parts = prior["explorer_id"].split("|")
    ident = row["identity"]
    if len(parts) != 7 or parts[:4] != [ident["sport"], ident["game_id"], ident["player_id"], ident["statistic"]] \
            or parts[5] != ("cond" if ident["conditional_on_playing"] else "unc") or parts[6] != prior["as_of"] \
            or parts[4] != prior["model_version"]:
        raise GateError("change_explanation.prior.explorer_id must name the same player-game-statistic and "
                        "conditionality at prior.as_of")
    if not isinstance(c["model_changed"], bool):
        raise GateError("change_explanation.model_changed must be boolean")
    if (prior["model_version"] != ident["model_version"]) and not c["model_changed"]:
        raise GateError("change_explanation.model_changed must be true when the model version differs")
    delta = _obj(c["delta"], "change_explanation.delta", DELTA_FIELDS)
    for k in DELTA_FIELDS:
        gate.finite_number(delta[k], f"change_explanation.delta.{k}")
    method = _enum(c["method"], CHANGE_METHODS, "change_explanation.method")
    drivers = {d["feature"]: d for d in (row.get("drivers") or [])}
    if not isinstance(c["attributed_drivers"], list):
        raise GateError("change_explanation.attributed_drivers must be a list")
    total = 0.0
    seen = set()
    for i, a in enumerate(c["attributed_drivers"]):
        loc = f"change_explanation.attributed_drivers[{i}]"
        fields = ("feature", "prior_value", "current_value") + (("contribution",) if method == "producer_attribution" else ())
        _obj(a, loc, fields)
        name = gate.nonempty_str(a["feature"], f"{loc}.feature")
        if name in seen:
            raise GateError(f"duplicate attributed driver {name!r}")
        seen.add(name)
        if name not in drivers:
            raise GateError(f"{loc}.feature {name!r} is not one of this row's drivers")
        if not _same(a["current_value"], drivers[name]["value"]):
            raise GateError(f"{loc}.current_value disagrees with the driver's value")
        if _same(a["prior_value"], a["current_value"]):
            raise GateError(f"{loc}: an attributed driver must have changed")
        if method == "producer_attribution":
            total += gate.finite_number(a["contribution"], f"{loc}.contribution")
    if method == "producer_attribution":
        if "unattributed" not in c:
            raise GateError("producer_attribution needs `unattributed` (the residual of delta.mean)")
        un = gate.finite_number(c["unattributed"], "change_explanation.unattributed")
        if abs(total + un - float(delta["mean"])) > 1e-6 * max(1.0, abs(float(delta["mean"]))):
            raise GateError("producer_attribution contributions + unattributed must equal delta.mean")
    elif "unattributed" in c:
        raise GateError("driver_value_diff lists changed drivers only; it makes no attribution (no `unattributed`)")


def validate_projection(row: dict, resolver: Resolver | None = None) -> dict:
    """Validate one explorer projection. Returns {forecast, sibling, warnings} for file-level checks."""
    if not isinstance(row, dict):
        raise GateError("row must be an object")
    if row.get("schema_version") != SCHEMA_PROJECTION:
        raise GateError(f"schema_version must be {SCHEMA_PROJECTION!r}, got {row.get('schema_version')!r}")
    if row.get("record_type") != RECORD_PROJECTION:
        raise GateError(f"record_type must be {RECORD_PROJECTION!r} (market comparisons live in their own file)")
    extra = sorted(k for k in set(row) - set(PROJECTION_REQUIRED) - set(PROJECTION_OPTIONAL) if not k.startswith("x_"))
    if extra:
        raise GateError(f"unexpected fields in an explorer projection; market data belongs in a separate "
                        f"market_comparison record: {extra}")
    _obj({k: v for k, v in row.items() if k in PROJECTION_REQUIRED}, "row", PROJECTION_REQUIRED)
    # Market vocabulary (pure_gate's own check) and betting vocabulary, in every key including x_ metadata.
    gate.scan_keys(row, "row")
    _scan_recommendation_keys(row, "row")
    if row["research_only"] is not True:
        raise GateError("research_only must be true")
    forecast = _resolve_forecast(row, resolver)

    ident = _obj(row["identity"], "identity", IDENTITY_FIELDS)
    for f in IDENTITY_FIELDS:
        if ident[f] != forecast[f]:
            raise GateError(f"identity.{f} {ident[f]!r} disagrees with the forecast ({forecast[f]!r})")
    if row["explorer_id"] != explorer_id(ident):
        raise GateError(f"explorer_id must be {explorer_id(ident)!r}")

    cap = _obj(row["capture"], "capture", CAPTURE_FIELDS)
    captured = gate.iso_utc(cap["captured_at"], "capture.captured_at")
    mode = _enum(cap["capture_mode"], CAPTURE_MODES, "capture.capture_mode")
    gate.nonempty_str(cap["builder"], "capture.builder")
    as_of = gate.iso_utc(forecast["as_of"], "as_of")
    kickoff = gate.iso_utc(forecast["kickoff"], "kickoff")
    if captured < as_of:
        raise GateError("capture.captured_at is before the forecast's as_of")
    if mode == "prospective_pregame" and captured >= kickoff:
        raise GateError("a prospective_pregame capture must be taken before kickoff")

    player = _obj(row["player"], "player", PLAYER_FIELDS)
    for f in PLAYER_FIELDS:
        _str_or_null(player[f], f"player.{f}")
    game = _obj(row["game"], "game", GAME_FIELDS)
    if gate.iso_utc(game["kickoff"], "game.kickoff") != kickoff:
        raise GateError("game.kickoff must equal the forecast's kickoff")
    _str_or_null(game["season"], "game.season")
    _enum(game["season_type"], SEASON_TYPES, "game.season_type", nullable=True)
    _int_or_null(game["week"], "game.week")
    for f in ("home_team_id", "away_team_id", "opponent_team_id"):
        _str_or_null(game[f], f"game.{f}")
    if game["is_home"] is not None and not isinstance(game["is_home"], bool):
        raise GateError("game.is_home must be boolean or null")
    home, away, opp, team = game["home_team_id"], game["away_team_id"], game["opponent_team_id"], player["team_id"]
    if home is not None and home == away:
        raise GateError("game.home_team_id equals away_team_id")
    if home is not None and away is not None:
        for name, t in (("player.team_id", team), ("game.opponent_team_id", opp)):
            if t is not None and t not in (home, away):
                raise GateError(f"{name} {t!r} is neither the home nor the away team")
        if team is not None:
            if opp is not None and opp == team:
                raise GateError("game.opponent_team_id equals the player's team")
            if game["is_home"] is not None and game["is_home"] != (team == home):
                raise GateError("game.is_home disagrees with player.team_id and game.home_team_id")

    _validate_distribution(row["distribution"], forecast)
    sibling = _validate_workload(row["expected_workload"], forecast)
    _validate_drivers(row["drivers"], forecast)
    _validate_game_script(row["game_script"], forecast)
    evidence_ids = _validate_validation(row["validation"], forecast, row)

    u = _obj(row["uncertainty"], "uncertainty", UNCERTAINTY_FIELDS)
    p = forecast["projection"]
    if not _same(gate.finite_number(u["p10_p90_width"], "uncertainty.p10_p90_width"), float(p["p90"]) - float(p["p10"])):
        raise GateError("uncertainty.p10_p90_width must equal forecast p90 - p10")
    if u["interval_nominal_coverage"] != 0.8:
        raise GateError("uncertainty.interval_nominal_coverage is 0.8 (the p10-p90 interval)")
    hc = u["holdout_interval_coverage"]
    if hc is not None:
        _obj(hc, "uncertainty.holdout_interval_coverage", COVERAGE_FIELDS)
        obs = gate.finite_number(hc["observed"], "holdout_interval_coverage.observed")
        if not 0.0 <= obs <= 1.0:
            raise GateError("holdout_interval_coverage.observed must be in [0,1]")
        n = _int_or_null(hc["n_rows"], "holdout_interval_coverage.n_rows")
        if n is None or n < 1:
            raise GateError("holdout_interval_coverage.n_rows must be a positive integer")
        _int_or_null(hc["n_games"], "holdout_interval_coverage.n_games")
        gate.nonempty_str(hc["scope"], "holdout_interval_coverage.scope")
        if hc["evidence_id"] not in evidence_ids:
            raise GateError("holdout_interval_coverage.evidence_id must name an entry of validation.evidence")

    fr = _obj(row["freshness"], "freshness", FRESHNESS_FIELDS)
    if fr["as_of"] != forecast["as_of"] or fr["source_max_observed_at"] != forecast["source_max_observed_at"]:
        raise GateError("freshness.as_of / source_max_observed_at must equal the forecast's")
    if fr["staleness_seconds"] != _seconds(forecast["as_of"], forecast["source_max_observed_at"], "freshness"):
        raise GateError("freshness.staleness_seconds must equal as_of - source_max_observed_at in seconds")
    if fr["kickoff_lead_seconds"] != _seconds(forecast["kickoff"], forecast["as_of"], "freshness"):
        raise GateError("freshness.kickoff_lead_seconds must equal kickoff - as_of in seconds")
    oldest = min(forecast["feature_lineage"], key=lambda f: gate.iso_utc(f["observed_at"]))["observed_at"]
    if gate.iso_utc(fr["oldest_input_observed_at"], "freshness.oldest_input_observed_at") != gate.iso_utc(oldest):
        raise GateError("freshness.oldest_input_observed_at must equal the earliest feature_lineage observed_at")

    _validate_change(row["change_explanation"], row, forecast)

    if "provenance" in row and row["provenance"] is not None:
        prov = _obj(row["provenance"], "provenance", PROVENANCE_FIELDS)
        if not isinstance(prov["repo"], str) or not REPO_RE.match(prov["repo"]):
            raise GateError("provenance.repo must be 'owner/name'")
        if not isinstance(prov["commit"], str) or not COMMIT_RE.match(prov["commit"]):
            raise GateError("provenance.commit must be a 7-40 hex commit id")
        gate.nonempty_str(prov["path"], "provenance.path")
        if prov["file_sha256"] is not None and not re.match(r"^[0-9a-f]{64}$", str(prov["file_sha256"])):
            raise GateError("provenance.file_sha256 must be 64 hex or null")
        for f in ("selection", "conversion"):
            _str_or_null(prov[f], f"provenance.{f}")

    # Every null needs a reason, and every reason a null.
    reasons = row["null_reasons"]
    if not isinstance(reasons, dict):
        raise GateError("null_reasons must be an object {path: reason}")
    nulls = set(null_paths(row))
    for path in sorted(nulls):
        r = reasons.get(path)
        if not isinstance(r, str) or not r.strip():
            raise GateError(f"{path} is null without a reason in null_reasons (the source must say why it is "
                            "missing; nothing is invented)")
    stale = sorted(set(reasons) - nulls)
    if stale:
        raise GateError(f"null_reasons names fields that are not null: {stale}")
    for path, r in reasons.items():
        _scan_overstatement(r, f"null_reasons[{path!r}]")

    warnings = []
    if forecast["participation_probability"] is None:
        warnings.append("participation_probability=null (not modeled)")
    return {"forecast": forecast, "sibling": sibling, "warnings": warnings}


# ---------------------------------------------------------------------------------------------
# File-level validation
# ---------------------------------------------------------------------------------------------

def forecast_resolver(rows: list[dict]) -> Resolver:
    by_sig: dict[str, dict] = {}
    for r in rows:
        if gate.validate(r) != gate.SCHEMA_V1:
            raise GateError("--forecasts must hold pure_forecast.v1 rows")
        by_sig[model_signature(r)] = r
    return by_sig.get


def validate_projection_file(rows: list[dict], resolver: Resolver | None = None) -> dict:
    by_id: dict[str, dict] = {}
    info: dict[str, dict] = {}
    for i, row in enumerate(rows, 1):
        try:
            res = validate_projection(row, resolver)
        except GateError as exc:
            eid = row.get("explorer_id", "?") if isinstance(row, dict) else "?"
            raise GateError(f"row {i} ({eid}): {exc}") from exc
        if row["explorer_id"] in by_id:
            raise GateError(f"duplicate explorer_id {row['explorer_id']!r}")
        by_id[row["explorer_id"]] = row
        info[row["explorer_id"]] = res
    warnings: list[str] = []
    # Sibling workload forecasts: same player-game, model, conditionality and cutoff, another statistic.
    for eid, res in info.items():
        sib = res["sibling"]
        if sib is None:
            continue
        ident = by_id[eid]["identity"]
        sid = explorer_id({**ident, "statistic": sib["statistic"]})
        other = info.get(sid)
        if other is None:
            warnings.append(f"{eid}: workload sibling {sib['statistic']!r} not in this file (unverified)")
            continue
        sf = other["forecast"]
        if model_signature(sf) != sib["model_signature"]:
            raise GateError(f"{eid}: expected_workload.lineage.model_signature does not match sibling {sid!r}")
        for k in ("mean", "median", "p10", "p90"):
            if sib[k] is not None and not _same(sib[k], sf["projection"][k]):
                raise GateError(f"{eid}: expected_workload.{k} disagrees with sibling forecast {sid!r}")
    # Change explanations against the prior capture, when it is in the file.
    for eid, row in by_id.items():
        c = row["change_explanation"]
        if c is None:
            continue
        prior = by_id.get(c["prior"]["explorer_id"])
        if prior is None:
            warnings.append(f"{eid}: prior capture {c['prior']['explorer_id']!r} not in this file (delta unverified)")
            continue
        pf, cf = info[prior["explorer_id"]]["forecast"], info[eid]["forecast"]
        if model_signature(pf) != c["prior"]["model_signature"]:
            raise GateError(f"{eid}: change_explanation.prior.model_signature does not match the prior row")
        if c["model_changed"] != (pf["model_version"] != cf["model_version"]
                                  or pf["model_frozen_hash"] != cf["model_frozen_hash"]):
            raise GateError(f"{eid}: change_explanation.model_changed disagrees with the two rows")
        for k in DELTA_FIELDS:
            want = float(cf["projection"][k]) - float(pf["projection"][k])
            if not _same(c["delta"][k], want) and abs(float(c["delta"][k]) - want) > 1e-9:
                raise GateError(f"{eid}: change_explanation.delta.{k} must equal current - prior ({want})")
        prior_lin = {f["name"]: f["value"] for f in pf["feature_lineage"]}
        for a in c["attributed_drivers"]:
            if a["feature"] in prior_lin and not _same(a["prior_value"], prior_lin[a["feature"]]):
                raise GateError(f"{eid}: attributed driver {a['feature']!r} prior_value disagrees with the prior row")
    statuses: dict[str, int] = defaultdict(int)
    for row in by_id.values():
        statuses[row["validation"]["status"]] += 1
    not_modeled = sum(1 for r in info.values() if r["warnings"])
    if not_modeled:
        warnings.append(f"{not_modeled} row(s) embed participation_probability=null (not modeled)")
    return {"passed": True, "n": len(by_id), "schema_version": SCHEMA_PROJECTION,
            "validation_statuses": dict(sorted(statuses.items())),
            "statistics": dict(sorted(_count(f"{r['identity']['sport']}:{r['identity']['statistic']}"
                                             for r in by_id.values()).items())),
            "warnings": warnings, "tool": EXPLORER_VERSION, "gate": gate.GATE_VERSION,
            "note": "Validates an exported artifact. It makes no accuracy claim; runtime independence is "
                    "proven only by pure_gate rerun."}


def _count(items) -> dict:
    out: dict[str, int] = defaultdict(int)
    for x in items:
        out[x] += 1
    return out


# ---------------------------------------------------------------------------------------------
# Market comparison records
# ---------------------------------------------------------------------------------------------

def _scan_model_keys(obj: Any, loc: str) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).lower() in MODEL_OUTPUT_KEYS:
                raise GateError(f"model output or recommendation key forbidden in a market comparison: {loc}.{k}")
            _scan_model_keys(v, f"{loc}.{k}")
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _scan_model_keys(item, f"{loc}[{i}]")


def validate_market(row: dict, projections: dict[str, dict] | None = None) -> None:
    if not isinstance(row, dict):
        raise GateError("row must be an object")
    if row.get("schema_version") != SCHEMA_MARKET or row.get("record_type") != RECORD_MARKET:
        raise GateError(f"a market comparison has schema_version {SCHEMA_MARKET!r} and record_type {RECORD_MARKET!r}")
    _scan_model_keys(row, "row")
    _obj(row, "row", MARKET_REQUIRED, optional=tuple(k for k in row if k.startswith("x_")))
    if row["research_only"] is not True:
        raise GateError("research_only must be true")
    ident = _obj(row["identity"], "identity", MARKET_IDENTITY)
    for f in MARKET_IDENTITY:
        gate.nonempty_str(ident[f], f"identity.{f}")
    if gate._RUNG_WORD_RE.search(ident["statistic"]) or MARKET_RUNG_RE.search(ident["statistic"]):
        raise GateError("identity.statistic encodes a ladder rung; rungs go inside `rungs`")
    gate.nonempty_str(row["venue"], "venue")
    gate.nonempty_str(row["market_ref"], "market_ref")
    quoted = gate.iso_utc(row["quoted_at"], "quoted_at")
    captured = gate.iso_utc(row["captured_at"], "captured_at")
    if row["listed_at"] is not None and gate.iso_utc(row["listed_at"], "listed_at") > quoted:
        raise GateError("listed_at must not be after quoted_at")
    if quoted > captured:
        raise GateError("quoted_at must not be after captured_at")
    rungs = row["rungs"]
    if not isinstance(rungs, list) or not rungs:
        raise GateError("rungs must be a nonempty list (the ladder inside one record)")
    last = -math.inf
    for i, r in enumerate(rungs):
        loc = f"rungs[{i}]"
        _obj(r, loc, RUNG_FIELDS)
        t = gate.finite_number(r["at_least"], f"{loc}.at_least")
        if t <= last:
            raise GateError("rungs must be strictly ascending in at_least")
        last = t
        vals = {}
        for f in RUNG_FIELDS[1:]:
            vals[f] = _num_or_null(r[f], f"{loc}.{f}")
            if vals[f] is not None and not 0.0 <= vals[f] <= 1.0:
                raise GateError(f"{loc}.{f} must be in [0,1] or null")
        for b, a in (("yes_bid", "yes_ask"), ("no_bid", "no_ask")):
            if vals[b] is not None and vals[a] is not None and vals[b] > vals[a] + TOL:
                raise GateError(f"{loc}: {b} above {a}")
    pid = _str_or_null(row["projection_explorer_id"], "projection_explorer_id")
    if pid is not None and projections is not None:
        proj = projections.get(pid)
        if proj is None:
            raise GateError(f"projection_explorer_id {pid!r} is not in the projections file")
        if any(proj["identity"][f] != ident[f] for f in MARKET_IDENTITY):
            raise GateError("market comparison identity disagrees with its projection")
    reasons = row["null_reasons"]
    if not isinstance(reasons, dict):
        raise GateError("null_reasons must be an object")
    nulls = {p for p in null_paths({k: v for k, v in row.items() if k != "null_reasons"})}
    missing = sorted(p for p in nulls if not (isinstance(reasons.get(p), str) and reasons[p].strip()))
    if missing:
        raise GateError(f"null without a reason: {missing}")
    stale = sorted(set(reasons) - nulls)
    if stale:
        raise GateError(f"null_reasons names fields that are not null: {stale}")


def validate_market_file(rows: list[dict], projection_rows: list[dict] | None = None) -> dict:
    projections = None
    if projection_rows is not None:
        projections = {r["explorer_id"]: r for r in projection_rows}
    keys = set()
    for i, row in enumerate(rows, 1):
        try:
            validate_market(row, projections)
        except GateError as exc:
            raise GateError(f"market row {i}: {exc}") from exc
        k = (tuple(row["identity"][f] for f in MARKET_IDENTITY), row["venue"], row["market_ref"], row["quoted_at"])
        if k in keys:
            raise GateError(f"duplicate market comparison {k}")
        keys.add(k)
    return {"passed": True, "n": len(rows), "schema_version": SCHEMA_MARKET, "tool": EXPLORER_VERSION,
            "note": "Display-only side-by-side record. It never feeds a PURE model, its population or its scoring."}


# ---------------------------------------------------------------------------------------------
# Converter: pure_forecast.v1 rows -> explorer projections
# ---------------------------------------------------------------------------------------------

def _reason_for(path: str, reasons: dict[str, str]) -> str | None:
    if path in reasons:
        return reasons[path]
    generic = re.sub(r"\[\d+\]", "[*]", path)
    return reasons.get(generic)


def _game_from_context(forecast: dict, ctx: dict) -> dict:
    game = {"kickoff": forecast["kickoff"], "season": None, "season_type": None, "week": None,
            "home_team_id": None, "away_team_id": None, "opponent_team_id": None, "is_home": None}
    game.update({k: v for k, v in ctx.get("game_defaults", {}).items() if k in GAME_FIELDS and k != "kickoff"})
    pattern = ctx.get("game_id_pattern")
    if pattern:
        m = re.match(pattern, forecast["game_id"])
        if not m:
            raise GateError(f"game_id {forecast['game_id']!r} does not match context game_id_pattern")
        for k, v in m.groupdict().items():
            if k not in GAME_FIELDS:
                raise GateError(f"game_id_pattern group {k!r} is not a game field")
            game[k] = int(v) if k == "week" else v
    game.update({k: v for k, v in ctx.get("games", {}).get(forecast["game_id"], {}).items() if k in GAME_FIELDS})
    return game


def _sibling_rows(rows: list[dict]) -> dict[tuple, dict]:
    out = {}
    for r in rows:
        out[(r["sport"], r["game_id"], r["player_id"], r["model_version"], r["conditional_on_playing"], r["as_of"],
             r["statistic"])] = r
    return out


def build_projection(forecast: dict, ctx: dict, siblings: dict[tuple, dict], prior: dict | None) -> dict:
    stat, mv = forecast["statistic"], forecast["model_version"]
    ident = {f: forecast[f] for f in IDENTITY_FIELDS}
    p = forecast["projection"]
    quantiles = {0.1: p["p10"], 0.5: p["median"], 0.9: p["p90"]}
    for q in p.get("quantiles", []):
        quantiles[round(float(q["q"]), 12)] = q["value"]
    player = {f: None for f in PLAYER_FIELDS}
    player.update({k: v for k, v in ctx.get("players", {}).get(forecast["player_id"], {}).items() if k in PLAYER_FIELDS})
    game = _game_from_context(forecast, ctx)

    workload = None
    wl = ctx.get("workload")
    if wl:
        base = {"measure": wl["measure"], "unit": wl["unit"]}
        if wl["statistic"] == stat:
            workload = {**base, **{k: p[k] for k in ("mean", "median", "p10", "p90")}, "lineage": {"kind": "self"}}
        else:
            sib = siblings.get((forecast["sport"], forecast["game_id"], forecast["player_id"], mv,
                                forecast["conditional_on_playing"], forecast["as_of"], wl["statistic"]))
            if sib is not None:
                sp = sib["projection"]
                workload = {**base, **{k: sp[k] for k in ("mean", "median", "p10", "p90")},
                            "lineage": {"kind": "sibling_forecast", "statistic": wl["statistic"],
                                        "model_signature": model_signature(sib)}}

    catalog = ctx.get("drivers", {}).get(mv, {})
    drivers = []
    for f in forecast["feature_lineage"]:
        spec = catalog.get(f["name"])
        if spec is None:
            raise GateError(f"context.drivers[{mv!r}] has no entry for feature {f['name']!r}; every driver "
                            "needs a declared role and matchup_role")
        drivers.append({"feature": f["name"], "label": spec.get("label"), "role": spec["role"],
                        "matchup_role": spec.get("matchup_role"), "value": f["value"], "source": f["source"],
                        "observed_at": f["observed_at"]})

    validation = ctx.get("validation", {}).get(mv)
    if validation is None:
        raise GateError(f"context.validation has no block for model_version {mv!r}")
    coverage = ctx.get("coverage", {}).get(mv, {}).get(stat)
    oldest = min(forecast["feature_lineage"], key=lambda f: gate.iso_utc(f["observed_at"]))["observed_at"]

    change = None
    if prior is not None:
        prior_lin = {f["name"]: f["value"] for f in prior["feature_lineage"]}
        changed = [{"feature": d["feature"], "prior_value": prior_lin.get(d["feature"]), "current_value": d["value"]}
                   for d in drivers if d["feature"] in prior_lin and not _same(prior_lin[d["feature"]], d["value"])]
        prior_ident = {f: prior[f] for f in IDENTITY_FIELDS}
        change = {"prior": {"explorer_id": explorer_id(prior_ident), "as_of": prior["as_of"],
                            "model_version": prior["model_version"], "model_signature": model_signature(prior)},
                  "model_changed": (prior["model_version"] != mv
                                    or prior["model_frozen_hash"] != forecast["model_frozen_hash"]),
                  "delta": {k: float(p[k]) - float(prior["projection"][k]) for k in DELTA_FIELDS},
                  "method": "driver_value_diff", "attributed_drivers": changed}

    row: dict[str, Any] = {
        "schema_version": SCHEMA_PROJECTION, "record_type": RECORD_PROJECTION, "explorer_id": explorer_id(ident),
        "research_only": True, "identity": ident,
        "capture": {k: ctx["capture"][k] for k in CAPTURE_FIELDS},
        "player": player, "game": game,
        "distribution": {"unit": ctx.get("units", {}).get(stat),
                         "quantiles": [{"q": q, "value": quantiles[q]} for q in sorted(quantiles)], "pmf": None},
        "expected_workload": workload, "drivers": drivers or None, "game_script": None,
        "uncertainty": {"p10_p90_width": float(p["p90"]) - float(p["p10"]), "interval_nominal_coverage": 0.8,
                        "holdout_interval_coverage": coverage},
        "freshness": {"as_of": forecast["as_of"], "source_max_observed_at": forecast["source_max_observed_at"],
                      "staleness_seconds": _seconds(forecast["as_of"], forecast["source_max_observed_at"], "freshness"),
                      "oldest_input_observed_at": oldest,
                      "kickoff_lead_seconds": _seconds(forecast["kickoff"], forecast["as_of"], "freshness")},
        "validation": validation, "change_explanation": change,
        "forecast": forecast,
    }
    if ctx.get("provenance"):
        row["provenance"] = {k: ctx["provenance"].get(k) for k in PROVENANCE_FIELDS}
    reasons = dict(ctx.get("null_reasons", {}))
    # Per-feature reasons for null driver values come from the driver catalog.
    for i, d in enumerate(drivers):
        if d["value"] is None and catalog[d["feature"]].get("null_value_reason"):
            reasons.setdefault(f"drivers[{i}].value", catalog[d["feature"]]["null_value_reason"])
    reasons.setdefault("change_explanation", "first capture of this player-game-statistic and model in the input: "
                                             "no prior capture to compare")
    out: dict[str, str] = {}
    for path in null_paths(row):
        r = _reason_for(path, reasons)
        if not r:
            raise GateError(f"{explorer_id(ident)}: {path} is null and the context gives no reason; refusing to "
                            "emit an unexplained null")
        out[path] = r
    row["null_reasons"] = dict(sorted(out.items()))
    return row


def convert(rows: list[dict], ctx: dict) -> list[dict]:
    """Explorer projections for every pure_forecast.v1 row, in input order (deterministic)."""
    if not isinstance(ctx, dict) or "capture" not in ctx:
        raise GateError("context must be an object with at least `capture`")
    for i, r in enumerate(rows, 1):
        try:
            if gate.validate(r) != gate.SCHEMA_V1:
                raise GateError("convert takes pure_forecast.v1 rows (convert v0 with the sport's converter first)")
        except GateError as exc:
            raise GateError(f"input row {i}: {exc}") from exc
    siblings = _sibling_rows(rows)
    history: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        history[(r["sport"], r["game_id"], r["player_id"], r["statistic"], r["model_version"],
                 r["conditional_on_playing"])].append(r)
    prior_of: dict[int, dict] = {}
    for caps in history.values():
        caps = sorted(caps, key=lambda r: gate.iso_utc(r["as_of"]))
        for a, b in zip(caps, caps[1:]):
            if a["as_of"] == b["as_of"]:
                raise GateError(f"duplicate capture at {a['as_of']} for {a['player_id']} {a['statistic']}")
            prior_of[id(b)] = a
    out = [build_projection(r, ctx, siblings, prior_of.get(id(r))) for r in rows]
    validate_projection_file(out)
    return out


def dumps_jsonl(rows: list[dict]) -> str:
    return "".join(json.dumps(r, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n" for r in rows)


# ---------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    v = sub.add_parser("validate", help="Validate explorer projections (and optionally market comparisons)")
    v.add_argument("--projections", required=True)
    v.add_argument("--forecasts", help="pure_forecast.v1 JSONL that resolves forecast_ref rows")
    v.add_argument("--market", help="market_comparison JSONL, checked against the projections")
    c = sub.add_parser("convert", help="Build explorer projections from pure_forecast.v1 rows and a context JSON")
    c.add_argument("--forecasts", required=True)
    c.add_argument("--context", required=True)
    c.add_argument("--out", required=True, help="output JSONL; refuses to overwrite an existing file")
    ns = parser.parse_args(argv)
    try:
        if ns.command == "validate":
            rows = gate.load_jsonl(ns.projections)
            resolver = forecast_resolver(gate.load_jsonl(ns.forecasts)) if ns.forecasts else None
            result = validate_projection_file(rows, resolver)
            if ns.market:
                result["market"] = validate_market_file(gate.load_jsonl(ns.market), rows)
        else:
            out = Path(ns.out)
            if out.exists():
                raise GateError(f"{out} exists; explorer captures are write-once")
            ctx = json.loads(Path(ns.context).read_text(encoding="utf-8"))
            built = convert(gate.load_jsonl(ns.forecasts), ctx)
            out.write_text(dumps_jsonl(built), encoding="utf-8")
            result = {"passed": True, "n": len(built), "out": str(out), "tool": EXPLORER_VERSION}
    except (GateError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
