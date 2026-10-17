"""Challenger vs incumbent vs market on IDENTICAL observations.

Inputs are two evaluation corpora (`data/shadow/evaluations` and `data/shadow/evaluations_challenger`). Both arms price the
same capture snapshots, so a row is comparable only when the ticker AND the pre-kickoff quote observation (`observed_at`) are the
same. Anything else is dropped and counted: an arm is never scored on a price it did not see.

Splits are the frozen chronology of nfl_prospective.SPLITS. The development split (weeks 1-4) is the only one that may inform
model changes; validation (5-8) and holdout (9+) are reported, never tuned on.
"""
from __future__ import annotations

import glob
import gzip
import json
import sys

import numpy as np
import pandas as pd

from .disagreement import cluster_mean, executable_ev, paired_brier
from .integrity import VALID, quote_status
from .nfl_prospective import SPLITS

KEEP = ["ticker", "game_id", "player_id", "stat", "family", "threshold", "week", "observed_at", "kickoff_utc", "yes_bid_t", "yes_ask_t",
        "no_ask_t", "mid_t", "width_t", "model_event_probability", "settled_yes", "settlement_kind", "model_version"]


def load_arm(eval_dir: str) -> pd.DataFrame:
    rows = []
    for f in sorted(glob.glob(f"{eval_dir}/*/*.evaluations.jsonl.gz")):
        for line in gzip.open(f):
            r = json.loads(line)
            rows.append({k: r.get(k) for k in KEEP})
    if not rows:
        return pd.DataFrame(columns=KEEP)
    d = pd.DataFrame(rows)
    d = d[pd.to_datetime(d.observed_at) < pd.to_datetime(d.kickoff_utc)]
    return d.sort_values(["ticker", "observed_at"]).groupby("ticker").tail(1).reset_index(drop=True)


def pair(incumbent: pd.DataFrame, challenger: pd.DataFrame, family="PLAYER_STAT"):
    """Inner-join on ticker + identical quote observation; returns (frame, accounting)."""
    a = incumbent[incumbent.family == family]
    b = challenger[challenger.family == family]
    m = a.merge(b[["ticker", "observed_at", "model_event_probability"]], on="ticker", how="inner", suffixes=("", "_chal"))
    same = m.observed_at == m.observed_at_chal
    acct = {"incumbent_contracts": int(len(a)), "challenger_contracts": int(len(b)), "common_tickers": int(len(m)),
            "identical_observation": int(same.sum()), "dropped_different_quote": int((~same).sum())}
    m = m[same].copy()
    m = m[(m.settlement_kind == "binary") & m.settled_yes.notna()]
    m["y"] = m.settled_yes.astype(float)
    m["pm"], m["pc"], m["mid"] = m.model_event_probability, m.model_event_probability_chal, m.mid_t
    m["yes_ask"], m["no_ask"] = m.yes_ask_t, m.no_ask_t
    m["cl"] = m.game_id + "|" + m.player_id.astype(str) + "|" + m.stat
    m["quote_status"] = quote_status(m, bid="yes_bid_t", ask="yes_ask", max_width=0.10)
    acct["settled_binary"] = int(len(m))
    m = m[m.quote_status == VALID]
    acct["valid_executable_quote"] = int(len(m))
    acct["independent_units"] = int(m.cl.nunique())
    return m.reset_index(drop=True), acct


def _block(g: pd.DataFrame) -> dict:
    if len(g) == 0:
        return {"n": 0}
    out = {"contracts": int(len(g)), "independent_units": int(g.cl.nunique())}
    for name, col in (("incumbent", "pm"), ("challenger", "pc")):
        out[f"brier_{name}"] = float(((g[col] - g.y) ** 2).mean())
        out[f"bias_{name}"] = float((g.y - g[col]).mean())
    out["brier_market"] = float(((g.mid - g.y) ** 2).mean())
    d = cluster_mean(((g.pc - g.y) ** 2 - (g.pm - g.y) ** 2).to_numpy(), g.cl.to_numpy())
    out["challenger_minus_incumbent"] = d
    out["challenger_minus_market"] = paired_brier(g, p_model="pc")
    ev, _ = executable_ev(g.assign(pm=g.pc))
    out["challenger_ev_at_ask"] = cluster_mean(ev, g.cl.to_numpy())
    return out


def evaluate(incumbent_dir: str, challenger_dir: str) -> dict:
    inc, chal = load_arm(incumbent_dir), load_arm(challenger_dir)
    if inc.empty or chal.empty:
        return {"accounting": {"incumbent_contracts": int(len(inc)), "challenger_contracts": int(len(chal))}, "splits": SPLITS,
                "status": "INSUFFICIENT_EVIDENCE", "by_split": {}, "by_stat": {},
                "note": "an arm has no settled evaluations yet; nothing is reconstructed"}
    m, acct = pair(inc, chal)
    res = {"accounting": acct, "splits": SPLITS, "status": "OK" if len(m) else "INSUFFICIENT_EVIDENCE", "by_split": {}, "by_stat": {}}
    if not len(m):
        res["note"] = "no settled observation seen identically by both arms; nothing is reconstructed"
        return res
    for name, weeks in SPLITS.items():
        res["by_split"][name] = _block(m[m.week.isin(weeks)])
    for stat, g in m.groupby("stat"):
        res["by_stat"][stat] = {name: _block(g[g.week.isin(weeks)]) for name, weeks in SPLITS.items()}
    return res


if __name__ == "__main__":
    out = evaluate(sys.argv[1], sys.argv[2])
    json.dump(out, open(sys.argv[3], "w"), indent=1, default=float)
    print(json.dumps(out["accounting"], indent=1))
