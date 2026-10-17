import numpy as np
import pandas as pd

from research.intelligence.disagreement import (MODEL_ERROR, UNRESOLVED, VALIDATED_SIGNAL, Rules, cluster_mean,
                                                diagnose_segment, encompassing, executable_ev, kalshi_fee)

SPLITS = {"discovery": [1, 2], "validation": [3], "holdout": [4]}


def make(n_per_week=600, model_noise=0.0, shift=0.0, market_bias=0.0, seed=0):
    """Truth q; market = q + tiny noise (+bias); model = q + noise + shift. Ladders of 3 rungs share a cluster."""
    rng = np.random.default_rng(seed)
    rows = []
    for w in (1, 2, 3, 4):
        for i in range(n_per_week):
            q = rng.uniform(0.2, 0.7)
            y = float(rng.random() < q)
            for r in range(3):  # correlated rungs: identical outcome, same cluster
                mid = np.clip(q + market_bias + rng.normal(0, 0.01), 0.05, 0.95)
                pm = np.clip(q + shift + rng.normal(0, model_noise), 0.02, 0.98)
                rows.append(dict(period=w, cl=f"{w}-{i}", y=y, mid=mid, pm=pm, yes_ask=mid + 0.015, no_ask=1 - mid + 0.015))
    return pd.DataFrame(rows)


def test_fee_rounds_up_to_cent():
    assert kalshi_fee(0.5) == 0.02  # 0.0175 -> 0.02
    assert kalshi_fee(0.99) == 0.01


def test_cluster_se_larger_than_naive_for_ladders():
    x = np.repeat(np.random.default_rng(1).normal(size=200), 3)
    c = np.repeat(np.arange(200), 3)
    s = cluster_mean(x, c)
    assert s["clusters"] == 200 and s["n"] == 600
    assert s["se"] > x.std() / np.sqrt(600) * 1.4  # perfectly correlated rungs: SE ~ sqrt(3) larger


def test_ev_buys_model_favoured_side_at_ask():
    df = pd.DataFrame(dict(pm=[0.6, 0.3], mid=[0.5, 0.5], y=[1.0, 0.0], yes_ask=[0.52, 0.52], no_ask=[0.52, 0.52]))
    ev, side = executable_ev(df)
    assert list(side) == ["yes", "no"]
    assert np.allclose(ev, [1 - 0.52 - 0.02, 1 - 0.52 - 0.02])


def test_noise_model_is_not_a_signal():
    v = diagnose_segment("noise", make(model_noise=0.08), SPLITS)
    assert v.status == UNRESOLVED


def test_systematic_bias_is_model_error():
    v = diagnose_segment("bias", make(model_noise=0.02, shift=-0.08), SPLITS)
    assert v.status == MODEL_ERROR


def test_market_wrong_in_known_way_is_validated_signal():
    # the market is biased 8 points high; the model is right -> buying NO beats the spread in every split
    g = make(n_per_week=2500, model_noise=0.01, market_bias=0.08)
    g = g[g.pm < g.mid]
    v = diagnose_segment("signal", g, SPLITS)
    assert v.status == VALIDATED_SIGNAL, v.reasons


def test_thin_segment_never_resolves():
    v = diagnose_segment("thin", make(n_per_week=20, model_noise=0.01, market_bias=0.06), SPLITS, Rules())
    assert v.status == UNRESOLVED and "too few" in v.reasons[0]


def test_encompassing_recovers_market_dominance():
    g = make(model_noise=0.15, n_per_week=1500)
    e = encompassing(g)
    assert e["b_market"] > 0.8 and abs(e["b_model"]) < 0.3
