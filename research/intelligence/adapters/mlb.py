"""MLB adapter: hitter point-in-time projection snapshots + Kalshi quotes + settlements -> ADAPTER SCHEMA (see ../evaluate.py).

Source repo (read-only): edge-finder-api, data/edgelab/{hitter_projection_snapshots,observations,settlements,model_evaluations}.

Point-in-time rules
  * One row per ticker = the LAST projected, pre-start snapshot (by marketObservedAt, then projectionGeneratedAt).
  * The quote is the latest observation of that ticker captured at or before marketObservedAt (never later), not POST_START,
    not after first pitch, and not older than MAX_QUOTE_LAG_MIN before marketObservedAt (else the quote is dropped).
  * Quote units are inferred per observation FILE from the whole file (not only the hitter rows); a file that mixes cents and
    dollar captures (2026-09-10) is inferred per capture (provenance.sourceFile) instead.
  * executableKalshiPrice is passed through as reported_exec: it is the MID, so integrity.quote_status flags ASK_EQUALS_MID.
  * Pitcher model_evaluations with modelVersion null are retroactive reconstructions: counted, never scored.
"""
from __future__ import annotations

import glob
import gzip
import json
import os
import re
import sys
from collections import Counter, defaultdict
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from ..evaluate import evaluate_frame, prepare
from ..integrity import VALID, infer_price_scale

EDGELAB = os.path.join("data", "edgelab")
MAX_QUOTE_LAG_MIN = 45.0
_MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
_TK = re.compile(r"-(\d{2})([A-Z]{3})(\d{2})(\d{4})")
PRICE_COLS = ["yesBid", "yesAsk", "noBid", "noAsk"]


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def _rows(path):
    with _open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except ValueError:
                    continue


def _files(root, sub):
    return sorted(glob.glob(os.path.join(root, EDGELAB, sub, "*.jsonl*")))


def start_from_ticker(ticker):
    """Kalshi event time in the ticker (YYMONDDHHMM) is America/New_York local first-pitch time -> UTC Timestamp, or NaT."""
    m = _TK.search(ticker or "")
    if not m or m.group(2) not in _MON:
        return pd.NaT
    yy, mon, dd, hhmm = int(m.group(1)), _MON[m.group(2)], int(m.group(3)), m.group(4)
    try:
        loc = pd.Timestamp(2000 + yy, mon, dd, int(hhmm[:2]), int(hhmm[2:]), tz=ZoneInfo("America/New_York"))
    except ValueError:
        return pd.NaT
    return loc.tz_convert("UTC")


def _ts(x):
    return pd.to_datetime(x, utc=True, errors="coerce")


def _prices(d):
    return [float(d[c]) for c in PRICE_COLS if isinstance(d.get(c), (int, float)) and not isinstance(d.get(c), bool)]


def load_snapshots(root, max_days=None):
    files = _files(root, "hitter_projection_snapshots")
    if max_days:
        files = files[:max_days]
    out = []
    for f in files:
        out.extend(_rows(f))
    return out, [os.path.basename(f).split(".")[0] for f in files]


def load_observations(root, tickers, dates):
    """Stream observation files; return rows of wanted tickers plus per-file unit inference computed on the WHOLE file."""
    want = set(tickers)
    keep, units = [], {}
    files = _files(root, "observations")
    for f in files:
        name = os.path.basename(f).split(".")[0]
        cap_max = defaultdict(float)
        n = 0
        rows = []
        for d in _rows(f):
            n += 1
            src = (d.get("provenance") or {}).get("sourceFile") or ""
            p = _prices(d)
            if p:
                cap_max[src] = max(cap_max[src], max(p))
            if d.get("marketTicker") in want:
                rows.append((src, d))
        cap_scale = {s: infer_price_scale([m]) for s, m in cap_max.items()}
        file_scale = infer_price_scale([max(cap_max.values())]) if cap_max else "dollars"
        mixed = len(set(cap_scale.values())) > 1
        units[name] = {"rows": n, "scale": "mixed" if mixed else file_scale, "captures": len(cap_scale),
                       "cents_captures": sum(v == "cents" for v in cap_scale.values())}
        for src, d in rows:
            scale = cap_scale.get(src, file_scale) if mixed else file_scale
            div = 100.0 if scale == "cents" else 1.0
            keep.append(dict(ticker=d["marketTicker"], captured=d.get("capturedAt"), checkpoint=d.get("checkpoint"),
                             valid_pre=d.get("isValidPregameObservation"), started=d.get("gameStartedAtCapture"),
                             sched=d.get("scheduledStart"), file=name, scale=scale,
                             **{c: (float(d[c]) / div if isinstance(d.get(c), (int, float)) else np.nan) for c in PRICE_COLS}))
    return pd.DataFrame(keep), units


