"""NHL adapter: data-archive `evaluations_player` (frozen pre-game PLAYER_SIM_V1 joined to entry quotes and outcomes).

One row per ticker = the LAST prediction made at least MIN_LEAD_MIN before start. The frame holds only rows where BOTH the
model probability and a two-sided entry quote exist (like-for-like). Archive prices are cents; yes_bid is derived as
1 - entry_no_ask (a missing no_ask means no bid: the row is kept and quarantined as ONE_SIDED, not dropped).
first_goal is a different market (who scores first) and is excluded from the scored frame but counted.

CLI: python -m research.intelligence.adapters.nhl <archive_root> <out.json>
"""
from __future__ import annotations

import glob
import gzip
import json
import os
import sys

import numpy as np
import pandas as pd

from ..evaluate import evaluate_frame, prepare
from ..integrity import to_dollars

MIN_LEAD_MIN = 60.0
EXCLUDED_FAMILIES = ("first_goal",)
COLS = ["ticker", "game_id", "family", "model_version", "predicted_at_utc", "start_utc", "y", "p_player",
        "entry_yes_ask", "entry_no_ask", "player_id"]


def _read(archive_root, max_days=None) -> pd.DataFrame:
    base = os.path.join(archive_root, "evaluations_player")
    days = sorted(p for p in glob.glob(os.path.join(base, "dt=*")) if os.path.isdir(p))
    if max_days:
        days = days[-int(max_days):]
    rows = []
    for day in days:
        for f in sorted(glob.glob(os.path.join(day, "*.jsonl.gz"))):
            with gzip.open(f, "rt") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        r = json.loads(line)
                        rows.append({c: r.get(c) for c in COLS})
    return pd.DataFrame(rows, columns=COLS)


def build_frame(raw: pd.DataFrame):
    """Pure transform: raw evaluation rows -> (ADAPTER SCHEMA frame, counts)."""
    c = {"raw_rows": int(len(raw))}
    d = raw.copy()
    d["observed_at"] = pd.to_datetime(d.predicted_at_utc, utc=True)
    d["start_utc"] = pd.to_datetime(d.start_utc, utc=True)
    d["lead_min"] = (d.start_utc - d.observed_at).dt.total_seconds() / 60.0
    c["raw_tickers"] = int(d.ticker.nunique())
    c["raw_by_family"] = {k: int(v) for k, v in d.family.value_counts().items()}
    ex = d.family.isin(EXCLUDED_FAMILIES)
    c["excluded_families"] = {k: int((d.family == k).sum()) for k in EXCLUDED_FAMILIES}
    c["excluded_family_rows_total"] = int(ex.sum())
    d = d[~ex]
    c["rows_after_family_exclusion"] = int(len(d))
    early = d[d.lead_min >= MIN_LEAD_MIN]
    c["rows_dropped_less_than_60min_before_start"] = int(len(d) - len(early))
    c["tickers_with_no_row_ge_60min"] = int(d.ticker.nunique() - early.ticker.nunique())
    last = early.sort_values(["ticker", "observed_at"]).groupby("ticker", sort=False).tail(1)
    c["rows_one_per_ticker"] = int(len(last))
    c["duplicate_predictions_dropped"] = int(len(early) - len(last))
    c["one_per_ticker_by_family"] = {k: int(v) for k, v in last.family.value_counts().items()}
    nomodel = last.p_player.isna()
    c["dropped_no_model_probability"] = int(nomodel.sum())
    last = last[~nomodel]
    noy = last.y.isna()
    c["dropped_unsettled"] = int(noy.sum())
    last = last[~noy]
    no_ask = last.entry_yes_ask.isna()
    c["dropped_no_yes_ask_market_missing"] = int(no_ask.sum())
    last = last[~no_ask]
    f = last.copy()
    c["market_one_sided_no_bid_kept_for_quarantine"] = int(f.entry_no_ask.isna().sum())
    # units: archive is cents; inferred (per capture day) rather than assumed
    f["yes_ask"] = pd.to_numeric(f.entry_yes_ask, errors="coerce")
    f["no_ask"] = pd.to_numeric(f.entry_no_ask, errors="coerce")
    f["yes_bid"] = 100.0 - f["no_ask"]
    f["day"] = f.start_utc.dt.strftime("%Y-%m-%d")
    f["period"] = f.day
    f = to_dollars(f, ["yes_bid", "yes_ask", "no_ask"], group=f.day.to_numpy()) if len(f) else f.assign(price_unit_inferred=[])
    c["unit_inference"] = {k: int(v) for k, v in f.price_unit_inferred.value_counts().items()} if len(f) else {}
    f["stat"] = f.family
    f["threshold"] = pd.to_numeric(f.ticker.str.extract(r"-(\d+)$")[0], errors="coerce")
    f["p_model"] = f.p_player.astype(float)
    f["y"] = f.y.astype(float)
    f["cl"] = f.game_id.astype(str) + "|" + f.player_id.astype(str) + "|" + f.family
    f["model_version"] = f.model_version
    out = f[["ticker", "cl", "game_id", "stat", "threshold", "period", "observed_at", "start_utc",
             "yes_bid", "yes_ask", "no_ask", "p_model", "y", "model_version"]].reset_index(drop=True)
    c["rows_in_frame"] = int(len(out))
    return out, c


def load_player_frame(archive_root, max_days=None):
    return build_frame(_read(archive_root, max_days))


def main(argv=None):
    a = argv or sys.argv[1:]
    if len(a) != 2:
        print(__doc__)
        return 2
    frame, counts = load_player_frame(a[0])
    rep = evaluate_frame(frame, "NHL", raw_snapshot_rows=counts["raw_rows"])
    q = prepare(frame).quote_status.value_counts()
    counts["quarantine_by_state"] = {k: int(v) for k, v in q.items()}
    counts["quarantine_by_state_and_family"] = {f"{k[0]}|{k[1]}": int(v) for k, v in
                                                prepare(frame).groupby(["stat", "quote_status"]).size().items()}
    rep["integrity"] = counts
    with open(a[1], "w") as fh:
        json.dump(rep, fh, indent=2, default=str)
    print(json.dumps({"status": rep["status"], "scored_units": rep["n_scored_units"], "integrity": counts}, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
