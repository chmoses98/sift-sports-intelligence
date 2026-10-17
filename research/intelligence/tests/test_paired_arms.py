import numpy as np
import pandas as pd

from research.intelligence.paired_arms import evaluate, pair


def _arm(p, obs="2026-10-04T16:00:00+00:00"):
    n = len(p)
    return pd.DataFrame(dict(ticker=[f"t{i}" for i in range(n)], game_id="g", player_id=[f"p{i // 2}" for i in range(n)], stat="receptions",
                             family="PLAYER_STAT", threshold=2, week=1, observed_at=obs, kickoff_utc="2026-10-04T17:00:00+00:00",
                             yes_bid_t=.4, yes_ask_t=.44, no_ask_t=.60, mid_t=.42, width_t=.04, model_event_probability=p,
                             settled_yes=[1.0, 0.0] * (n // 2), settlement_kind="binary", model_version="x"))


def test_only_identical_observations_are_compared():
    inc, chal = _arm(np.full(8, .3)), _arm(np.full(8, .4))
    chal.loc[:3, "observed_at"] = "2026-10-04T16:10:00+00:00"          # challenger saw a later quote on half the tickers
    m, acct = pair(inc, chal)
    assert acct["common_tickers"] == 8 and acct["identical_observation"] == 4 and acct["dropped_different_quote"] == 4
    assert len(m) == 4


def test_missing_challenger_is_insufficient_evidence_not_a_reconstruction(tmp_path):
    out = evaluate(str(tmp_path / "a"), str(tmp_path / "b"))
    assert out["status"] == "INSUFFICIENT_EVIDENCE" and out["by_split"] == {}
