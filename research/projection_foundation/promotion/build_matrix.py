#!/usr/bin/env python3
"""Render the promotion matrix (docs/PROJECTION_PROMOTION.md) from the two records it is built from:
src/lib/projectionApprovals.ts (the decision per sport and stat) and evidence.json (the frozen holdout results).
usage: build_matrix.py > matrix.md
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import monitor  # noqa: E402

LIVE = {
    "PROMOTED": "Ready", "APPROVED_PENDING_LIVE_INPUTS": "Pending", "RETAINED": "n/a (incumbent kept)", "HELD": "n/a (not promoted)",
}
ENGINE = {"PROMOTED": "Projection Foundation", "APPROVED_PENDING_LIVE_INPUTS": "Established model (until live inputs verified)",
          "RETAINED": "Established model", "HELD": "Established model"}
STATUS = {"PROMOTED": "**Promoted**", "APPROVED_PENDING_LIVE_INPUTS": "Approved, activation pending", "RETAINED": "Retained", "HELD": "Held"}


def improvement(e):
    if not e:
        return "—"
    vi, vb = e.get("vsIncumbent"), e.get("vsBaseline")
    if vi:
        rel = e.get("relGain")
        return f"{rel * 100:+.1f}% vs incumbent [{vi['lo']:.3g}, {vi['hi']:.3g}]" if rel is not None else f"{vi['diff']:.3g} vs incumbent"
    if vb:
        return f"beats baseline [{vb['lo']:.3g}, {vb['hi']:.3g}] (no incumbent)"
    return "no holdout"


def main():
    ev = json.load(open(os.path.join(HERE, "evidence.json")))["sports"]
    dec = monitor.decisions()
    live_notes = {}
    src = open(monitor.APPROVALS_TS, encoding="utf-8").read()
    print("| Sport | Statistic | Selected engine | Historical improvement (holdout) | Live-data status | Promotion status |")
    print("|---|---|---|---|---|---|")
    for sport in ["NFL", "CFB", "NBA", "MLB", "NHL"]:
        order = list(ev[sport]["families"])
        for fam in sorted(dec.get(sport, {}), key=lambda f: (dec[sport][f] != "PROMOTED", dec[sport][f] != "APPROVED_PENDING_LIVE_INPUTS", order.index(f) if f in order else 99)):
            d = dec[sport][fam]
            print(f"| {sport} | {fam.replace('_', ' ')} | {ENGINE[d]} | {improvement(ev[sport]['families'].get(fam))} | {LIVE[d]} | {STATUS[d]} |")


if __name__ == "__main__":
    main()
