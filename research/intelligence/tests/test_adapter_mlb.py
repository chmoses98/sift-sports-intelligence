import gzip
import json

import pandas as pd

from research.intelligence.adapters.mlb import integrity_report, load_hitter_frame, start_from_ticker
from research.intelligence.evaluate import evaluate_frame, prepare

EL = "data/edgelab"
# 20:00 ET on 2026-10-12 == 00:00Z on 10-13
T1 = "KXMLBHIT-26OCT122000CLETB-CLEJRAMREZ11-3"
T2 = "KXMLBHIT-26OCT122000CLETB-CLEJRAMREZ11-2"
T3 = "KXMLBHIT-26OCT122000CLETB-CLEJRAMREZ11-1"


def snap(t, obs, gen, p=0.3, exec_=0.5, status="PROJECTED"):
    return dict(marketTicker=t, marketObservedAt=obs, projectionGeneratedAt=gen, modelProbability=p, executableKalshiPrice=exec_,
                projectionStatus=status, gameId=1, playerId="9", player="X", marketFamily="hitter_hits", threshold=3, engineCommitSha="abc")


def obs(t, cap, yb, ya, nb, na, cp="INTERMEDIATE", src="s1", valid=True):
    return dict(marketTicker=t, capturedAt=cap, checkpoint=cp, isValidPregameObservation=valid, gameStartedAtCapture=not valid,
                yesBid=yb, yesAsk=ya, noBid=nb, noAsk=na, provenance={"sourceFile": src})


def write(path, rows, gz=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = "".join(json.dumps(r) + "\n" for r in rows)
    if gz:
        with gzip.open(path, "wt") as f:
            f.write(data)
    else:
        path.write_text(data)


def build(tmp_path, snaps, obs_by_date, settle=(), model_evals=()):
    write(tmp_path / EL / "hitter_projection_snapshots" / "2026-10-12.jsonl", snaps)
    for d, rows in obs_by_date.items():
        write(tmp_path / EL / "observations" / f"{d}.jsonl.gz", rows, gz=True)
    write(tmp_path / EL / "settlements" / "2026-10-13.jsonl", [dict(marketTicker=t, outcome=o) for t, o in settle])
    write(tmp_path / EL / "model_evaluations" / "2026-10-12.jsonl", list(model_evals))
    return tmp_path


def test_ticker_start_is_new_york_local():
    assert start_from_ticker(T1) == pd.Timestamp("2026-10-13T00:00:00Z")


def test_cents_and_dollars_files_both_become_dollars(tmp_path):
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z", exec_=0.45)],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 40, 50, 50, 60), obs("OTHER", "2026-10-12T19:59:00Z", 90, 95, 5, 10)]},
                 settle=[(T1, "YES")])
    df, rc = load_hitter_frame(root)
    r = df.iloc[0]
    assert (r.yes_bid, r.yes_ask, r.no_ask) == (0.40, 0.50, 0.60) and r.y == 1.0
    assert rc["unit_inference_by_file"]["2026-10-12"]["scale"] == "cents"
    # same contract quoted in dollars in a different archive file
    root2 = build(tmp_path / "b", [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z")],
                  {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 0.40, 0.50, 0.50, 0.60)]})
    df2, rc2 = load_hitter_frame(root2)
    assert df2.iloc[0].yes_ask == 0.50 and rc2["unit_inference_by_file"]["2026-10-12"]["scale"] == "dollars"


def test_unit_is_inferred_from_whole_file_not_only_scored_rows(tmp_path):
    # the scored ticker trades at 1 cent (looks like 1.0 dollar if inferred from it alone); another row in the file proves cents
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z")],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 1, 2, 98, 99), obs("OTHER", "2026-10-12T19:59:00Z", 40, 60, 40, 60)]})
    df, _ = load_hitter_frame(root)
    assert df.iloc[0].yes_ask == 0.02


def test_mid_labelled_as_ask_is_a_field_defect_counted_not_a_reason_to_discard_the_quote(tmp_path):
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z", exec_=0.45)],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 0.40, 0.50, 0.50, 0.60)]}, settle=[(T1, "NO")])
    df, _ = load_hitter_frame(root)
    p = prepare(df)
    assert p.quote_status.iloc[0] == "VALID_TWO_SIDED" and bool(p.exec_field_is_mid.iloc[0])   # priced from the real ask
    rep = evaluate_frame(df, "MLB")
    assert rep["accounting"]["archive_executable_field_is_mid"] == 1 and rep["status"] == "INSUFFICIENT_EVIDENCE"
    assert integrity_report(root)["valid_two_sided_ignoring_mid_as_ask_flag"]["contracts"] == 1


