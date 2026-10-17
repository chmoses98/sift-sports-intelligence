import gzip
import json

from research.intelligence.adapters.nhl import load_player_frame
from research.intelligence.evaluate import prepare


def _row(ticker, family="player_goals", pred="2026-10-01T18:00:00Z", start="2026-10-01T23:00:00Z", yes_ask=20, no_ask=82,
         p=0.2, y=0, player=1, game="g1"):
    return {"ticker": ticker, "game_id": game, "family": family, "model_version": "PLAYER_SIM_V1", "predicted_at_utc": pred,
            "start_utc": start, "y": y, "p_player": p, "entry_yes_ask": yes_ask, "entry_no_ask": no_ask, "player_id": player}


def _write(tmp_path, rows):
    d = tmp_path / "evaluations_player" / "dt=2026-10-01"
    d.mkdir(parents=True)
    with gzip.open(d / "x.jsonl.gz", "wt") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    return str(tmp_path)


def test_dedup_keeps_last_and_counts(tmp_path):
    rows = [_row("T-1", pred="2026-10-01T17:00:00Z", p=0.1), _row("T-1", pred="2026-10-01T19:00:00Z", p=0.3),
            _row("T-1", pred="2026-10-01T20:00:00Z", p=0.4)]
    f, c = load_player_frame(_write(tmp_path, rows))
    assert len(f) == 1 and f.p_model.iloc[0] == 0.4 and c["raw_rows"] == 3 and c["duplicate_predictions_dropped"] == 2
    assert c["unit_inference"] == {"cents": 1} and abs(f.yes_ask.iloc[0] - 0.20) < 1e-9 and abs(f.yes_bid.iloc[0] - 0.18) < 1e-9


def test_pre_start_cutoff_respected(tmp_path):
    rows = [_row("T-1", pred="2026-10-01T21:00:00Z", p=0.1), _row("T-1", pred="2026-10-01T22:30:00Z", p=0.9),
            _row("T-2", pred="2026-10-01T22:30:00Z")]
    f, c = load_player_frame(_write(tmp_path, rows))
    assert list(f.ticker) == ["T-1"] and f.p_model.iloc[0] == 0.1
    assert c["tickers_with_no_row_ge_60min"] == 1 and c["rows_dropped_less_than_60min_before_start"] == 2
    assert (f.observed_at <= f.start_utc - __import__("pandas").Timedelta(minutes=60)).all()


def test_stub_quotes_quarantined(tmp_path):
    rows = [_row("T-1", yes_ask=99, no_ask=99, player=1), _row("T-2", yes_ask=1, no_ask=None, player=2),
            _row("T-3", player=3)]
    f, c = load_player_frame(_write(tmp_path, rows))
    st = dict(zip(f.ticker, prepare(f).quote_status))
    assert st["T-1"] != "VALID_TWO_SIDED" and st["T-2"] == "ONE_SIDED" and st["T-3"] == "VALID_TWO_SIDED"
    assert c["market_one_sided_no_bid_kept_for_quarantine"] == 1


def test_first_goal_excluded_and_counted(tmp_path):
    rows = [_row("F-1", family="first_goal"), _row("F-2", family="first_goal", player=2), _row("T-1", player=3)]
    f, c = load_player_frame(_write(tmp_path, rows))
    assert list(f.ticker) == ["T-1"] and c["excluded_families"] == {"first_goal": 2}
    assert f.cl.iloc[0] == "g1|3|player_goals"
