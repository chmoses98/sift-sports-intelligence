"""Data-integrity layer: units, executable-price validity and honest sample accounting.

Nothing here rewrites an observation. Every function returns a derived column or a report, so the immutable archive stays
as captured and a quarantined row is still countable.

Found in the 2026-10-17 inventory:
  * MLB observations switch from cents to dollars on 2026-09-10 (~19:04Z) -> infer the unit per capture, never globally.
  * MLB hitter snapshots store the MID as `executableKalshiPrice` -> an "executable" price equal to the mid is flagged.
  * NBA regular-season prop books were 0.00 bid / 0.98 ask placeholders -> not a price.
  * NHL headline compared the model on 211k rows with the market on 160k -> report one population for both.
  * every sport repeats tickers across snapshots and ladder rungs -> contracts != snapshots != independent outcomes.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# quote states
VALID = "VALID_TWO_SIDED"
ONE_SIDED = "ONE_SIDED"
PLACEHOLDER = "PLACEHOLDER_BOOK"
CROSSED = "CROSSED_OR_INVALID"
WIDE = "TOO_WIDE"
STALE = "STALE"
MID_AS_ASK = "ASK_EQUALS_MID"


def infer_price_scale(values) -> str:
    """'cents' when any price exceeds 1.5 (a dollar price cannot), else 'dollars'. Call per capture/file, never per archive."""
    v = pd.to_numeric(pd.Series(values), errors="coerce").dropna()
    if v.empty:
        return "dollars"
    return "cents" if v.max() > 1.5 else "dollars"


def to_dollars(df: pd.DataFrame, cols, group=None) -> pd.DataFrame:
    """Return a copy with `cols` in dollars. With `group` (e.g. the capture file/date) the unit is inferred per group."""
    out = df.copy()

    def conv(g):
        scale = infer_price_scale(pd.concat([pd.to_numeric(g[c], errors="coerce") for c in cols]))
        for c in cols:
            g[c] = pd.to_numeric(g[c], errors="coerce") / (100.0 if scale == "cents" else 1.0)
        g["price_unit_inferred"] = scale
        return g

    if group is None:
        return conv(out)
    return out.groupby(group, group_keys=False).apply(conv)


def quote_status(df: pd.DataFrame, bid="yes_bid", ask="yes_ask", no_ask=None, max_width=0.10, age_minutes=None,
                 max_age=45.0, reported_exec=None, mid="mid") -> pd.Series:
    """Classify each quote. Only VALID_TWO_SIDED quotes are executable opportunities."""
    b, a = df[bid].astype(float), df[ask].astype(float)
    s = pd.Series(VALID, index=df.index, dtype=object)
    s[(a - b) > max_width] = WIDE
    s[(b <= 0.0) | (a >= 1.0) | b.isna() | a.isna()] = ONE_SIDED
    s[(b <= 0.01) & (a >= 0.97)] = PLACEHOLDER                      # 0.00 / 0.98-style stub books
    s[(a < b) | (a <= 0) | (b > 1) | (a > 1.0)] = CROSSED
    if age_minutes is not None:
        s[(age_minutes > max_age) & (s == VALID)] = STALE
    if reported_exec is not None:                                    # a stored "executable" price that is really the mid
        m = df[mid] if mid in df else (a + b) / 2
        s[(reported_exec.astype(float) - m).abs().lt(1e-9) & ((a - m).abs() > 1e-6) & (s == VALID)] = MID_AS_ASK
    return s


def sample_accounting(df: pd.DataFrame, *, snapshot_col="obs", contract_col="ticker", cluster_col="cl", game_col="game_id",
                      status_col="quote_status", disagreement_col=None, min_disagreement=0.0) -> dict:
    """The four counts that must never be conflated, plus how many reach an executable opportunity."""
    d = df
    valid = d[d[status_col] == VALID] if status_col in d else d
    rep = {
        "snapshot_rows": int(len(d)),
        "contracts": int(d[contract_col].nunique()),
        "independent_player_stat_games": int(d[cluster_col].nunique()),
        "games": int(d[game_col].nunique()),
        "contracts_with_valid_executable_quote": int(valid[contract_col].nunique()),
        "independent_units_with_valid_executable_quote": int(valid[cluster_col].nunique()),
    }
    if disagreement_col is not None:
        big = valid[valid[disagreement_col].abs() > min_disagreement]
        rep["executable_opportunities_contracts"] = int(big[contract_col].nunique())
        rep["executable_opportunities_independent_units"] = int(big[cluster_col].nunique())
    if status_col in d:
        rep["quarantine_counts"] = {k: int(v) for k, v in d[status_col].value_counts().items()}
    rep["note"] = ("Evidence is counted in independent_units, never contracts or snapshots: rungs of one player-stat-game "
                   "settle together and repeated snapshots of a contract are one observation.")
    return rep


def like_for_like(df: pd.DataFrame, model_col: str, market_col: str) -> pd.DataFrame:
    """The only population on which a model-vs-market score may be reported: rows where BOTH forecasts exist."""
    return df[df[model_col].notna() & df[market_col].notna()]
