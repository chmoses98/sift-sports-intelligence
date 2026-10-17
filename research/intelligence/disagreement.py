"""Statistics and the disagreement-diagnosis rules.

Statuses (docs/PROJECTION_INTELLIGENCE.md):
  MODEL_ERROR      the model is systematically biased in a segment the market is not
  VALIDATED_SIGNAL a segment's model-market disagreement paid at the executable ask, after fees,
                   in discovery, in chronological validation AND in an untouched holdout
  UNRESOLVED       anything else (no bet recommendation)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

MODEL_ERROR = "MODEL_ERROR"
VALIDATED_SIGNAL = "VALIDATED_SIGNAL"
UNRESOLVED = "UNRESOLVED"


def kalshi_fee(p):
    """Kalshi taker fee per contract: ceil(0.07 * p * (1 - p)) to the cent."""
    p = np.asarray(p, dtype=float)
    return np.ceil(0.07 * p * (1 - p) * 100 - 1e-9) / 100


def executable_ev(df: pd.DataFrame, p_model="pm", y="y", yes_ask="yes_ask", no_ask="no_ask", mid="mid"):
    """Net P&L per contract buying the side the model favours over the market midpoint, at the ask, after fee.

    Returns (ev, side) where side is 'yes'/'no'. NaN where that side has no ask.
    """
    yes = (df[p_model] > df[mid]).to_numpy()
    ask = np.where(yes, df[yes_ask], df[no_ask]).astype(float)
    won = np.where(yes, df[y], 1 - df[y]).astype(float)
    ev = won - ask - kalshi_fee(ask)
    ev = np.where(np.isfinite(ask), ev, np.nan)
    return ev, np.where(yes, "yes", "no")


def cluster_mean(x: np.ndarray, clusters: np.ndarray):
    """Mean with a cluster-robust standard error (ladder rungs of one player-game share a cluster)."""
    m = ~np.isnan(x)
    x, c = x[m], clusters[m]
    n = len(x)
    if n == 0:
        return dict(mean=float("nan"), se=float("nan"), n=0, clusters=0)
    mu = x.mean()
    codes, uniq = pd.factorize(c)
    sums = np.bincount(codes, weights=x - mu)
    g = len(uniq)
    se = math.sqrt((sums**2).sum() * (g / max(g - 1, 1))) / n if g > 1 else float("nan")
    return dict(mean=float(mu), se=float(se), n=int(n), clusters=int(g))


def z(stat):
    return stat["mean"] / stat["se"] if stat["se"] and stat["se"] > 0 else float("nan")


def logit(p, eps=1e-4):
    p = np.clip(np.asarray(p, float), eps, 1 - eps)
    return np.log(p / (1 - p))


def logistic_fit(X, y, clusters=None, iters=50):
    """IRLS logistic regression with optional cluster-robust covariance. X includes the intercept column."""
    X = np.asarray(X, float)
    y = np.asarray(y, float)
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        eta = X @ b
        p = 1 / (1 + np.exp(-eta))
        w = np.clip(p * (1 - p), 1e-9, None)
        H = X.T @ (X * w[:, None]) + 1e-8 * np.eye(X.shape[1])
        step = np.linalg.solve(H, X.T @ (y - p))
        b = b + step
        if np.abs(step).max() < 1e-9:
            break
    p = 1 / (1 + np.exp(-(X @ b)))
    w = np.clip(p * (1 - p), 1e-9, None)
    Hinv = np.linalg.inv(X.T @ (X * w[:, None]) + 1e-8 * np.eye(X.shape[1]))
    if clusters is None:
        se = np.sqrt(np.diag(Hinv))
    else:
        codes, uniq = pd.factorize(clusters)
        S = np.zeros((len(uniq), X.shape[1]))
        np.add.at(S, codes, X * (y - p)[:, None])
        meat = S.T @ S * (len(uniq) / max(len(uniq) - 1, 1))
        se = np.sqrt(np.diag(Hinv @ meat @ Hinv))
    return b, se


def encompassing(df, p_model="pm", mid="mid", y="y", cluster="cl"):
    """logit P(y) = a + b1 logit(model) + b2 logit(market). b1 ~ 0 means the market encompasses the model."""
    X = np.column_stack([np.ones(len(df)), logit(df[p_model]), logit(df[mid])])
    b, se = logistic_fit(X, df[y].to_numpy(), df[cluster].to_numpy())
    return dict(a=b[0], b_model=b[1], b_market=b[2], se_a=se[0], se_model=se[1], se_market=se[2], n=len(df))


def paired_brier(df, p_model="pm", mid="mid", y="y", cluster="cl"):
    d = ((df[p_model] - df[y]) ** 2 - (df[mid] - df[y]) ** 2).to_numpy()
    s = cluster_mean(d, df[cluster].to_numpy())
    return dict(model=float(((df[p_model] - df[y]) ** 2).mean()), market=float(((df[mid] - df[y]) ** 2).mean()),
                diff=s["mean"], se=s["se"], clusters=s["clusters"], n=s["n"])


@dataclass
class Rules:
    min_clusters_per_split: int = 100
    bias_z: float = 3.0
    market_bias_z_max: float = 2.0
    signal_z: float = 1.645  # one-sided 5% in validation and holdout
    max_width: float = 0.10


@dataclass
class SegmentVerdict:
    segment: str
    status: str
    reasons: list = field(default_factory=list)
    splits: dict = field(default_factory=dict)


def _split_stats(g: pd.DataFrame):
    out = {}
    ev, _ = executable_ev(g)
    cl = g["cl"].to_numpy()
    mb = cluster_mean((g["y"] - g["pm"]).to_numpy(), cl)  # >0: model under-predicts
    kb = cluster_mean((g["y"] - g["mid"]).to_numpy(), cl)
    e = cluster_mean(ev, cl)
    out.update(model_bias=mb, market_bias=kb, ev=e)
    return out


def diagnose_segment(name: str, g: pd.DataFrame, splits: dict[str, list], rules: Rules = Rules()) -> SegmentVerdict:
    """g needs columns: pm, mid, y, yes_ask, no_ask, cl, split-key column 'period'.
    splits maps 'discovery'/'validation'/'holdout' to the period values in each."""
    v = SegmentVerdict(name, UNRESOLVED)
    st = {}
    for k, periods in splits.items():
        sub = g[g["period"].isin(periods)]
        st[k] = _split_stats(sub) if len(sub) else None
    v.splits = st
    thin = [k for k, s in st.items() if s is None or s["ev"]["clusters"] < rules.min_clusters_per_split]
    if thin:
        v.reasons.append(f"too few independent clusters in {','.join(thin)} (< {rules.min_clusters_per_split})")
        return v
    # MODEL_ERROR: same-signed model bias, large in discovery, confirmed in every later split, market not similarly off
    mbz = {k: z(s["model_bias"]) for k, s in st.items()}
    kbz = {k: z(s["market_bias"]) for k, s in st.items()}
    signs = {math.copysign(1, s["model_bias"]["mean"]) for s in st.values()}
    if (abs(mbz["discovery"]) >= rules.bias_z and len(signs) == 1
            and all(abs(mbz[k]) >= 2 for k in ("validation", "holdout"))
            and all(abs(kbz[k]) < rules.market_bias_z_max for k in st)):
        d = "under" if list(signs)[0] > 0 else "over"
        v.status = MODEL_ERROR
        v.reasons.append(f"model {d}-predicts in every split (z disc/val/hold = {mbz['discovery']:.1f}/{mbz['validation']:.1f}/{mbz['holdout']:.1f}) while the market does not")
        return v
    evz = {k: z(s["ev"]) for k, s in st.items()}
    pos = all(s["ev"]["mean"] > 0 for s in st.values())
    if pos and evz["validation"] >= rules.signal_z and evz["holdout"] >= rules.signal_z:
        v.status = VALIDATED_SIGNAL
        v.reasons.append(f"net EV positive in all splits; z validation/holdout = {evz['validation']:.1f}/{evz['holdout']:.1f}")
        return v
    v.reasons.append("net EV at the executable ask is not significantly positive in both validation and the untouched holdout")
    return v


def row_status(df: pd.DataFrame, seg_status: pd.Series, rules: Rules = Rules()) -> pd.Series:
    """Per-disagreement status. Data defects never earn VALIDATED_SIGNAL."""
    s = seg_status.copy()
    defect = (df["width"] > rules.max_width) | df["bad_identity"] | df["stale"]
    s[defect & (s == VALIDATED_SIGNAL)] = UNRESOLVED
    return s
