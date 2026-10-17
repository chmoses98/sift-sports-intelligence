import gzip
import json
from pathlib import Path

import pandas as pd

from research.intelligence.adapters import nba
from research.intelligence.evaluate import REQUIRED

TIP = "2026-10-20T23:00:00Z"
TICKER = "KXNBAPTS-26OCT20BOSDET-BOSJTATUM0-25"
EVENT = "KXNBAPTS-26OCT20BOSDET"


def _gz(path: Path, rows, whole=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt") as fh:
        fh.write(json.dumps(rows) if whole else "".join(json.dumps(r) + "\n" for r in rows))


def _forecast(as_of, season="regular", p=0.4, k=25.0, stat="points"):
    return {"schema_version": "pure_forecast.v1", "as_of": as_of, "kickoff": TIP, "game_id": "g1", "player_id": "7", "statistic": stat,
            "conditional_on_playing": True, "model_version": "V1:sim-rotation-pure", "x_season_type": season,
            "projection": {"mean": 24.0, "thresholds": [{"at_least": 20.0, "probability": 0.6}, {"at_least": k, "probability": p}]}}


def _market(ticker=TICKER, bid="0.40", ask="0.44", at="2026-10-20T22:00:00Z", strike=24.5):
    return {"ticker": ticker, "event_ticker": EVENT, "series_ticker": ticker.split("-")[0], "floor_strike": strike,
            "strike_type": "greater", "custom_strike": {"basketball_player": "u-1"}, "yes_bid_dollars": bid, "yes_ask_dollars": ask,
            "no_ask_dollars": f"{1 - float(bid):.2f}", "_observed_at_utc": at}


def _listing(ticker=TICKER, pid="7", stat="points", at_least=25.0):
    return {"record": "market_listing", "ticker": ticker, "event_ticker": EVENT, "game_id": "g1", "player_id": pid, "statistic": stat,
            "at_least": at_least}


def _build(tmp_path, forecasts=(), markets=(), listings=(), settlements=(), gate=()):
    sh, ar = tmp_path / "shadow", tmp_path / "archive"
    sh.mkdir(parents=True), ar.mkdir(parents=True)
    if forecasts:
        _gz(sh / "projections/sim_rotation/conditional/dt=2026-10-20/f.jsonl.gz", list(forecasts))
    if listings:
        _gz(sh / "market/listings/dt=2026-10-20/l.jsonl.gz", list(listings))
    if gate:
        _gz(sh / "outcomes/gate/dt=2026-10-21/g.jsonl.gz", list(gate))
    if markets:
        _gz(ar / "kalshi/markets/dt=2026-10-20/m.jsonl.gz", list(markets))
    if settlements:
        _gz(ar / "settlements/dt=2026-10-21/s.jsonl.gz", list(settlements))
    return sh, ar


def _settle(outcome="YES", ticker=TICKER):
    return {"ticker": ticker, "outcome": outcome}


def test_join_correctness_and_schema(tmp_path):
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z")], [_market()], [_listing()], [_settle("YES")])
    df, c = nba.load_prospective_frame(sh, ar)
    assert len(df) == 1 and all(col in df.columns for col in REQUIRED)
    r = df.iloc[0]
    assert r.ticker == TICKER and r.p_model == 0.4 and r.y == 1.0 and r.stat == "points" and r.threshold == 25.0
    assert r.cl == "g1|7|points" and r.yes_bid == 0.40 and r.yes_ask == 0.44 and r.quote_status == "VALID_TWO_SIDED"
    assert r.forecast_as_of < r.observed_at < r.start_utc
    assert c["funnel"]["terminal_reason_counts"] == {"JOINED_SETTLED": 1}


def test_as_of_not_before_quote_is_rejected(tmp_path):
    # forecast frozen AFTER the last pre-tip quote: must not be joined
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T22:30:00Z")], [_market(at="2026-10-20T22:00:00Z")], [_listing()], [_settle()])
    df, c = nba.load_prospective_frame(sh, ar)
    assert df.empty and c["funnel"]["terminal_reason_counts"] == {"AS_OF_NOT_BEFORE_QUOTE": 1}
    # equal timestamps are also rejected (strict inequality)
    sh2, ar2 = _build(tmp_path / "eq", [_forecast("2026-10-20T22:00:00Z")], [_market(at="2026-10-20T22:00:00Z")], [_listing()], [_settle()])
    assert nba.load_prospective_frame(sh2, ar2)[0].empty


def test_picks_latest_forecast_before_quote(tmp_path):
    fc = [_forecast("2026-10-20T10:00:00Z", p=0.3), _forecast("2026-10-20T21:30:00Z", p=0.5), _forecast("2026-10-20T22:30:00Z", p=0.9)]
    sh, ar = _build(tmp_path, fc, [_market(at="2026-10-20T22:00:00Z")], [_listing()], [_settle()])
    assert nba.load_prospective_frame(sh, ar)[0].iloc[0].p_model == 0.5


def test_placeholder_book_quarantined_not_deleted(tmp_path):
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z")], [_market(bid="0.00", ask="0.98")], [_listing()], [_settle()])
    df, c = nba.load_prospective_frame(sh, ar)
    assert len(df) == 1 and df.iloc[0].quote_status == "PLACEHOLDER_BOOK"
    assert c["frame_quarantine"]["quote_status"] == {"PLACEHOLDER_BOOK": 1}
    ev = nba.evaluate_shadow(df, c)
    assert ev["status"] == "INSUFFICIENT_EVIDENCE"


def test_preseason_rows_kept_but_not_scored(tmp_path):
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z", season="preseason")], [_market()], [_listing()], [_settle()])
    df, c = nba.load_prospective_frame(sh, ar)
    assert len(df) == 1 and c["frame_quarantine"]["preseason_rows"] == 1
    assert nba.evaluate_shadow(df, c)["status"] == "INSUFFICIENT_EVIDENCE"


def test_unmatched_counted_not_guessed(tmp_path):
    other = "KXNBAPTS-26OCT20BOSDET-BOSJBROWN7-25"
    unknown_event = "KXNBAREB-26OCT21LALPHX-LALLJAMES23-8"
    mk = [_market(), _market(other), dict(_market(unknown_event), event_ticker="KXNBAREB-26OCT21LALPHX", custom_strike={"basketball_player": "u-9"}),
          _market("KXNBAPTS-26OCT20BOSDET-BOSJTATUM0-30", strike=29.5)]
    # TICKER listed -> mapped; `other` has an unseen UUID on a known event; 30+ rung is not on the forecast ladder
    mk[1]["custom_strike"] = {"basketball_player": "u-2"}
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z")], mk, [_listing()], [_settle()])
    df, c = nba.load_prospective_frame(sh, ar)
    reasons = c["funnel"]["terminal_reason_counts"]
    # 30+ ticker has no listing row but shares tatum's UUID u-1 on a listed event: mapped by alias, then no ladder rung
    assert reasons == {"JOINED_SETTLED": 1, "PLAYER_UNRESOLVED_OR_AMBIGUOUS": 1, "NO_SHADOW_LISTING_FOR_EVENT": 1,
                       "NO_MATCHING_LADDER_RUNG": 1}
    assert len(df) == 1 and c["funnel"]["prop_tickers"] == 4


def test_settlement_stages_and_dnp(tmp_path):
    fc = [_forecast("2026-10-20T12:00:00Z")]
    # unsettleable
    sh, ar = _build(tmp_path / "a", fc, [_market()], [_listing()], [_settle("UNSETTLEABLE")])
    assert nba.load_prospective_frame(sh, ar)[1]["funnel"]["terminal_reason_counts"] == {"SETTLEMENT_UNSETTLEABLE": 1}
    # awaiting
    sh, ar = _build(tmp_path / "b", fc, [_market()], [_listing()])
    assert nba.load_prospective_frame(sh, ar)[1]["funnel"]["terminal_reason_counts"] == {"AWAITING_SETTLEMENT": 1}
    # DNP (forecast is conditional on playing)
    gate = [{"game_id": "g1", "player_id": "7", "played": False, "statistic": "points"}]
    sh, ar = _build(tmp_path / "c", fc, [_market()], [_listing()], [_settle("NO")], gate)
    assert nba.load_prospective_frame(sh, ar)[1]["funnel"]["terminal_reason_counts"] == {"DNP_EXCLUDED": 1}


def test_delta_replay_gives_last_pre_tip_quote(tmp_path):
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z")], [_market(bid="0.10", ask="0.50", at="2026-10-20T13:00:00Z")], [_listing()],
                    [_settle()])
    base = "kalshi/markets/dt=2026-10-20/m.jsonl.gz"
    d1 = {"base_path": base, "seq": 1, "captured_at_utc": "2026-10-20T20:00:00Z", "removed": [], "added": {},
          "changed": {TICKER: {"yes_bid_dollars": "0.41", "yes_ask_dollars": "0.45"}}, "cleared": {}}
    d2 = {"base_path": base, "seq": 2, "captured_at_utc": "2026-10-20T23:30:00Z", "removed": [], "added": {},
          "changed": {TICKER: {"yes_bid_dollars": "0.99", "yes_ask_dollars": "1.00"}}, "cleared": {}}  # after tip: ignored
    _gz(ar / "kalshi/markets_delta/dt=2026-10-20/d1.json.gz", d1, whole=True)
    _gz(ar / "kalshi/markets_delta/dt=2026-10-20/d2.json.gz", d2, whole=True)
    r = nba.load_prospective_frame(sh, ar)[0].iloc[0]
    assert (r.yes_bid, r.yes_ask) == (0.41, 0.45) and r.observed_at == pd.Timestamp("2026-10-20T20:00:00Z")


