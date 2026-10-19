#!/usr/bin/env python3
"""Absolute accuracy, calibration and uncertainty evidence for the promoted families that have no incumbent comparison.

Beating a simple baseline is necessary but not sufficient evidence for publication. This script copies the per-period numbers
from each repo's frozen study outputs and applies SIFT's publication standard (below), producing
`absolute_evidence.json` (read by tests/projectionApprovals.test.ts, which recomputes the verdict in TypeScript and requires it
to agree) and the tables of docs/PROJECTION_ABSOLUTE_ACCURACY.md.

usage: absolute_accuracy.py --nfl-summary S --nfl-walkforward W --cfb-summary C [--markdown]

THE STANDARD (declared before the numbers were computed; the same code produces the verdict for every family)
  Independent periods are the holdout(s) and any later period (2026-to-date). A period with fewer than MIN_CLUSTERS games is
  reported but cannot decide a verdict (too small to confirm or refute). The validation split chose the model, so it is shown
  but never decides.
  FAIL (NOT_MET) if, on any deciding period:
    R1 calibration   an 80/50/90% range covers less than nominal by more than 3 standard errors (binomial, in games), or more
                     than 5 points above nominal, or the PIT variance ratio is outside 1 +/- max(0.10, 2*sqrt(2/games));
    R2 bias          |mean error| > 0.15 x RMSE (a scale-free bound; RMSE stands in for the outcome's standard deviation);
    R3 information   on the first holdout, CRPS improvement over the baseline is under 1% or its 95% interval reaches 0;
    R4 stability     on any later deciding period, the CRPS improvement is not positive with a 95% interval below 0.
  CAVEATS (MET_WITH_CAVEATS) if no FAIL but: low information (squared-error improvement over the baseline under 5% on the first
  holdout); ranges slightly wide (80% coverage above 0.83 in a deciding period); a period too small to decide did not confirm
  the improvement; or bias above 0.10 x RMSE.
"""
import argparse
import json
import math
import sys

MIN_CLUSTERS = 300
RULES = {
    "minClusters": MIN_CLUSTERS, "underCoverageSE": 3, "overCoverage": 0.05, "pitBand": 0.10, "biasOverRmse": 0.15,
    "materialCrpsGain": 0.01, "lowInfoMseSkill": 0.05, "wideRange80": 0.83, "biasCaveatOverRmse": 0.10,
}


def period(name, m, base, vs, independent, corr=None):
    return {
        "name": name, "independent": independent, "n": m["n_obs"], "clusters": m["n_clusters"], "mae": m["mae"], "rmse": m["rmse"],
        "bias": m["bias"], "cover50": m["cover_50"], "cover80": m["cover_80"], "cover90": m["cover_90"], "pitVar": m["pit_var_ratio"],
        "crps": m["crps"], "baselineCrps": base["crps"], "baselineRmse": base["rmse"], "corr": corr,
        "vsBaseline": {"diff": vs["mean_diff"], "lo": vs["ci95"][0], "hi": vs["ci95"][1]} if vs else None,
    }


def verdict(periods):
    """The publication standard. Mirrors absoluteVerdict() in src/lib/projectionPolicy.ts."""
    fails, caveats = [], []
    deciding = [p for p in periods if p["independent"] and p["clusters"] >= MIN_CLUSTERS]
    small = [p for p in periods if p["independent"] and p["clusters"] < MIN_CLUSTERS]
    for p in deciding:
        n = p["clusters"]
        for nominal, key in ((0.5, "cover50"), (0.8, "cover80"), (0.9, "cover90")):
            se = math.sqrt(nominal * (1 - nominal) / n)
            d = p[key] - nominal
            if d < -RULES["underCoverageSE"] * se:
                fails.append(f"{p['name']}: the {int(nominal * 100)}% range covers {p[key]:.3f}, more than {RULES['underCoverageSE']} standard errors under nominal")
            elif d > RULES["overCoverage"]:
                fails.append(f"{p['name']}: the {int(nominal * 100)}% range covers {p[key]:.3f}, more than 5 points over nominal")
        tol = max(RULES["pitBand"], 2 * math.sqrt(2 / n))
        if abs(p["pitVar"] - 1) > tol:
            fails.append(f"{p['name']}: PIT variance ratio {p['pitVar']:.3f} is outside 1 ± {tol:.3f}")
        if abs(p["bias"]) > RULES["biasOverRmse"] * p["rmse"]:
            fails.append(f"{p['name']}: bias {p['bias']:+.3g} exceeds 0.15 × RMSE")
        elif abs(p["bias"]) > RULES["biasCaveatOverRmse"] * p["rmse"]:
            caveats.append(f"{p['name']}: bias {p['bias']:+.3g} is {abs(p['bias']) / p['rmse']:.2f} × RMSE")
        if p["cover80"] > RULES["wideRange80"]:
            caveats.append(f"{p['name']}: 80% range covers {p['cover80']:.3f} (ranges slightly wide, i.e. conservative)")
    if not deciding:
        fails.append("no independent period large enough to decide")
    else:
        first = deciding[0]
        gain = 1 - first["crps"] / first["baselineCrps"]
        vb = first["vsBaseline"]
        if gain < RULES["materialCrpsGain"] or not vb or not vb["hi"] < 0:
            fails.append(f"{first['name']}: CRPS improvement over the baseline is {gain * 100:.2f}% (needs ≥ 1% with the interval below 0)")
        mse_skill = 1 - (first["rmse"] / first["baselineRmse"]) ** 2
        if mse_skill < RULES["lowInfoMseSkill"]:
            caveats.append(f"{first['name']}: low information: squared error is only {mse_skill * 100:.1f}% below the baseline's")
        for p in deciding[1:]:
            v = p["vsBaseline"]
            if not v or not v["hi"] < 0 or p["crps"] >= p["baselineCrps"]:
                fails.append(f"{p['name']}: the improvement over the baseline is not confirmed (interval does not sit below 0)")
    for p in small:
        v = p["vsBaseline"]
        if p["crps"] >= p["baselineCrps"] or (v and not v["hi"] < 0):
            caveats.append(f"{p['name']} ({p['clusters']} games, too few to decide): did not confirm the improvement over the baseline")
    status = "NOT_MET" if fails else "MET_WITH_CAVEATS" if caveats else "MET"
    return {"status": status, "failures": fails, "caveats": caveats}


