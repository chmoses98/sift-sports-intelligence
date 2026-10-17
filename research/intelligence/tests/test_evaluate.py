import numpy as np
import pandas as pd

from research.intelligence.evaluate import chronological_splits, evaluate_frame


def frame(n_units, p_noise=0.1, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n_units):
        q = rng.uniform(.2, .7); y = float(rng.random() < q)
        for k in range(3):
            mid = np.clip(q + rng.normal(0, .01), .05, .95)
            rows.append(dict(ticker=f"t{i}-{k}", cl=f"c{i}", game_id=f"g{i // 5}", stat="s", threshold=k, period=f"2026-10-{1 + i % 28:02d}",
                             observed_at=pd.Timestamp("2026-10-01T10:00Z"), start_utc=pd.Timestamp("2026-10-01T12:00Z"),
                             yes_bid=mid - .02, yes_ask=mid + .02, no_ask=1 - mid + .02, p_model=np.clip(q + rng.normal(0, p_noise), .02, .98), y=y))
    return pd.DataFrame(rows)


def test_thin_data_is_insufficient_evidence_not_a_verdict():
    r = evaluate_frame(frame(50), "X")
    assert r["status"] == "INSUFFICIENT_EVIDENCE" and "diagnosis" not in r


def test_enough_data_yields_scorecards_and_no_manufactured_signal():
    r = evaluate_frame(frame(1500), "X")
    assert r["status"] == "EVALUATED" and "VALIDATED_SIGNAL" not in r["status_counts"]
    assert r["accounting"]["independent_player_stat_games"] == 1500 and r["accounting"]["contracts"] == 4500


def test_post_start_observations_are_never_scored():
    d = frame(400); d.loc[:, "observed_at"] = pd.Timestamp("2026-10-01T13:00Z")
    assert evaluate_frame(d, "X")["status"] == "INSUFFICIENT_EVIDENCE"


def test_chronological_splits_are_ordered_and_disjoint():
    s = chronological_splits(range(1, 21))
    assert s["discovery"] == list(range(1, 11)) and s["holdout"][0] > s["validation"][-1]