def load_settlements(root):
    out, conflicts, n = {}, 0, 0
    for f in _files(root, "settlements"):
        for d in _rows(f):
            n += 1
            o = d.get("outcome")
            y = {"YES": 1.0, "NO": 0.0}.get(o if isinstance(o, str) else None)
            t = d.get("marketTicker")
            if t is None or y is None:
                continue
            if t in out and out[t] != y:
                conflicts += 1
            out[t] = y
    return out, {"settlement_rows": n, "settled_tickers_yes_no": len(out), "conflicting_duplicates": conflicts}


def retroactive_pitcher_counts(root):
    c = Counter()
    for f in _files(root, "model_evaluations"):
        for d in _rows(f):
            fam = str(d.get("marketFamily") or "")
            if "pitcher" in fam.lower():
                c["pitcher_rows_total"] += 1
                c["pitcher_rows_retroactive_excluded" if d.get("modelVersion") is None else "pitcher_rows_with_modelVersion"] += 1
    return {k: int(c.get(k, 0)) for k in ("pitcher_rows_total", "pitcher_rows_retroactive_excluded", "pitcher_rows_with_modelVersion")}


def load_hitter_frame(repo_root, max_days=None):
    snaps, dates = load_snapshots(repo_root, max_days)
    rc = {"snapshot_files": len(dates), "snapshot_rows": len(snaps)}
    reasons = Counter()
    cand = []
    for s in snaps:
        t = s.get("marketTicker")
        start = start_from_ticker(t)
        obs_at, gen_at = _ts(s.get("marketObservedAt")), _ts(s.get("projectionGeneratedAt"))
        if s.get("projectionStatus") != "PROJECTED" or s.get("modelProbability") is None:
            reasons["not_projected_or_no_probability"] += 1
        elif t is None or pd.isna(start):
            reasons["unparseable_ticker_start"] += 1
        elif pd.isna(obs_at) or obs_at >= start:
            reasons["market_observed_at_or_after_start"] += 1
        elif pd.isna(gen_at) or gen_at >= start:
            reasons["generated_at_or_after_start"] += 1
        else:
            cand.append((t, obs_at, gen_at, start, s))
    rc["snapshot_rows_dropped_by_reason"] = dict(reasons)
    rc["snapshot_rows_projected_pre_start"] = len(cand)
    rc["contracts_projected_pre_start"] = len({c[0] for c in cand})
    last = {}
    for c in cand:                                   # last pre-start snapshot per ticker
        if c[0] not in last or (c[1], c[2]) >= (last[c[0]][1], last[c[0]][2]):
            last[c[0]] = c
    rc["duplicate_snapshot_rows_removed"] = len(cand) - len(last)
    obs, units = load_observations(repo_root, last.keys(), dates)
    rc["unit_inference_by_file"] = units
    rc["files_cents"] = sorted(k for k, v in units.items() if v["scale"] == "cents")
    rc["files_dollars_count"] = sum(v["scale"] == "dollars" for v in units.values())
    rc["files_mixed"] = sorted(k for k, v in units.items() if v["scale"] == "mixed")
    sett, srep = load_settlements(repo_root)
    rc.update(srep)
    rc.update(retroactive_pitcher_counts(repo_root))
    byt = {}
    rc["observations_of_scored_tickers"] = int(len(obs))
    post = 0
    if len(obs):
        obs["captured"] = _ts(obs["captured"])
        obs["start"] = obs["ticker"].map(start_from_ticker)
        is_post = (obs.checkpoint == "POST_START") | (obs.valid_pre == False) | (obs.started == True) | (obs.captured >= obs.start)  # noqa: E712
        post = int(is_post.sum())
        obs = obs[~is_post].sort_values("captured")
        byt = {t: g for t, g in obs.groupby("ticker")}
    rc["observations_excluded_post_start"] = post
    out, nomatch, stale = [], 0, 0
    lags = []
    for t, (_, obs_at, gen_at, start, s) in last.items():
        q = None
        g = byt.get(t)
        if g is not None:
            g = g[g.captured <= obs_at]
            if len(g):
                q = g.iloc[-1]
        yb = ya = na = np.nan
        if q is None:
            nomatch += 1
        else:
            lag = (obs_at - q.captured).total_seconds() / 60.0
            if lag > MAX_QUOTE_LAG_MIN:
                stale += 1
            else:
                yb, ya, na = q.yesBid, q.yesAsk, q.noAsk
                lags.append(lag)
        stat = s.get("marketFamily")
        out.append(dict(ticker=t, cl=f"{s.get('gameId')}|{s.get('playerId') or s.get('player')}|{stat}", game_id=str(s.get("gameId")), stat=stat,
                        threshold=s.get("threshold"), period=start.strftime("%Y-%m-%d"), observed_at=obs_at, start_utc=start,
                        yes_bid=yb, yes_ask=ya, no_ask=na, p_model=float(s["modelProbability"]), y=sett.get(t, np.nan),
                        model_version=s.get("engineCommitSha"), reported_exec=s.get("executableKalshiPrice"),
                        model_generated_at=gen_at))
    rc["contracts_without_prior_quote"] = nomatch
    rc["contracts_quote_older_than_%dmin_dropped" % MAX_QUOTE_LAG_MIN] = stale
    rc["quote_lag_minutes_median"] = float(np.median(lags)) if lags else None
    df = pd.DataFrame(out)
    if len(df):
        df["threshold"] = pd.to_numeric(df.threshold, errors="coerce")
        rc["contracts_settled"] = int(df.y.notna().sum())
        rc["contracts_unsettled_or_void"] = int(df.y.isna().sum())
    return df, rc


