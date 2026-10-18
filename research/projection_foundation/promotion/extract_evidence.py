#!/usr/bin/env python3
"""Extract the historical-holdout evidence the promotion policy reads, from each sport repo's frozen
research/projection_foundation/results/summary.json (sift.projection_foundation.sport_summary.v1).

usage: extract_evidence.py NFL=path/to/summary.json CFB=... NBA=... MLB=... NHL=... > evidence.json

Nothing is recomputed: values are copied from the frozen summaries so the promotion decision can be audited against
them. `relGain` is the incumbent-relative score improvement: -diff / (challenger_score - diff), i.e. the share of the
incumbent's holdout CRPS the challenger removes (null when there is no incumbent comparison).
"""
import json
import sys


def ci(x):
    return {"diff": x["mean_diff"], "lo": x["ci95"][0], "hi": x["ci95"][1]} if x and x.get("mean_diff") is not None and x.get("ci95") else None


def main(argv):
    out = {"schema": "sift.promotion_evidence.v1", "sports": {}}
    for arg in argv:
        sport, path = arg.split("=", 1)
        d = json.load(open(path))
        fams = {}
        for f in d["families"]:
            h = f.get("holdout") or {}
            vi, vb = ci(h.get("vs_incumbent")), ci(h.get("vs_baseline"))
            score = h.get("crps")
            rel = None
            if vi and score is not None and (score - vi["diff"]) > 0:
                rel = round(-vi["diff"] / (score - vi["diff"]), 4)
            fams[f["family"]] = {
                "readiness": f["readiness"], "reason": f.get("readiness_reason", ""), "model": f.get("best_model"),
                "n": h.get("n_obs"), "mae": h.get("mae"), "bias": h.get("bias"), "crps": score, "cover80": h.get("cover_80"),
                "vsBaseline": vb, "vsIncumbent": vi, "relGain": rel,
            }
        out["sports"][sport] = {"holdout": (d.get("splits") or {}).get("holdout"), "pfCore": d.get("pf_core_version"), "codeSha": d.get("code_sha"), "families": fams}
    json.dump(out, sys.stdout, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
