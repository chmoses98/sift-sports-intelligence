"""Sport-agnostic evaluation of independent projections against a contemporaneous Kalshi price.

A sport adapter (research/intelligence/adapters/<sport>.py) only has to produce a frame in the ADAPTER SCHEMA below from the
sport's own archives; this module then does the integrity quarantine, honest accounting, accuracy and betting-signal scorecards
and the MODEL_ERROR / VALIDATED_SIGNAL / UNRESOLVED diagnosis, identically for every sport.

ADAPTER SCHEMA (one row per contract = the LAST pre-start observation of that ticker; rows are never reconstructed from
information available only after the observation time):
  ticker, cl (independent-unit id: all rungs of one player-stat-game share it), game_id, stat, threshold,
  period (sortable: date string or week int), observed_at, start_utc (UTC datetimes),
  yes_bid, yes_ask, no_ask  (DOLLARS, after integrity.to_dollars),
  p_model (the model's P(YES) frozen BEFORE observed_at), y (1.0/0.0 settled outcome),
  model_version, reported_exec (optional: the archive's own "executable price" field, to detect mid-labelled-as-ask)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .disagreement import UNRESOLVED, Rules, cluster_mean, diagnose_segment, encompassing, executable_ev, paired_brier
from .integrity import VALID, quote_status, sample_accounting

REQUIRED = ["ticker", "cl", "game_id", "stat", "threshold", "period", "observed_at", "start_utc", "yes_bid", "yes_ask", "no_ask", "p_model", "y"]
MIN_UNITS_FOR_ANY_CLAIM = 300


def chronological_splits(periods, fractions=(0.5, 0.25, 0.25)) -> dict:
    """Split the sorted distinct periods into discovery / validation / holdout by count (earliest first)."""
    ps = sorted(set(periods))
    n = len(ps)
    a, b = int(round(n * fractions[0])), int(round(n * (fractions[0] + fractions[1])))
    return {"discovery": ps[:a], "validation": ps[a:b], "holdout": ps[b:]}


def prepare(df: pd.DataFrame, max_width=0.10, max_age_min=None) -> pd.DataFrame:
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"adapter frame lacks {missing}")
    d = df.copy()
    d["mid"] = (d.yes_bid + d.yes_ask) / 2
    age = ((pd.to_datetime(d.start_utc) - pd.to_datetime(d.observed_at)).dt.total_seconds() / 60.0) if max_age_min else None
    d["pre_start"] = pd.to_datetime(d.observed_at) < pd.to_datetime(d.start_utc)
    d["quote_status"] = quote_status(d, bid="yes_bid", ask="yes_ask", max_width=max_width,
                                     reported_exec=d["reported_exec"] if "reported_exec" in d else None)
    d.loc[~d.pre_start, "quote_status"] = "NOT_PRE_START"
    d["pm"] = d.p_model
    return d


def evaluate_frame(df: pd.DataFrame, sport: str, *, raw_snapshot_rows=None, min_units=MIN_UNITS_FOR_ANY_CLAIM, rules: Rules = Rules(min_clusters_per_split=100)) -> dict:
    d = prepare(df)
    acct = sample_accounting(d, snapshot_col="observed_at")
    if raw_snapshot_rows is not None:
        acct["raw_snapshot_rows"] = int(raw_snapshot_rows)
    ok = d[(d.quote_status == VALID) & d.pm.notna() & d.y.notna()].reset_index(drop=True)
    rep = {"sport": sport, "accounting": acct, "n_scored_contracts": int(len(ok)), "n_scored_units": int(ok.cl.nunique())}
    if ok.cl.nunique() < min_units:
        rep.update(status="INSUFFICIENT_EVIDENCE", note=f"{ok.cl.nunique()} independent scored units (< {min_units}); no accuracy or betting claim is made")
        return rep
    rep["status"] = "EVALUATED"
    rep["projection_accuracy"] = {"paired_brier_model_minus_market": paired_brier(ok), "bias_outcome_minus_model": cluster_mean((ok.y - ok.pm).to_numpy(), ok.cl.to_numpy()),
                                  "encompassing": encompassing(ok)}
    ev, _ = executable_ev(ok)
    rep["betting_signals"] = {"ev_at_ask_all_disagreements": cluster_mean(ev, ok.cl.to_numpy())}
    splits = chronological_splits(ok.period)
    rep["splits"] = splits
    diag = {}
    for stat, g in ok.groupby("stat"):
        for side, gg in (("model_above_market", g[g.pm > g.mid]), ("model_below_market", g[g.pm < g.mid]), ("all", g)):
            v = diagnose_segment(f"{stat}|{side}", gg, splits, rules)
            diag[v.segment] = {"status": v.status, "reasons": v.reasons}
    rep["diagnosis"] = diag
    rep["status_counts"] = pd.Series([v["status"] for v in diag.values()]).value_counts().to_dict()
    rep["by_stat"] = {s: {"paired_brier": paired_brier(g), "bias": cluster_mean((g.y - g.pm).to_numpy(), g.cl.to_numpy())} for s, g in ok.groupby("stat")}
    return rep
