from research.intelligence.contract import NONE_VALIDATED, build_contract


def _res(status):
    return {"diagnosis": {"receptions|all": {"status": status, "reasons": ["why"], "splits": {}}},
            "by_stat": {"receptions": {"paired_brier": {"diff": .02, "se": .003, "clusters": 700}, "bias": {"mean": .15}}},
            "status_counts": {status: 1}, "splits": {"discovery": [1]}, "accounting": {"contracts": 1}}


def test_no_validated_means_the_informative_empty_state():
    c = build_contract(_res("UNRESOLVED"))
    assert c["no_validated_opportunities"] and c["message"] == NONE_VALIDATED and c["authority"] == "RESEARCH_ONLY"
    assert "projection_accuracy" in c and "betting_signals" in c       # two separate scorecards


def test_validated_segments_are_listed_and_model_errors_are_not_validated():
    c = build_contract(_res("VALIDATED_SIGNAL"))
    assert c["betting_signals"]["validated_segments"] == ["receptions|all"] and not c["no_validated_opportunities"]
    c = build_contract(_res("MODEL_ERROR"))
    assert c["no_validated_opportunities"] and c["betting_signals"]["model_error_segments"] == ["receptions|all"]
