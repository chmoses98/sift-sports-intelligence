"""NBA adapter: frozen PURE shadow forecasts (nba-shadow-pure) x last pre-tip Kalshi quote (data-archive) x settlement.

    python -m research.intelligence.adapters.nba <shadow_root> <archive_root> <out.json> [arm]

shadow_root  = checkout/extract of branch `nba-shadow-pure` (projections/<arm>/conditional/dt=*/*.jsonl.gz, market/listings/,
               outcomes/gate/, chain.jsonl).  archive_root = checkout/extract of `data-archive` (kalshi/markets,
               kalshi/markets_delta, settlements).  Both are read-only; nothing is written except <out.json>.

JOIN (one row per ticker = KXNBAPTS/REB/AST/3PT rung; every rung of a player-stat-game shares `cl`):
  * forecast  : `pure_forecast.v1` row (arm, conditional_on_playing=True) with ladder entry projection.thresholds[at_least == k].
                The rung must match EXACTLY; there is no interpolation. as_of must be < kickoff.
  * quote     : the LAST observation of the ticker strictly before kickoff, replayed from markets checkpoints + hash-chained
                markets_delta files (deltas apply to the previous board: removed, added, changed, cleared). The forecast used is
                the latest one with as_of STRICTLY BEFORE that observation; if none exists the row is rejected (AS_OF_NOT_BEFORE_QUOTE).
  * mapping   : ticker -> (game_id, player_id) is EXACT and taken only from the shadow store's own `market/listings` rows, which
                the collector resolved at forecast time (Kalshi player UUID alias, else unique name on the team). A ticker that
                has no listing row can still be mapped when its event_ticker was seen in a listing (game) AND its Kalshi
                `custom_strike.basketball_player` UUID maps to exactly one player_id in listings (alias learned from the shadow's
                own resolutions; a UUID with two player_ids is dropped). Anything else is COUNTED as unmatched, never guessed.
                stat comes from the series (PTS/REB/AST/3PT), at_least from floor_strike (strike 'greater' -> floor+1,
                'greater_or_equal' -> floor) and must agree with the listing row when there is one.
  * outcome   : settlements/ last record per ticker; YES=1, NO=0, anything else (UNSETTLEABLE, ...) excluded and counted.
                A player with outcomes/gate played=False is excluded as DNP (the forecast is conditional on playing).
Quarantine (rows kept, labelled, never deleted): integrity.quote_status (placeholder 0.00/0.98 books etc.) and
`season_type == preseason` (those rows stay in the frame but are not scored by `evaluate_shadow`).
Not used: nba-edge-finder's prop_walk_forward_v3.csv (older simulator, retroactive) is excluded and never scored.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

from ..evaluate import REQUIRED, evaluate_frame
from ..integrity import quote_status

PROP_SERIES = {"KXNBAPTS": "points", "KXNBAREB": "rebounds", "KXNBAAST": "assists", "KXNBA3PT": "threes"}
EXTRA_COLS = ["player_id", "arm", "season_type", "quote_status", "forecast_as_of"]
COLUMNS = REQUIRED + ["model_version", "reported_exec"] + EXTRA_COLS
EXCLUDED_SOURCES = ["prop_walk_forward_v3.csv (older simulator, retroactive; mentioned, never scored)"]
NUMERIC = ("threshold", "yes_bid", "yes_ask", "no_ask", "p_model", "y")
TIMES = ("observed_at", "start_utc", "forecast_as_of")


REGULAR_SEASON_OPENS = "2026-10-20"


def _event_date(event_ticker) -> str:
    """'KXNBAPTS-26OCT20BOSDET' -> '2026-10-20' (informational bucket only; the join uses the forecast's own season type)."""
    try:
        return pd.to_datetime(str(event_ticker).split("-")[1][:7], format="%y%b%d").strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        return "0000-00-00"


# ---------------------------------------------------------------- io helpers
def _jsonl(path: Path) -> list[dict]:
    op = gzip.open if str(path).endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _files(root: Path, sub: str, pat: str) -> list[Path]:
    d = root / sub
    return sorted(d.glob(pat)) if d.exists() else []


def _ts(s) -> pd.Timestamp | None:
    if s is None or s == "":
        return None
    t = pd.Timestamp(s)
    return t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")


def _price(row: dict, name: str, cents_key: str) -> float | None:
    v = row.get(f"{name}_dollars")
    if v not in (None, ""):
        return float(v)
    c = (row.get("_quote_cents") or {}).get(cents_key)
    return None if c is None else c / 100.0


def _at_least(row: dict) -> float | None:
    f = row.get("floor_strike")
    if f in (None, ""):
        return None
    f = float(f)
    st = row.get("strike_type")
    if st == "greater":
        return float(math.floor(f) + 1)
    if st == "greater_or_equal":
        return f
    return None


def verify_chain(shadow_root: Path, files: list[Path]) -> dict:
    """Structural audit of the shadow store: every read file is listed in chain.jsonl with a matching sha256, and the
    chain's prev pointers are contiguous. Reports, never repairs."""
    cp = shadow_root / "chain.jsonl"
    rep = {"chain_present": cp.exists(), "files_checked": 0, "sha_mismatch": 0, "unlisted": 0, "chain_breaks": 0}
    if not cp.exists():
        return rep
    entries = _jsonl(cp)
    by_path = {e["path"]: e for e in entries}
    prev = "0" * 64
    for e in entries:
        if e.get("prev") != prev:
            rep["chain_breaks"] += 1
        prev = e.get("link", prev)
    for f in files:
        e = by_path.get(f.relative_to(shadow_root).as_posix())
        rep["files_checked"] += 1
        if e is None:
            rep["unlisted"] += 1
        elif hashlib.sha256(f.read_bytes()).hexdigest() != e["sha256"]:
            rep["sha_mismatch"] += 1
    rep["ok"] = not (rep["sha_mismatch"] or rep["unlisted"] or rep["chain_breaks"])
    return rep


# ---------------------------------------------------------------- shadow side
def read_forecasts(shadow_root: Path, arm: str):
    """-> (dict[(game_id, player_id, stat)] -> forecast rows sorted by as_of, counts, files read)."""
    files = _files(shadow_root, f"projections/{arm}/conditional", "dt=*/*.jsonl.gz")
    by_key = defaultdict(list)
    n = Counter()
    for f in files:
        for r in _jsonl(f):
            if r.get("schema_version") != "pure_forecast.v1" or r.get("statistic") not in PROP_SERIES.values():
                n["rows_skipped_other_schema_or_stat(minutes)"] += 1
                continue
            n["forecast_rows"] += 1
            n[f"forecast_rows_{r.get('x_season_type')}"] += 1
            n["forecast_rungs"] += len(r["projection"].get("thresholds", []))
            if not (r["as_of"] < r["kickoff"]):
                n["forecast_rows_not_pretip_excluded"] += 1
                continue
            by_key[(r["game_id"], str(r["player_id"]), r["statistic"])].append(r)
    for v in by_key.values():
        v.sort(key=lambda r: r["as_of"])
    return by_key, dict(n), files


def read_listings(shadow_root: Path):
    """Shadow-resolved ticker identities: (ticker -> row, event_ticker -> game_id, counts)."""
    rows, unresolved = [], 0
    for f in _files(shadow_root, "market/listings", "dt=*/*.jsonl.gz"):
        rows += [r for r in _jsonl(f) if r.get("record") == "market_listing"]
    for f in _files(shadow_root, "market/listings_status", "dt=*/*.jsonl.gz"):
        unresolved += sum(int(r.get("n_unresolved_player") or 0) for r in _jsonl(f))
    by_ticker, event_game, conflict = {}, {}, set()
    for r in rows:
        if r.get("player_id") is None:
            continue
        by_ticker[r["ticker"]] = r
        e = r.get("event_ticker")
        if e in event_game and event_game[e] != r["game_id"]:
            conflict.add(e)
        event_game[e] = r["game_id"]
    for e in conflict:
        event_game.pop(e, None)
    return by_ticker, event_game, {"shadow_listing_rows": len(rows), "shadow_listings_resolved": len(by_ticker),
                                   "shadow_listings_unresolved_player": unresolved}


def read_played(shadow_root: Path) -> dict:
    played = {}
    for f in _files(shadow_root, "outcomes/gate", "dt=*/*.jsonl.gz"):
        for r in _jsonl(f):
            if r.get("played") is not None:
                played[(r["game_id"], str(r["player_id"]))] = bool(r["played"])
    return played


# ---------------------------------------------------------------- archive side
def read_quotes(archive_root: Path):
    """Replay checkpoints + deltas for prop-series tickers.
    -> (meta[ticker] static fields of the latest row, obs[ticker] time-sorted [(observed_at, bid, ask, no_ask)], counts)."""
    meta, obs, n = {}, defaultdict(list), Counter()

    def keep(t: str) -> bool:
        return t.split("-")[0] in PROP_SERIES

    def emit(row: dict, at):
        t = row["ticker"]
        meta[t] = {k: row.get(k) for k in ("event_ticker", "floor_strike", "strike_type", "custom_strike", "status", "open_time")}
        obs[t].append((at, _price(row, "yes_bid", "yes_bid"), _price(row, "yes_ask", "yes_ask"), _price(row, "no_ask", "no_ask")))

    bases = {}
    for f in _files(archive_root, "kalshi/markets", "dt=*/*.jsonl.gz"):
        board = {}
        for r in _jsonl(f):
            if keep(r["ticker"]):
                board[r["ticker"]] = r
                emit(r, _ts(r.get("_observed_at_utc")))
                n["quote_snapshot_rows"] += 1
        bases[f.relative_to(archive_root).as_posix()] = board
        n["checkpoint_files"] += 1
    chains = defaultdict(list)
    for f in _files(archive_root, "kalshi/markets_delta", "dt=*/*.json.gz"):
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            d = json.loads(fh.read())
        chains[d["base_path"]].append(d)
    for base_path, deltas in chains.items():
        if base_path not in bases:
            n["delta_files_without_checkpoint"] += len(deltas)
            continue
        board = {t: dict(r) for t, r in bases[base_path].items()}
        for d in sorted(deltas, key=lambda x: x["seq"]):
            at, touched = _ts(d["captured_at_utc"]), set()
            for t in d.get("removed", []):
                board.pop(t, None)
            for t, r in d.get("added", {}).items():
                if keep(t):
                    board[t] = dict(r)
                    touched.add(t)
            for t, diff in d.get("changed", {}).items():
                if t in board:
                    board[t].update(diff)
                    touched.add(t)
            for t, fields in d.get("cleared", {}).items():
                if t in board:
                    for fl in fields:
                        board[t].pop(fl, None)
                    touched.add(t)
            for t in touched:
                emit(board[t], at)
                n["quote_delta_observations"] += 1
            n["delta_files"] += 1
    for t in obs:
        obs[t].sort(key=lambda x: x[0])
    return meta, obs, dict(n)


def read_settlements(archive_root: Path):
    out = {}
    for f in _files(archive_root, "settlements", "dt=*/*.jsonl.gz"):
        for r in _jsonl(f):
            if r["ticker"].split("-")[0] in PROP_SERIES:
                out[r["ticker"]] = r
    return out, dict(Counter(r["outcome"] for r in out.values()))


# ---------------------------------------------------------------- join
def _empty_frame() -> pd.DataFrame:
    df = pd.DataFrame({c: pd.Series(dtype="float64" if c in NUMERIC else "object") for c in COLUMNS})
    for c in TIMES:
        df[c] = pd.to_datetime(df[c], utc=True)
    return df


def load_prospective_frame(shadow_root, archive_root, arm: str = "sim_rotation"):
    """-> (DataFrame in ADAPTER SCHEMA (+ EXTRA_COLS), counts). Every prop ticker ends in exactly one terminal reason."""
    shadow_root, archive_root = Path(shadow_root), Path(archive_root)
    fc, fc_n, fc_files = read_forecasts(shadow_root, arm)
    listings, event_game, lst_n = read_listings(shadow_root)
    played = read_played(shadow_root)
    meta, obs, q_n = read_quotes(archive_root)
    settle, st_n = read_settlements(archive_root)

    # player-UUID aliases learned ONLY from the shadow's own resolutions; ambiguous UUIDs are dropped
    uuid_pid = defaultdict(set)
    for t, r in listings.items():
        u = (meta.get(t, {}).get("custom_strike") or {}).get("basketball_player")
        if u:
            uuid_pid[u].add(str(r["player_id"]))

    counts = {"arm": arm, "forecasts": fc_n, "shadow_chain": verify_chain(shadow_root, fc_files), "listings": lst_n,
              "quotes": {**q_n, "prop_tickers": len(meta), "prop_tickers_by_series": dict(Counter(t.split("-")[0] for t in meta)),
                         "prop_tickers_with_quote_observation": sum(1 for t in meta if obs.get(t))},
              "settlements": {"prop_ticker_records": len(settle), "by_outcome": st_n},
              "excluded_sources": EXCLUDED_SOURCES}
    last = pd.DataFrame([{"yes_bid": o[-1][1], "yes_ask": o[-1][2]} for o in obs.values() if o])
    counts["quotes"]["last_observation_quote_status"] = (
        {k: int(v) for k, v in quote_status(last, bid="yes_bid", ask="yes_ask").value_counts().items()} if len(last) else {})
    counts["quotes"]["tickers_by_event_date_class"] = dict(Counter(
        "on_or_after_2026-10-20_regular_season_opening" if _event_date(m.get("event_ticker")) >= REGULAR_SEASON_OPENS
        else "before_opening_preseason" for m in meta.values()))
    reasons, rows, n_ladders = Counter(), [], 0
    for t, m in sorted(meta.items()):
        stat = PROP_SERIES[t.split("-")[0]]
        at_k = _at_least(m)
        L = listings.get(t)
        if L is not None:
            gid, pid = L["game_id"], str(L["player_id"])
            if L.get("statistic") != stat or (at_k is not None and L.get("at_least") is not None and float(L["at_least"]) != at_k):
                reasons["LISTING_DISAGREES_WITH_TICKER_FIELDS"] += 1
                continue
        else:
            u = (m.get("custom_strike") or {}).get("basketball_player")
            gid = event_game.get(m.get("event_ticker"))
            pids = uuid_pid.get(u, set()) if u else set()
            if gid is None:
                reasons["NO_SHADOW_LISTING_FOR_EVENT"] += 1
                continue
            if len(pids) != 1:
                reasons["PLAYER_UNRESOLVED_OR_AMBIGUOUS"] += 1
                continue
            pid = next(iter(pids))
        if at_k is None:
            reasons["UNPARSEABLE_THRESHOLD"] += 1
            continue
        cands = fc.get((gid, pid, stat))
        if not cands:
            reasons["NO_FORECAST_FOR_GAME_PLAYER_STAT"] += 1
            continue
        tip = _ts(cands[-1]["kickoff"])
        pre = [o for o in obs.get(t, []) if o[0] is not None and o[0] < tip]
        if not pre:
            reasons["NO_PRE_TIP_QUOTE"] += 1
            continue
        o = pre[-1]
        usable = [r for r in cands if _ts(r["as_of"]) < o[0]]
        if not usable:
            reasons["AS_OF_NOT_BEFORE_QUOTE"] += 1
            continue
        f = usable[-1]
        p = next((x["probability"] for x in f["projection"].get("thresholds", []) if abs(float(x["at_least"]) - at_k) < 1e-9), None)
        if p is None:
            reasons["NO_MATCHING_LADDER_RUNG"] += 1
            continue
        n_ladders += 1
        if played.get((gid, pid)) is False:
            reasons["DNP_EXCLUDED"] += 1
            continue
        s = settle.get(t)
        if s is None:
            reasons["AWAITING_SETTLEMENT"] += 1
            continue
        if s["outcome"] not in ("YES", "NO"):
            reasons[f"SETTLEMENT_{s['outcome']}"] += 1
            continue
        reasons["JOINED_SETTLED"] += 1
        rows.append({"ticker": t, "cl": f"{gid}|{pid}|{stat}", "game_id": gid, "stat": stat, "threshold": at_k,
                     "period": str(tip.date()), "observed_at": o[0], "start_utc": tip, "yes_bid": o[1], "yes_ask": o[2], "no_ask": o[3],
                     "p_model": float(p), "y": 1.0 if s["outcome"] == "YES" else 0.0, "model_version": f["model_version"],
                     "reported_exec": None, "player_id": pid, "arm": arm, "season_type": f.get("x_season_type"),
                     "quote_status": None, "forecast_as_of": _ts(f["as_of"])})
    if rows:
        df = pd.DataFrame(rows, columns=COLUMNS)
        for c in ("yes_bid", "yes_ask", "no_ask"):
            df[c] = pd.to_numeric(df[c])
        df["quote_status"] = quote_status(df, bid="yes_bid", ask="yes_ask")
    else:
        df = _empty_frame()
    counts["funnel"] = {"prop_tickers": len(meta), "forecast_ladder_matches_with_pretip_quote": n_ladders,
                        "terminal_reason_counts": dict(reasons)}
    counts["frame_rows"] = int(len(df))
    counts["frame_quarantine"] = {"quote_status": {k: int(v) for k, v in df.quote_status.value_counts().items()},
                                  "preseason_rows": int((df.season_type == "preseason").sum())}
    return df, counts


def evaluate_shadow(df: pd.DataFrame, counts: dict) -> dict:
    """Score only regular-season rows (preseason rows are quarantined, kept and counted). Empty -> INSUFFICIENT_EVIDENCE."""
    scoreable = df[df.season_type != "preseason"]
    if scoreable.empty:
        return {"sport": "NBA", "status": "INSUFFICIENT_EVIDENCE", "n_scored_contracts": 0, "n_scored_units": 0,
                "note": "no joinable settled regular-season forecast x pre-tip quote rows; no accuracy or betting claim is made",
                "reason": _top_reason(counts)}
    return evaluate_frame(scoreable, "NBA")


def _top_reason(counts: dict) -> str:
    f = counts["funnel"]
    r = {k: v for k, v in f["terminal_reason_counts"].items() if k != "JOINED_SETTLED"}
    if not f["prop_tickers"]:
        return "no player-prop (KXNBAPTS/REB/AST/3PT) market observations in the archive"
    if not r:
        return "all joined rows are preseason"
    k = max(r, key=r.get)
    return f"most prop tickers stop at {k} ({r[k]} of {f['prop_tickers']})"


def main(argv=None) -> int:
    a = list(sys.argv[1:] if argv is None else argv)
    if len(a) < 3:
        print("usage: python -m research.intelligence.adapters.nba <shadow_root> <archive_root> <out.json> [arm]")
        return 2
    df, counts = load_prospective_frame(a[0], a[1], a[3] if len(a) > 3 else "sim_rotation")
    out = {"funnel": counts, "evaluation": evaluate_shadow(df, counts)}
    out["status"] = out["evaluation"]["status"]
    Path(a[2]).write_text(json.dumps(out, indent=2, default=str))
    print(out["status"], json.dumps(counts["funnel"]["terminal_reason_counts"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