def test_empty_is_insufficient_evidence_funnel(tmp_path):
    sh, ar = _build(tmp_path, [_forecast("2026-10-20T12:00:00Z")], [_market()], [], [_settle()])  # no listing row -> unmapped
    out = tmp_path / "out.json"
    assert nba.main([str(sh), str(ar), str(out)]) == 0
    d = json.loads(out.read_text())
    assert d["status"] == "INSUFFICIENT_EVIDENCE" and d["evaluation"]["status"] == "INSUFFICIENT_EVIDENCE"
    f = d["funnel"]
    assert f["forecasts"]["forecast_rows"] == 1 and f["quotes"]["prop_tickers"] == 1 and f["settlements"]["prop_ticker_records"] == 1
    assert f["listings"]["shadow_listings_resolved"] == 0
    assert f["funnel"]["terminal_reason_counts"] == {"NO_SHADOW_LISTING_FOR_EVENT": 1}
    assert "NO_SHADOW_LISTING_FOR_EVENT" in d["evaluation"]["reason"]


def test_fully_empty_roots(tmp_path):
    sh, ar = _build(tmp_path)
    df, c = nba.load_prospective_frame(sh, ar)
    assert df.empty and nba.evaluate_shadow(df, c)["status"] == "INSUFFICIENT_EVIDENCE"
