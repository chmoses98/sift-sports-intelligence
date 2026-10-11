#!/usr/bin/env python3
"""Synthetic toy upstream model used ONLY by the gate's unit tests. Not a sports model; no real data.

Variants:
  honest            receives the market path (as a production pipeline would) but never opens it
  leaky             blends its mean toward a market line when the market file is readable
  deaf              claims to be a market-reading control but never reads the file (a powerless control)
  nondeterministic  ignores --seed (unseeded noise)
  wallclock         honest, but stamps an x_generated_at wall-clock field into every row
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import time
from pathlib import Path


def ladder(mean: float, sd: float, strikes: list[float]) -> list[dict]:
    out = []
    for t in strikes:
        z = (t - 0.5 - mean) / sd
        out.append({"at_least": t, "probability": round(0.5 * math.erfc(z / math.sqrt(2)), 6)})
    return out


def read_market(path: str | None) -> dict:
    if not path or not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        if path.endswith(".csv"):
            rows = [line.strip().split(",") for line in fh if line.strip()]
            head = rows[0]
            return {r[head.index("player_id")]: float(r[head.index("line")]) for r in rows[1:]}
        data = json.load(fh)
    return {k: float(v["line"]) for k, v in data.get("lines", {}).items()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True,
                    choices=["honest", "leaky", "deaf", "nondeterministic", "wallclock"])
    ap.add_argument("--sports", required=True)
    ap.add_argument("--markets", help="market input path (placeholder mode)")
    ap.add_argument("--fixed-market-path", help="market path the pipeline reads itself (in_place mode)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--weight", type=float, default=0.3)
    ns = ap.parse_args()

    sports = json.loads(Path(ns.sports).read_text(encoding="utf-8"))
    rng = random.Random(time.time_ns() if ns.variant == "nondeterministic" else ns.seed)
    market_path = ns.markets or ns.fixed_market_path
    market = read_market(market_path) if ns.variant == "leaky" else {}

    rows = []
    for p in sports["players"]:
        recent = p["recent"]
        mean = sum(recent) / len(recent) + rng.gauss(0.0, 0.25)
        if p["player_id"] in market:
            mean = (1 - ns.weight) * mean + ns.weight * market[p["player_id"]]
        sd = max(5.0, (sum((x - mean) ** 2 for x in recent) / len(recent)) ** 0.5)
        row = {
            "schema_version": "pure_forecast.v1",
            "sport": "TOY", "game_id": p["game_id"], "player_id": p["player_id"],
            "statistic": "toy_yards",
            "as_of": sports["as_of"], "kickoff": p["kickoff"],
            "source_max_observed_at": sports["source_max_observed_at"],
            "projection_mode": "PURE_INDEPENDENT",
            "model_version": "TOY_PURE_0", "model_frozen_hash": "sha256:" + "0" * 64,
            "conditional_on_playing": True, "participation_probability": 0.95,
            "projection": {"mean": round(mean, 6), "median": round(mean, 6),
                           "p10": round(mean - 1.2816 * sd, 6), "p90": round(mean + 1.2816 * sd, 6),
                           "thresholds": ladder(mean, sd, [25.0, 50.0, 75.0])},
            "sources": [{"source_id": "toy_box_scores", "class": "sports_only",
                         "max_observed_at": sports["source_max_observed_at"]}],
            "feature_lineage": [{"name": "recent_mean", "value": round(sum(recent) / len(recent), 6),
                                 "source": "toy_box_scores", "observed_at": sports["source_max_observed_at"],
                                 "class": "sports_only"}],
        }
        if ns.variant == "wallclock":
            row["x_generated_at"] = repr(time.time_ns())
        rows.append(row)
    out = Path(ns.out)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "pure_forecasts.jsonl", "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