def nfl(summary, walk, fam, mean_key="mean_actual"):
    s = [x for x in summary["families"] if x["family"] == fam][0]
    best = s["best_model"]
    h = walk["holdout"][fam]
    models = {(m["model"], m["split"]): m for m in s["models"]}
    base_val = models[("A_season_avg_shrunk", "validation")]
    val = models[(best, "validation")]
    out = [period("validation (chose the model)", val, base_val, val.get("vs_baseline"), False)]
    ho, c26 = h["holdout"], h["check2026"]
    out.append(period("holdout 2024-25", {**ho, "n_clusters": ho["n_clusters"]}, ho["baseline_A"], ho["vs_baseline"], True, ho["corr"]))
    out.append(period("2026 weeks 1-4", {**c26, "n_clusters": c26["n_clusters"]}, c26["baseline_A"], c26["vs_baseline"], True, c26["corr"]))
    return {"sport": "NFL", "family": fam, "model": best, "meanOutcome": ho[mean_key], "meanOutcomeSource": "holdout 2024-25 (recorded by the study)", "periods": out}


def cfb(summary, fam):
    s = [x for x in summary["families"] if x["family"] == fam][0]
    best = s["best_model"]
    out = []
    for split, label, indep in (("validation", "validation (chose the model)", False), ("holdout", "holdout 2023-24", True),
                                ("holdout_2025", "holdout 2025", True), ("live_2026", "2026 to date (ESPN source)", True)):
        ms = {m["model"]: m for m in s["models"] if m["split"] == split}
        F = ms[best]
        A = ms.get("A_season_avg")
        vs = F.get("vs_baseline") or (s["holdout"] if split == "holdout" else s["holdout"].get(split, {})).get("vs_baseline")
        out.append(period(label, F, A, vs, indep))
    return {"sport": "CFB", "family": fam, "model": best, "meanOutcome": None, "meanOutcomeSource": "not recorded by the study; bias is judged in units of the RMSE", "periods": out}


def markdown(rows):
    L = ["| Sport | Statistic | Period | Games | MAE | RMSE | Bias (÷RMSE) | 50% / 80% / 90% covered | PIT var | CRPS vs baseline | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        for i, p in enumerate(r["periods"]):
            gain = (1 - p["crps"] / p["baselineCrps"]) * 100
            v = r["verdict"]["status"].replace("_", " ").lower() if i == 0 else ""
            L.append(f"| {r['sport'] if i == 0 else ''} | {r['family'].replace('_', ' ') if i == 0 else ''} | {p['name']} | {p['clusters']:,} | {p['mae']:.3g} | {p['rmse']:.3g} | {p['bias']:+.3g} ({p['bias'] / p['rmse']:+.2f}) | "
                     f"{p['cover50']:.3f} / {p['cover80']:.3f} / {p['cover90']:.3f} | {p['pitVar']:.3f} | {gain:+.1f}% | {v} |")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nfl-summary", required=True)
    ap.add_argument("--nfl-walkforward", required=True)
    ap.add_argument("--cfb-summary", required=True)
    ap.add_argument("--markdown", action="store_true")
    a = ap.parse_args()
    ns, nw, cs = json.load(open(a.nfl_summary)), json.load(open(a.nfl_walkforward)), json.load(open(a.cfb_summary))
    rows = [nfl(ns, nw, f) for f in ("team_pass_attempts", "team_rush_attempts")]
    rows += [cfb(cs, f) for f in ("team_points", "plays", "team_passing_yards", "team_rushing_yards", "points_per_play", "success_rate")]
    for r in rows:
        r["verdict"] = verdict(r["periods"])
    if a.markdown:
        print(markdown(rows))
        return
    json.dump({"schema": "sift.absolute_evidence.v1", "rules": RULES, "families": {f"{r['sport']}:{r['family']}": r for r in rows}}, sys.stdout, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
