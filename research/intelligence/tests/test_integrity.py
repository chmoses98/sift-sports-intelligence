import numpy as np
import pandas as pd

from research.intelligence.integrity import (CROSSED, MID_AS_ASK, ONE_SIDED, PLACEHOLDER, STALE, VALID, WIDE, infer_price_scale,
                                             like_for_like, quote_status, sample_accounting, to_dollars)


def test_unit_inferred_per_capture_not_globally():
    df = pd.DataFrame(dict(cap=["a", "a", "b", "b"], yes_bid=[44, 50, 0.44, 0.50], yes_ask=[46, 52, 0.46, 0.52]))
    out = to_dollars(df, ["yes_bid", "yes_ask"], group="cap")
    assert np.allclose(out.yes_bid, [0.44, 0.50, 0.44, 0.50]) and set(out.price_unit_inferred) == {"cents", "dollars"}
    assert infer_price_scale([0.4, 0.99]) == "dollars" and infer_price_scale([40, 99]) == "cents"


def test_quote_status_quarantines_non_prices_without_dropping_rows():
    df = pd.DataFrame(dict(yes_bid=[.44, 0.0, 0.0, .60, .30, .40], yes_ask=[.46, .98, .30, .55, .60, .42]))
    s = quote_status(df, age_minutes=pd.Series([5, 5, 5, 5, 5, 90]))
    assert list(s) == [VALID, PLACEHOLDER, ONE_SIDED, CROSSED, WIDE, STALE]
    assert len(s) == len(df)


def test_ask_equal_to_mid_is_flagged():
    df = pd.DataFrame(dict(yes_bid=[.40], yes_ask=[.46], mid=[.43]))
    assert quote_status(df, reported_exec=pd.Series([.43]))[0] == MID_AS_ASK
    assert quote_status(df, reported_exec=pd.Series([.46]))[0] == VALID


def test_accounting_separates_the_four_counts():
    df = pd.DataFrame(dict(ticker=["t1", "t1", "t2", "t3"], cl=["c1", "c1", "c1", "c2"], game_id=["g", "g", "g", "g2"],
                           obs=[1, 2, 1, 1], quote_status=[VALID, VALID, PLACEHOLDER, VALID], gap=[.2, .2, .3, .01]))
    r = sample_accounting(df, disagreement_col="gap", min_disagreement=.05)
    assert (r["snapshot_rows"], r["contracts"], r["independent_player_stat_games"], r["games"]) == (4, 3, 2, 2)
    assert r["contracts_with_valid_executable_quote"] == 2
    assert r["executable_opportunities_contracts"] == 1 and r["executable_opportunities_independent_units"] == 1


def test_like_for_like():
    df = pd.DataFrame(dict(m=[.1, np.nan, .3], k=[.2, .2, np.nan]))
    assert len(like_for_like(df, "m", "k")) == 1