def integrity_report(repo_root, max_days=None, _loaded=None):
    df, rc = _loaded if _loaded is not None else load_hitter_frame(repo_root, max_days)
    rep = {"raw_counts": rc}
    if len(df):
        d = prepare(df)
        # What the reported_exec (mid-as-ask) flag removes: contracts whose REAL two-sided ask is fine but whose archive field is the mid.
        n = prepare(df.drop(columns=["reported_exec"]))
        v = n[n.quote_status == VALID]
        rep["valid_two_sided_ignoring_mid_as_ask_flag"] = {"contracts": int(v.ticker.nunique()), "independent_units": int(v.cl.nunique()),
                                                          "settled_units": int(v[v.y.notna()].cl.nunique())}
        rep["quote_status_counts"] = {k: int(v) for k, v in d.quote_status.value_counts().items()}
        rep["independent_units_total"] = int(d.cl.nunique())
        rep["games_total"] = int(d.game_id.nunique())
        rep["periods"] = [str(d.period.min()), str(d.period.max()), int(d.period.nunique())]
    return rep


def main(argv):
    if len(argv) != 3:
        print("usage: python -m research.intelligence.adapters.mlb <repo_root> <out.json>")
        return 2
    df, rc = load_hitter_frame(argv[1])
    rep = evaluate_frame(df, "MLB", raw_snapshot_rows=rc["snapshot_rows"])
    rep["integrity"] = integrity_report(argv[1], _loaded=(df, rc))
    with open(argv[2], "w") as f:
        json.dump(rep, f, indent=2, default=str)
    print(json.dumps({k: rep[k] for k in ("status", "n_scored_contracts", "n_scored_units")}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
