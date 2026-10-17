"""`sift.disagreement_status.v1`: the only artifact SIFT reads from the intelligence engine.

Two scorecards that must never be merged:
  projection_accuracy   how right the independent projections are (a property of the model)
  betting_signals       whether a model-market disagreement paid at an executable price (a property of the model AND the market)
"""
from __future__ import annotations

from datetime import datetime, timezone

SCHEMA = "sift.disagreement_status.v1"
# How SIFT must word the state; the UI renders `message` verbatim and never infers validation from anything else.
NONE_VALIDATED = ("No validated opportunities. Projection gaps against the market are research context only: in out-of-sample "
                  "tests so far, trading the gap has not paid at the executable price after fees.")


def build_contract(res: dict, sport: str = "NFL", source: dict | None = None, now: datetime | None = None) -> dict:
    diag = res.get("diagnosis", {})
    validated = sorted(k for k, v in diag.items() if v["status"] == "VALIDATED_SIGNAL")
    model_error = sorted(k for k, v in diag.items() if v["status"] == "MODEL_ERROR")
    seg = {}
    for k, v in diag.items():
        stat, side = k.split("|", 1)
        seg[k] = {"stat": stat, "side": side, "status": v["status"], "reason": v["reasons"][0] if v["reasons"] else ""}
    by_stat = res.get("by_stat", {})
    acc = {
        stat: {"brier_model_minus_market": round(x["paired_brier"]["diff"], 5), "brier_se": round(x["paired_brier"]["se"], 5),
               "mean_outcome_minus_model_prob": round(x["bias"]["mean"], 4), "independent_units": x["paired_brier"]["clusters"]}
        for stat, x in by_stat.items()
    }
    return {
        "schema": SCHEMA, "sport": sport, "generated_at": (now or datetime.now(timezone.utc)).isoformat(),
        "authority": "RESEARCH_ONLY",
        "source": source or {},
        "chronology": res.get("splits"),
        "sample_accounting": res.get("accounting"),
        "projection_accuracy": {"by_stat": acc, "overall_brier_model_minus_market": res.get("overall", {}).get("paired_brier")},
        "betting_signals": {"validated_segments": validated, "model_error_segments": model_error,
                            "n_segments": len(diag), "status_counts": res.get("status_counts", {}), "segments": seg},
        "no_validated_opportunities": len(validated) == 0,
        "message": NONE_VALIDATED if not validated else
        f"{len(validated)} segment(s) passed out-of-sample validation at executable prices. Research authority only.",
    }
