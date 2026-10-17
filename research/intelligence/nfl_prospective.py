"""NFL 2026 prospective study: shadow-0.4.0 model vs the Kalshi market, point-in-time.

Input: the `market-data` branch of nfl-edge-finder, data/shadow/evaluations/*/*.evaluations.jsonl.gz
(each row already joins the frozen pre-kickoff prediction, the executable quote at that snapshot, and the settlement).
Usage: python -m research.intelligence.nfl_prospective <evaluations_dir> <out.json>
Chronology: weeks 1-2 discovery, week 3 validation, week 4 untouched holdout (set by --splits).
"""
from __future__ import annotations

import glob
import gzip
import json
import os
import sys

import numpy as np
import pandas as pd

from .integrity import VALID, quote_status, sample_accounting
from .disagreement import (Rules, UNRESOLVED, MODEL_ERROR, VALIDATED_SIGNAL, cluster_mean, diagnose_segment,
                           encompassing, executable_ev, logistic_fit, logit, paired_brier, row_status, z)

# Frozen chronology. Weeks 1-4 are DISCOVERY (the defects were found on them); validation and the untouched holdout are
# weeks that had not been played when the rules were written. Segments stay UNRESOLVED until those weeks accrue.
SPLITS = {"discovery": [1, 2, 3, 4], "validation": [5, 6, 7, 8], "holdout": list(range(9, 19))}
KEEP = ["ticker", "game_id", "player_id", "stat", "family", "threshold", "week", "observed_at", "kickoff_utc",
        "yes_bid_t", "yes_ask_t", "no_ask_t", "mid_t", "width_t", "model_event_probability", "settled_yes",
        "settlement_kind", "availability_state", "close_mid", "close_is_stale", "support_state", "model_version"]


def load(eval_dir: str) -> pd.DataFrame:
    rows = []
    for f in sorted(glob.glob(f"{eval_dir}/*/*.evaluations.jsonl.gz")):
        for line in gzip.open(f):
            r = json.loads(line)
            rows.append({k: r.get(k) for k in KEEP})
    d = pd.DataFrame(rows)
    d["obs"] = pd.to_datetime(d.observed_at)
    d["ko"] = pd.to_datetime(d.kickoff_utc)
    raw = int(len(d))
    d = d[d.obs < d.ko]  # point-in-time: only quotes seen before kickoff
    # one row per contract: the latest pre-kickoff observation (the model prediction is the one stored with it)
    out = d.sort_values(["ticker", "obs"]).groupby("ticker").tail(1).reset_index(drop=True)
    out.attrs["raw_snapshot_rows"] = raw
    out.attrs["pre_kickoff_snapshot_rows"] = int(len(d))
    return out


def prepare(d: pd.DataFrame, family="PLAYER_STAT") -> pd.DataFrame:
    p = d[(d.family == family) & (d.settlement_kind == "binary") & d.settled_yes.notna()].copy()
    p = p.rename(columns={"model_event_probability": "pm", "mid_t": "mid", "yes_ask_t": "yes_ask",
                          "no_ask_t": "no_ask", "width_t": "width"})
    p["y"] = p.settled_yes.astype(float)
    p["cl"] = p.game_id + "|" + p.player_id.astype(str) + "|" + p.stat  # a ladder is one cluster
    p["period"] = p.week
    p["stale"] = p.close_is_stale.fillna(False).astype(bool)
    p["bad_identity"] = p.support_state.ne("SUPPORTED")
    p["quote_status"] = quote_status(p, bid="yes_bid_t", ask="yes_ask", max_width=0.10)
    return p.reset_index(drop=True)   # quarantined rows stay in the frame (and the accounting); they are not scored


def executable(p: pd.DataFrame) -> pd.DataFrame:
    return p[p.quote_status == VALID].reset_index(drop=True)


def ladder_one_rung(p: pd.DataFrame) -> pd.DataFrame:
    """Independent view: one rung per player-stat-game, the one whose market mid is closest to 0.5 (chosen without the model)."""
    i = (p.mid - 0.5).abs().groupby(p.cl).idxmin()
    return p.loc[i.values]


def main(eval_dir, out, contract_out=None, paired_path=None):
    d = load(eval_dir)
    allp = prepare(d)
    acct = sample_accounting(allp, snapshot_col="obs")
    acct["raw_snapshot_rows_all_families"] = d.attrs.get("raw_snapshot_rows")
    acct["pre_kickoff_snapshot_rows_all_families"] = d.attrs.get("pre_kickoff_snapshot_rows")
    acct["snapshot_rows"] = "see raw_snapshot_rows_all_families: scoring uses ONE latest pre-kickoff row per contract"
    p = executable(allp)
    res = {"n_contracts": int(len(p)), "n_clusters": int(p.cl.nunique()), "n_games": int(p.game_id.nunique()),
           "accounting": acct, "splits": SPLITS, "overall": {}, "by_stat": {}, "diagnosis": {}}
    holdout_weeks = sum(SPLITS.values(), [])
    res["overall"]["paired_brier"] = paired_brier(p)
    res["overall"]["paired_brier_one_rung"] = paired_brier(ladder_one_rung(p))
    res["overall"]["encompassing_all"] = encompassing(p)
    # recalibration: fit on discovery only, apply to later weeks. Does a de-biased model carry anything the market lacks?
    disc, later = p[p.period.isin(SPLITS["discovery"])], p[~p.period.isin(SPLITS["discovery"])].copy()
    b, _ = logistic_fit(np.column_stack([np.ones(len(disc)), logit(disc.pm)]), disc.y.to_numpy())
    later["pm_recal"] = 1 / (1 + np.exp(-(b[0] + b[1] * logit(later.pm))))
    res["overall"]["recal_params"] = [float(b[0]), float(b[1])]
    res["overall"]["recal_vs_market_later_weeks"] = paired_brier(later, p_model="pm_recal")
    res["overall"]["recal_encompassing_later_weeks"] = encompassing(later, p_model="pm_recal")
    verdicts = {}
    for stat, g in p.groupby("stat"):
        # directional segments: model above vs below the market
        for side, gg in (("model_above_market", g[g.pm > g.mid]), ("model_below_market", g[g.pm < g.mid])):
            v = diagnose_segment(f"{stat}|{side}", gg, SPLITS)
            verdicts[v.segment] = v
        v = diagnose_segment(f"{stat}|all", g, SPLITS)
        verdicts[v.segment] = v
        res["by_stat"][stat] = {"paired_brier": paired_brier(g), "bias": cluster_mean((g.y - g.pm).to_numpy(), g.cl.to_numpy())}
    res["diagnosis"] = {k: {"status": v.status, "reasons": v.reasons,
                            "splits": {s: (None if x is None else {m: x[m] for m in x}) for s, x in v.splits.items()}}
                        for k, v in verdicts.items()}
    counts = pd.Series([v.status for v in verdicts.values()]).value_counts().to_dict()
    res["status_counts"] = counts
    json.dump(res, open(out, "w"), indent=1, default=float)
    if contract_out:
        from .contract import build_contract
        paired = json.load(open(paired_path)) if paired_path and os.path.exists(paired_path) else None
        json.dump(build_contract(res, paired=paired), open(contract_out, "w"), indent=1, default=float)
    print(json.dumps({"status_counts": counts, "overall": res["overall"]}, indent=1, default=float))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None, sys.argv[4] if len(sys.argv) > 4 else None)