def test_post_start_observations_and_snapshots_are_excluded(tmp_path):
    root = build(tmp_path,
                 [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z", exec_=0.9),
                  snap(T2, "2026-10-13T00:10:00Z", "2026-10-13T00:11:00Z")],           # observed after first pitch
                 {"2026-10-12": [obs(T1, "2026-10-12T19:50:00Z", 0.40, 0.50, 0.50, 0.60),
                                 obs(T1, "2026-10-12T19:59:30Z", 0.01, 0.99, 0.01, 0.99, cp="POST_START", valid=False)],
                  "2026-10-13": [obs(T1, "2026-10-13T00:30:00Z", 0.01, 0.02, 0.98, 0.99)]})
    df, rc = load_hitter_frame(root)
    assert list(df.ticker) == [T1] and df.iloc[0].yes_ask == 0.50       # the POST_START quote is never joined
    assert rc["observations_excluded_post_start"] == 2
    assert rc["snapshot_rows_dropped_by_reason"] == {"market_observed_at_or_after_start": 1}


def test_quote_is_never_taken_from_after_observed_at(tmp_path):
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z")],
                 {"2026-10-12": [obs(T1, "2026-10-12T20:10:00Z", 0.40, 0.50, 0.50, 0.60)]})
    df, rc = load_hitter_frame(root)
    assert pd.isna(df.iloc[0].yes_ask) and rc["contracts_without_prior_quote"] == 1


def test_duplicate_snapshots_dedup_to_last_and_are_counted(tmp_path):
    root = build(tmp_path, [snap(T1, "2026-10-12T18:00:00Z", "2026-10-12T18:01:00Z", p=0.1),
                            snap(T1, "2026-10-12T19:00:00Z", "2026-10-12T19:01:00Z", p=0.2),
                            snap(T1, "2026-10-12T19:30:00Z", "2026-10-12T19:31:00Z", p=0.3),
                            snap(T2, "2026-10-12T19:30:00Z", "2026-10-12T19:31:00Z", p=0.4),
                            snap(T3, "2026-10-12T19:30:00Z", "2026-10-12T19:31:00Z", p=None)],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:29:00Z", 0.4, 0.5, 0.5, 0.6), obs(T2, "2026-10-12T19:29:00Z", 0.4, 0.5, 0.5, 0.6)]})
    df, rc = load_hitter_frame(root)
    assert rc["snapshot_rows"] == 5 and rc["contracts_projected_pre_start"] == 2 and rc["duplicate_snapshot_rows_removed"] == 2
    assert df.set_index("ticker").p_model.to_dict() == {T1: 0.3, T2: 0.4}
    assert df.cl.nunique() == 1                                          # both rungs share one player-stat-game unit
    rep = evaluate_frame(df, "MLB", raw_snapshot_rows=rc["snapshot_rows"])
    a = rep["accounting"]
    assert (a["raw_snapshot_rows"], a["contracts"], a["independent_player_stat_games"]) == (5, 2, 1)


def test_retroactive_pitcher_rows_are_counted_and_not_scored(tmp_path):
    ev = [dict(marketFamily="pitcher_strikeouts", modelVersion=None), dict(marketFamily="pitcher_strikeouts", modelVersion=None),
          dict(marketFamily="pitcher_strikeouts", modelVersion="v1"), dict(marketFamily="hitter_hits", modelVersion=None)]
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z")],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 0.4, 0.5, 0.5, 0.6)]}, model_evals=ev)
    df, rc = load_hitter_frame(root)
    assert (rc["pitcher_rows_total"], rc["pitcher_rows_retroactive_excluded"], rc["pitcher_rows_with_modelVersion"]) == (3, 2, 1)
    assert set(df.stat) == {"hitter_hits"}


def test_mixed_unit_file_is_inferred_per_capture(tmp_path):
    root = build(tmp_path, [snap(T1, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z"), snap(T2, "2026-10-12T20:00:00Z", "2026-10-12T20:05:00Z")],
                 {"2026-10-12": [obs(T1, "2026-10-12T19:59:00Z", 40, 50, 50, 60, src="old"),
                                 obs(T2, "2026-10-12T19:59:00Z", 0.40, 0.50, 0.50, 0.60, src="new")]})
    df, rc = load_hitter_frame(root)
    assert rc["unit_inference_by_file"]["2026-10-12"]["scale"] == "mixed" and rc["files_mixed"] == ["2026-10-12"]
    assert set(df.yes_ask) == {0.50}
