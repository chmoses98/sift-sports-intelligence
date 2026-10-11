"""prop_explorer tests: the explorer projection contract, its converter, the market-comparison record, and the
committed examples built from real research outputs.

Rows built in this file (``forecast()``, ``context()``, market records) are synthetic test fixtures, not
forecasts of any real player or game. The examples under examples/prop_explorer/ are real research outputs and
are only read here.
"""
import copy
import io
import json
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import prop_explorer as px  # noqa: E402
import pure_gate as gate  # noqa: E402

EXAMPLES = ROOT / "examples" / "prop_explorer"


def forecast(stat="receiving_yards", mean=60.0, as_of="2026-10-11T15:00:00Z", targets_ewm=6.1, cond=True,
             smo="2026-10-11T14:55:00Z"):
    """Synthetic pure_forecast.v1 row (smo = source_max_observed_at, also the injury report's time)."""
    if stat == "snap_share":
        proj = {"mean": 0.72, "median": 0.74, "p10": 0.55, "p90": 0.86,
                "thresholds": [{"at_least": 0.5, "probability": 0.93}, {"at_least": 0.75, "probability": 0.45}]}
    else:
        proj = {"mean": mean, "median": mean - 2, "p10": mean - 30, "p90": mean + 30,
                "quantiles": [{"q": 0.25, "value": mean - 15}, {"q": 0.75, "value": mean + 14}],
                "thresholds": [{"at_least": 40.5, "probability": 0.70}, {"at_least": 60.5, "probability": 0.48},
                               {"at_least": 80.5, "probability": 0.25}]}
    return {
        "schema_version": "pure_forecast.v1", "sport": "NFL", "game_id": "g1", "player_id": "p1", "statistic": stat,
        "as_of": as_of, "kickoff": "2026-10-11T17:00:00Z", "source_max_observed_at": smo,
        "projection_mode": "PURE_INDEPENDENT", "model_version": "TEST_V1", "model_frozen_hash": "sha256:" + "a" * 64,
        "conditional_on_playing": cond, "participation_probability": 0.95, "projection": proj,
        "sources": [{"source_id": "pbp", "class": "sports_only", "max_observed_at": "2026-10-07T04:00:00Z"},
                    {"source_id": "injuries", "class": "sports_only", "max_observed_at": smo}],
        "feature_lineage": [
            {"name": "targets_ewm", "value": targets_ewm, "source": "pbp", "observed_at": "2026-10-07T04:00:00Z",
             "class": "sports_only"},
            {"name": "opp_yards_allowed_per_target", "value": None, "source": "pbp",
             "observed_at": "2026-10-07T04:00:00Z", "class": "sports_only"},
            {"name": "status", "value": "ACTIVE", "source": "injuries", "observed_at": smo, "class": "sports_only"}],
    }


def evidence(i, kind):
    return {"id": i, "kind": kind, "repo": "example/sport-repo", "commit": "abcdef1", "path": f"docs/{i}.md",
            "url": None}


def context(status="RESEARCH_HISTORICAL_ACCEPTED"):
    return {
        "capture": {"captured_at": "2026-10-11T15:05:00Z", "capture_mode": "prospective_pregame", "builder": "test"},
        "players": {"p1": {"name": "Test Player", "position": "WR", "team_id": "AAA", "team_abbr": "AAA"}},
        "games": {"g1": {"season": "2026", "season_type": "regular", "week": 6, "home_team_id": "AAA",
                         "away_team_id": "BBB", "opponent_team_id": "BBB", "is_home": True}},
        "units": {"receiving_yards": "yards", "snap_share": "share of team offensive snaps"},
        "workload": {"measure": "snap_share", "unit": "share of team offensive snaps", "statistic": "snap_share"},
        "drivers": {"TEST_V1": {
            "targets_ewm": {"label": "Targets, player EWM", "role": "opportunity", "matchup_role": "not_matchup"},
            "opp_yards_allowed_per_target": {"label": "Opponent yards allowed per target", "role": "opponent",
                                             "matchup_role": "opponent_input",
                                             "null_value_reason": "no opponent games before the cutoff"},
            "status": {"label": "Listed status", "role": "participation", "matchup_role": "not_matchup"}}},
        "validation": {"TEST_V1": {
            "status": status, "research_only": True,
            "scope": {"season_type": "regular", "seasons": ["2026"], "statistics": ["receiving_yards", "snap_share"],
                      "population": "synthetic test population"},
            "source_verdict": "ACCEPTED_CHALLENGER (synthetic test)", "compared_against": ["TEST_BASELINE"],
            "evidence": [evidence("prereg", "preregistration"), evidence("results", "results"),
                         evidence("scorecard", "scorecard")],
            "caveats": ["Synthetic test fixture; not validated on any real data."]}},
        "coverage": {"TEST_V1": {"receiving_yards": {"observed": 0.81, "n_rows": 1000, "n_games": 100,
                                                     "scope": "synthetic", "evidence_id": "scorecard"}}},
        "null_reasons": {"validation.evidence[*].url": "pinned by repo and commit",
                         "uncertainty.holdout_interval_coverage": "not scored for this statistic",
                         "distribution.pmf": "the sidecar carries quantiles and a ladder only",
                         "game_script": "the model publishes no script-conditional projection",
                         "expected_workload": "no workload forecast for this player-game at this cutoff"},
    }


def build(rows=None, ctx=None):
    rows = rows if rows is not None else [forecast("snap_share"), forecast()]
    return px.convert(rows, ctx or context())


def valid_row():
    return copy.deepcopy(build()[1])


def scenarios(means=(70.0, 60.0, 50.0), probs=(0.3, 0.4, 0.3)):
    bands = ((7, None, "lead7+", "Leads by 7 or more"), (-6, 6, "within6", "One-score game"),
             (None, -7, "trail7+", "Trails by 7 or more"))
    return {"conditioning": "team_final_margin", "perspective_team_id": "AAA", "exhaustive": True,
            "source": {"model_version": "TEST_SCRIPT_V1", "model_frozen_hash": "git:abcdef1", "class": "sports_only",
                       "description": "synthetic script model"},
            "scenarios": [{"scenario_id": sid, "label": label, "margin_min": lo, "margin_max": hi, "probability": p,
                           "probability_kind": "simulation_share",
                           "projection": {"mean": m, "median": m - 2, "p10": m - 30, "p90": m + 30}}
                          for (lo, hi, sid, label), m, p in zip(bands, means, probs)]}


def set_null(row, path, reason="test reason"):
    row["null_reasons"][path] = reason


def clear_null(row, path):
    row["null_reasons"].pop(path, None)


class ConverterTests(unittest.TestCase):
    def test_converts_v1_rows_into_valid_projections(self):
        rows = build()
        summary = px.validate_projection_file(rows)
        self.assertEqual(summary["n"], 2)
        r = rows[1]
        self.assertEqual(r["explorer_id"], "NFL|g1|p1|receiving_yards|TEST_V1|cond|2026-10-11T15:00:00Z")
        self.assertEqual(r["forecast"], forecast())  # embedded unchanged
        self.assertEqual([q["q"] for q in r["distribution"]["quantiles"]], [0.1, 0.25, 0.5, 0.75, 0.9])
        self.assertEqual(r["expected_workload"]["lineage"]["kind"], "sibling_forecast")
        self.assertEqual(r["expected_workload"]["mean"], 0.72)
        self.assertEqual(rows[0]["expected_workload"]["lineage"], {"kind": "self"})
        self.assertEqual(r["freshness"]["staleness_seconds"], 300)
        self.assertEqual(r["freshness"]["kickoff_lead_seconds"], 7200)
        self.assertEqual(r["freshness"]["oldest_input_observed_at"], "2026-10-07T04:00:00Z")
        self.assertEqual(r["uncertainty"]["p10_p90_width"], 60.0)
        self.assertIn("drivers[1].value", r["null_reasons"])
        self.assertIsNone(r["change_explanation"])
        self.assertIn("change_explanation", r["null_reasons"])

    def test_deterministic(self):
        self.assertEqual(px.dumps_jsonl(build()), px.dumps_jsonl(build()))

    def test_refuses_v0_rows(self):
        v0 = json.loads((ROOT / "examples" / "kit_interim_v0.example.jsonl").read_text().splitlines()[0])
        with self.assertRaisesRegex(gate.GateError, "pure_forecast.v1"):
            px.convert([v0], context())

    def test_refuses_unexplained_null(self):
        ctx = context()
        del ctx["null_reasons"]["game_script"]
        with self.assertRaisesRegex(gate.GateError, "game_script is null and the context gives no reason"):
            build(ctx=ctx)

    def test_refuses_uncatalogued_driver_and_missing_validation(self):
        ctx = context()
        del ctx["drivers"]["TEST_V1"]["status"]
        with self.assertRaisesRegex(gate.GateError, "no entry for feature 'status'"):
            build(ctx=ctx)
        ctx = context()
        ctx["validation"] = {}
        with self.assertRaisesRegex(gate.GateError, "no block for model_version"):
            build(ctx=ctx)

    def test_change_explanation_between_captures(self):
        early = forecast(as_of="2026-10-11T12:00:00Z", mean=55.0, targets_ewm=5.5, smo="2026-10-11T11:55:00Z")
        late = forecast()
        rows = build([forecast("snap_share"), early, late])
        c = rows[2]["change_explanation"]
        self.assertEqual(c["method"], "driver_value_diff")
        self.assertFalse(c["model_changed"])
        self.assertAlmostEqual(c["delta"]["mean"], 5.0)
        self.assertEqual(c["attributed_drivers"],
                         [{"feature": "targets_ewm", "prior_value": 5.5, "current_value": 6.1}])
        self.assertEqual(c["prior"]["explorer_id"], rows[1]["explorer_id"])
        self.assertEqual(c["prior"]["model_signature"], px.model_signature(early))
        # The early capture has no snap_share sibling at its own cutoff: workload is null with a reason.
        self.assertIsNone(rows[1]["expected_workload"])
        self.assertIn("expected_workload", rows[1]["null_reasons"])
        px.validate_projection_file(rows)

    def test_cli_convert_and_validate(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, ctx, out = Path(tmp) / "f.jsonl", Path(tmp) / "c.json", Path(tmp) / "o.jsonl"
            src.write_text(px.dumps_jsonl([forecast("snap_share"), forecast()]))
            ctx.write_text(json.dumps(context()))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(px.main(["convert", "--forecasts", str(src), "--context", str(ctx),
                                          "--out", str(out)]), 0)
                self.assertEqual(px.main(["validate", "--projections", str(out)]), 0)
            with redirect_stderr(io.StringIO()):
                self.assertEqual(px.main(["convert", "--forecasts", str(src), "--context", str(ctx),
                                          "--out", str(out)]), 2)  # write-once


class V1CompatibilityTests(unittest.TestCase):
    def test_embedded_forecast_must_be_valid_v1(self):
        r = valid_row()
        r["forecast"]["projection"]["thresholds"][1]["probability"] = 0.9  # ladder not monotone
        with self.assertRaisesRegex(gate.GateError, "monotone"):
            px.validate_projection(r)
        r = valid_row()
        del r["forecast"]["schema_version"]  # read as v0, and missing model_features
        with self.assertRaises(gate.GateError):
            px.validate_projection(r)

    def test_identity_and_explorer_id_match_forecast(self):
        r = valid_row()
        r["identity"]["player_id"] = "p2"
        with self.assertRaisesRegex(gate.GateError, "identity.player_id"):
            px.validate_projection(r)
        r = valid_row()
        r["explorer_id"] = "something else"
        with self.assertRaisesRegex(gate.GateError, "explorer_id must be"):
            px.validate_projection(r)

    def test_forecast_ref(self):
        r = valid_row()
        f = r.pop("forecast")
        r["forecast_ref"] = {"uri": "publish/pure/nfl/x.jsonl", "model_signature": px.model_signature(f)}
        with self.assertRaisesRegex(gate.GateError, "could not be resolved"):
            px.validate_projection(r)
        px.validate_projection(r, px.forecast_resolver([f]))
        r["forecast"] = f  # embedded and referenced: must agree
        px.validate_projection(r)
        r["forecast_ref"]["model_signature"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(gate.GateError, "does not match"):
            px.validate_projection(r)
        r = valid_row()
        del r["forecast"]
        with self.assertRaisesRegex(gate.GateError, "embeds `forecast`"):
            px.validate_projection(r)


class MarketSeparationTests(unittest.TestCase):
    def test_market_keys_refused_anywhere(self):
        for path, key in ((("game",), "spread"), ((), "x_kalshi_quote"), (("uncertainty",), "implied_total"),
                          (("player",), "closing_line"), ((), "market_line")):
            r = valid_row()
            target = r
            for p in path:
                target = target[p]
            target[key] = 1.5
            with self.assertRaisesRegex(gate.GateError, "market|unexpected"):
                px.validate_projection(r)

    def test_recommendation_keys_refused(self):
        for key in ("x_edge", "x_recommendation", "x_stake_units", "x_line", "x_kelly_fraction", "x_pick"):
            r = valid_row()
            r[key] = 1
            with self.assertRaisesRegex(gate.GateError, "betting/market key forbidden"):
                px.validate_projection(r)

    def test_market_words_in_labels_refused(self):
        r = valid_row()
        r["drivers"][0]["label"] = "Closing line value"
        with self.assertRaisesRegex(gate.GateError, "market-dependent"):
            px.validate_projection(r)
        r = valid_row()
        r["game_script"] = scenarios()
        clear_null(r, "game_script")
        r["game_script"]["scenarios"][0]["label"] = "Covers the spread"
        with self.assertRaisesRegex(gate.GateError, "market-dependent"):
            px.validate_projection(r)

    def test_market_derived_script_source_refused(self):
        r = valid_row()
        r["game_script"] = scenarios()
        clear_null(r, "game_script")
        r["game_script"]["source"]["class"] = "market_implied"
        with self.assertRaises(gate.GateError):
            px.validate_projection(r)


class OverstatementTests(unittest.TestCase):
    def test_status_enum_closed(self):
        for status in ("VALIDATED", "PROFITABLE", "ACCEPTED", "validated"):
            r = valid_row()
            r["validation"]["status"] = status
            with self.assertRaisesRegex(gate.GateError, "validation.status"):
                px.validate_projection(r)

    def test_overstating_text_refused(self):
        for field, text in (("source_verdict", "Validated edge vs the close"), ("source_verdict", "Profitable"),
                            ("source_verdict", "a +EV model"), ("caveats", ["Proven on 2025"])):
            r = valid_row()
            r["validation"][field] = text
            with self.assertRaisesRegex(gate.GateError, "overstates"):
                px.validate_projection(r)
        r = valid_row()
        r["null_reasons"]["game_script"] = "guaranteed to be added"
        with self.assertRaisesRegex(gate.GateError, "overstates"):
            px.validate_projection(r)

    def test_negated_wording_allowed(self):
        self.assertIsNone(px.overstatement("not validated on prospective data"))
        self.assertIsNone(px.overstatement("Not yet validated"))
        self.assertIsNone(px.overstatement("PROJECTABLE_NOT_YET_VALIDATED"))
        self.assertEqual(px.overstatement("validated"), "validated")
        self.assertEqual(px.overstatement("our edge"), "edge")
        self.assertIsNone(px.overstatement("captured before lineup lock; Brier +eval"))


class DistributionTests(unittest.TestCase):
    def test_quantiles_must_cover_and_agree(self):
        r = valid_row()
        r["distribution"]["quantiles"] = [q for q in r["distribution"]["quantiles"] if q["q"] != 0.25]
        with self.assertRaisesRegex(gate.GateError, "missing q=0.25"):
            px.validate_projection(r)
        r = valid_row()
        r["distribution"]["quantiles"][2]["value"] += 1
        with self.assertRaisesRegex(gate.GateError, "disagrees"):
            px.validate_projection(r)
        r = valid_row()
        r["distribution"]["quantiles"].insert(1, {"q": 0.2, "value": 0.0})
        with self.assertRaisesRegex(gate.GateError, "non-decreasing"):
            px.validate_projection(r)

    def test_pmf_consistency(self):
        f = forecast(mean=2.0)
        f["projection"] = {"mean": 1.0, "median": 1.0, "p10": 0.0, "p90": 2.0,
                           "thresholds": [{"at_least": 1, "probability": 0.75}, {"at_least": 2, "probability": 0.25}]}
        ctx = context()
        rows = build([forecast("snap_share"), f], ctx)
        r = copy.deepcopy(rows[1])
        r["distribution"]["pmf"] = [{"value": 0, "probability": 0.25}, {"value": 1, "probability": 0.5},
                                    {"value": 2, "probability": 0.25}]
        clear_null(r, "distribution.pmf")
        px.validate_projection(r)
        bad = copy.deepcopy(r)
        bad["distribution"]["pmf"][2]["probability"] = 0.3
        with self.assertRaisesRegex(gate.GateError, "sum to 1"):
            px.validate_projection(bad)
        bad = copy.deepcopy(r)
        bad["distribution"]["pmf"] = [{"value": 0, "probability": 0.2}, {"value": 1, "probability": 0.6},
                                      {"value": 2, "probability": 0.2}]
        with self.assertRaisesRegex(gate.GateError, "P\\(X >= 1\\)"):
            px.validate_projection(bad)
        bad = copy.deepcopy(r)
        bad["distribution"]["pmf"] = [{"value": 0, "probability": 0.25}, {"value": 1, "probability": 0.5},
                                      {"value": 3, "probability": 0.25}]
        with self.assertRaisesRegex(gate.GateError, "mean"):
            px.validate_projection(bad)


class WorkloadAndDriverTests(unittest.TestCase):
    def test_workload_self_and_feature(self):
        rows = build()
        r = copy.deepcopy(rows[0])
        r["expected_workload"]["mean"] = 0.5
        with self.assertRaisesRegex(gate.GateError, "self"):
            px.validate_projection(r)
        r = valid_row()
        r["expected_workload"] = {"measure": "targets", "unit": "targets", "mean": 6.1, "median": None,
                                  "p10": None, "p90": None, "lineage": {"kind": "feature", "feature": "targets_ewm"}}
        for k in ("median", "p10", "p90"):
            set_null(r, f"expected_workload.{k}")
        px.validate_projection(r)
        r["expected_workload"]["mean"] = 7.0
        with self.assertRaisesRegex(gate.GateError, "lineage feature"):
            px.validate_projection(r)

    def test_workload_sibling_cross_checked_in_file(self):
        rows = build()
        rows[1]["expected_workload"]["mean"] = 0.9
        with self.assertRaisesRegex(gate.GateError, "disagrees with sibling"):
            px.validate_projection_file(rows)
        rows = build()
        summary = px.validate_projection_file(rows[1:])
        self.assertTrue(any("not in this file" in w for w in summary["warnings"]))

    def test_drivers_carry_lineage(self):
        r = valid_row()
        r["drivers"][0]["feature"] = "air_yards_share"
        with self.assertRaisesRegex(gate.GateError, "not in the forecast's feature_lineage"):
            px.validate_projection(r)
        r = valid_row()
        r["drivers"][0]["value"] = 9.9
        with self.assertRaisesRegex(gate.GateError, "disagrees with feature_lineage"):
            px.validate_projection(r)
        r = valid_row()
        r["drivers"].append(copy.deepcopy(r["drivers"][0]))
        with self.assertRaisesRegex(gate.GateError, "duplicate driver"):
            px.validate_projection(r)
        r = valid_row()
        r["drivers"][0]["matchup_role"] = "matchup_adjusted_somehow"
        with self.assertRaisesRegex(gate.GateError, "matchup_role"):
            px.validate_projection(r)
        r = valid_row()
        r["drivers"] = []
        with self.assertRaisesRegex(gate.GateError, "nonempty list"):
            px.validate_projection(r)


class GameScriptTests(unittest.TestCase):
    def with_script(self, s):
        r = valid_row()
        r["game_script"] = s
        clear_null(r, "game_script")
        return r

    def test_valid_script(self):
        px.validate_projection(self.with_script(scenarios()))  # mixture 0.3*70+0.4*60+0.3*50 = 60 = mean

    def test_probabilities_and_tiling(self):
        with self.assertRaisesRegex(gate.GateError, "sum to 1"):
            px.validate_projection(self.with_script(scenarios(probs=(0.3, 0.3, 0.3))))
        s = scenarios()
        s["scenarios"][1]["margin_min"] = -5
        with self.assertRaisesRegex(gate.GateError, "tile the integers"):
            px.validate_projection(self.with_script(s))
        s = scenarios()
        s["scenarios"][0]["margin_max"] = 40
        with self.assertRaisesRegex(gate.GateError, "open-ended"):
            px.validate_projection(self.with_script(s))
        s = scenarios(probs=(0.5, 0.4, 0.3))
        s["exhaustive"] = False
        with self.assertRaisesRegex(gate.GateError, "above 1"):
            px.validate_projection(self.with_script(s))

    def test_mixture_consistent_with_forecast(self):
        with self.assertRaisesRegex(gate.GateError, "mixture mean"):
            px.validate_projection(self.with_script(scenarios(means=(90.0, 80.0, 70.0))))
        s = scenarios(means=(90.0, 80.0, 70.0))
        s["scenarios"][0]["projection"] = None
        r = self.with_script(s)
        set_null(r, "game_script.scenarios[0].projection")
        px.validate_projection(r)  # not every scenario projected: no mixture check


class FreshnessCaptureGameTests(unittest.TestCase):
    def test_freshness_arithmetic(self):
        for k, v in (("staleness_seconds", 299), ("kickoff_lead_seconds", 7201),
                     ("oldest_input_observed_at", "2026-10-11T14:55:00Z")):
            r = valid_row()
            r["freshness"][k] = v
            with self.assertRaisesRegex(gate.GateError, "freshness"):
                px.validate_projection(r)

    def test_capture_timing(self):
        r = valid_row()
        r["capture"]["captured_at"] = "2026-10-11T17:30:00Z"
        with self.assertRaisesRegex(gate.GateError, "before kickoff"):
            px.validate_projection(r)
        r["capture"]["capture_mode"] = "historical_research_replay"
        px.validate_projection(r)
        r["capture"]["captured_at"] = "2026-10-11T14:00:00Z"
        with self.assertRaisesRegex(gate.GateError, "before the forecast's as_of"):
            px.validate_projection(r)

    def test_game_team_consistency(self):
        r = valid_row()
        r["game"]["is_home"] = False
        with self.assertRaisesRegex(gate.GateError, "is_home"):
            px.validate_projection(r)
        r = valid_row()
        r["player"]["team_id"] = "CCC"
        with self.assertRaisesRegex(gate.GateError, "neither the home nor the away"):
            px.validate_projection(r)
        r = valid_row()
        r["game"]["kickoff"] = "2026-10-11T18:00:00Z"
        with self.assertRaisesRegex(gate.GateError, "kickoff"):
            px.validate_projection(r)


class ValidationStatusTests(unittest.TestCase):
    def test_accepted_needs_prereg_results_verdict_and_scope(self):
        r = valid_row()
        r["validation"]["evidence"] = [e for e in r["validation"]["evidence"] if e["kind"] != "preregistration"]
        r["null_reasons"] = {k: v for k, v in r["null_reasons"].items() if not k.startswith("validation.evidence")}
        for i in range(len(r["validation"]["evidence"])):
            set_null(r, f"validation.evidence[{i}].url")
        with self.assertRaisesRegex(gate.GateError, "preregistration"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["scope"]["statistics"] = ["receptions"]
        with self.assertRaisesRegex(gate.GateError, "does not cover statistic"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["scope"]["season_type"] = "postseason"
        with self.assertRaisesRegex(gate.GateError, "season_type"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["scope"]["seasons"] = ["2025"]
        with self.assertRaisesRegex(gate.GateError, "seasons"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["source_verdict"] = None
        set_null(r, "validation.source_verdict")
        with self.assertRaisesRegex(gate.GateError, "source_verdict"):
            px.validate_projection(r)

    def test_other_statuses(self):
        r = valid_row()
        r["validation"]["status"] = "REJECTED"
        px.validate_projection(r)
        r["validation"]["evidence"] = [e for e in r["validation"]["evidence"] if e["kind"] != "results"]
        r["null_reasons"] = {k: v for k, v in r["null_reasons"].items() if not k.startswith("validation.evidence")}
        for i in range(len(r["validation"]["evidence"])):
            set_null(r, f"validation.evidence[{i}].url")
        with self.assertRaisesRegex(gate.GateError, "'results'"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["status"] = "BLOCKED_DATA"
        r["validation"]["caveats"] = []
        with self.assertRaisesRegex(gate.GateError, "caveat"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["status"] = "SHADOW_PROSPECTIVE"
        with self.assertRaisesRegex(gate.GateError, "shadow_collection"):
            px.validate_projection(r)
        r["validation"]["evidence"].append(evidence("shadow", "shadow_collection"))
        set_null(r, f"validation.evidence[{len(r['validation']['evidence']) - 1}].url")
        px.validate_projection(r)
        r["capture"]["capture_mode"] = "historical_research_replay"
        with self.assertRaisesRegex(gate.GateError, "prospective_pregame"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["status"] = "NOT_VALIDATED"
        px.validate_projection(r)

    def test_evidence_pinned_and_referenced(self):
        r = valid_row()
        r["validation"]["evidence"][0]["commit"] = "main"
        with self.assertRaisesRegex(gate.GateError, "commit"):
            px.validate_projection(r)
        r = valid_row()
        r["uncertainty"]["holdout_interval_coverage"]["evidence_id"] = "nowhere"
        with self.assertRaisesRegex(gate.GateError, "evidence_id"):
            px.validate_projection(r)
        r = valid_row()
        r["validation"]["research_only"] = False
        with self.assertRaisesRegex(gate.GateError, "research_only"):
            px.validate_projection(r)


class ChangeExplanationTests(unittest.TestCase):
    def rows(self):
        early = forecast(as_of="2026-10-11T12:00:00Z", mean=55.0, targets_ewm=5.5, smo="2026-10-11T11:55:00Z")
        return build([forecast("snap_share"), early, forecast()])

    def test_delta_checked_against_prior_row(self):
        rows = self.rows()
        rows[2]["change_explanation"]["delta"]["mean"] = 4.0
        with self.assertRaisesRegex(gate.GateError, "delta.mean"):
            px.validate_projection_file(rows)
        rows = self.rows()
        rows[2]["change_explanation"]["attributed_drivers"][0]["prior_value"] = 5.0
        with self.assertRaisesRegex(gate.GateError, "prior_value"):
            px.validate_projection_file(rows)
        rows = self.rows()
        summary = px.validate_projection_file([rows[0], rows[2]])
        self.assertTrue(any("delta unverified" in w for w in summary["warnings"]))

    def test_row_rules(self):
        r = copy.deepcopy(self.rows()[2])
        r["change_explanation"]["prior"]["as_of"] = "2026-10-11T16:00:00Z"
        with self.assertRaisesRegex(gate.GateError, "before this capture"):
            px.validate_projection(r)
        r = copy.deepcopy(self.rows()[2])
        r["change_explanation"]["unattributed"] = 0.0
        with self.assertRaisesRegex(gate.GateError, "no attribution"):
            px.validate_projection(r)
        r = copy.deepcopy(self.rows()[2])
        a = r["change_explanation"]["attributed_drivers"][0]
        a["prior_value"] = a["current_value"]
        with self.assertRaisesRegex(gate.GateError, "must have changed"):
            px.validate_projection(r)
        r = copy.deepcopy(self.rows()[2])
        c = r["change_explanation"]
        c["method"] = "producer_attribution"
        c["attributed_drivers"][0]["contribution"] = 3.0
        c["unattributed"] = 2.0
        px.validate_projection(r)
        c["unattributed"] = 1.0
        with self.assertRaisesRegex(gate.GateError, "equal delta.mean"):
            px.validate_projection(r)


class NullReasonTests(unittest.TestCase):
    def test_every_null_needs_a_reason_and_every_reason_a_null(self):
        r = valid_row()
        clear_null(r, "game_script")
        with self.assertRaisesRegex(gate.GateError, "game_script is null without a reason"):
            px.validate_projection(r)
        r = valid_row()
        set_null(r, "player.name")
        with self.assertRaisesRegex(gate.GateError, "not null"):
            px.validate_projection(r)
        r = valid_row()
        r["player"]["name"] = None
        with self.assertRaisesRegex(gate.GateError, "player.name is null without a reason"):
            px.validate_projection(r)

    def test_missing_field_is_not_a_null(self):
        r = valid_row()
        del r["game_script"]
        with self.assertRaisesRegex(gate.GateError, "missing"):
            px.validate_projection(r)
        r = valid_row()
        del r["player"]["position"]
        with self.assertRaisesRegex(gate.GateError, "missing"):
            px.validate_projection(r)
        r = valid_row()
        r["unexpected"] = 1
        with self.assertRaisesRegex(gate.GateError, "unexpected fields"):
            px.validate_projection(r)


def market(**over):
    m = {"schema_version": "prop_explorer_market_comparison.v1", "record_type": "market_comparison",
         "research_only": True, "identity": {"sport": "NFL", "game_id": "g1", "player_id": "p1",
                                             "statistic": "receiving_yards"},
         "projection_explorer_id": "NFL|g1|p1|receiving_yards|TEST_V1|cond|2026-10-11T15:00:00Z",
         "venue": "synthetic-venue", "market_ref": "SYN-1", "listed_at": "2026-10-10T12:00:00Z",
         "quoted_at": "2026-10-11T14:59:00Z", "captured_at": "2026-10-11T15:00:00Z",
         "rungs": [{"at_least": 40.5, "yes_bid": 0.66, "yes_ask": 0.69, "no_bid": 0.30, "no_ask": 0.33,
                    "quote_probability": None},
                   {"at_least": 60.5, "yes_bid": 0.45, "yes_ask": 0.48, "no_bid": 0.51, "no_ask": 0.54,
                    "quote_probability": None}],
         "null_reasons": {"rungs[0].quote_probability": "venue publishes no probability",
                          "rungs[1].quote_probability": "venue publishes no probability"}}
    m.update(over)
    return m


class MarketComparisonTests(unittest.TestCase):
    def test_valid_and_linked(self):
        projections = build()
        summary = px.validate_market_file([market()], projections)
        self.assertEqual(summary["n"], 1)

    def test_model_output_refused(self):
        for key in ("mean", "projection", "edge", "model_probability", "recommendation"):
            m = market()
            m["x_extra"] = {key: 0.5}
            with self.assertRaisesRegex(gate.GateError, "forbidden in a market comparison"):
                px.validate_market(m)

    def test_quote_rules(self):
        m = market()
        m["rungs"][0]["yes_bid"] = 0.7
        with self.assertRaisesRegex(gate.GateError, "yes_bid above yes_ask"):
            px.validate_market(m)
        m = market()
        m["rungs"].reverse()
        with self.assertRaisesRegex(gate.GateError, "ascending"):
            px.validate_market(m)
        with self.assertRaisesRegex(gate.GateError, "listed_at"):
            px.validate_market(market(listed_at="2026-10-11T15:30:00Z"))
        with self.assertRaisesRegex(gate.GateError, "ladder rung"):
            px.validate_market(market(identity={"sport": "NFL", "game_id": "g1", "player_id": "p1",
                                                "statistic": "receiving_yards_over_60"}))

    def test_identity_must_match_projection(self):
        m = market(identity={"sport": "NFL", "game_id": "g1", "player_id": "p9", "statistic": "receiving_yards"})
        with self.assertRaisesRegex(gate.GateError, "disagrees"):
            px.validate_market_file([m], build())
        m = market(projection_explorer_id="NFL|g1|p1|receiving_yards|OTHER|cond|2026-10-11T15:00:00Z")
        with self.assertRaisesRegex(gate.GateError, "not in the projections file"):
            px.validate_market_file([m], build())

    def test_record_types_stay_in_their_own_files(self):
        with self.assertRaisesRegex(gate.GateError, "schema_version"):
            px.validate_projection(market())
        with self.assertRaisesRegex(gate.GateError, "schema_version"):
            px.validate_market(valid_row())


class ExampleTests(unittest.TestCase):
    """The committed examples are real research outputs from the sport repositories (see sources/SOURCES.json)."""

    def load(self, sport):
        return gate.load_jsonl(EXAMPLES / f"{sport}.prop_explorer_projection.v1.jsonl")

    def test_examples_validate_and_rebuild_identically(self):
        sys.path.insert(0, str(EXAMPLES))
        try:
            import build_examples
        finally:
            sys.path.remove(str(EXAMPLES))
        texts = build_examples.build()
        for name, text in texts.items():
            self.assertEqual((EXAMPLES / name).read_text(encoding="utf-8"), text, name)
        for sport in ("mlb", "nfl", "nba"):
            px.validate_projection_file(self.load(sport))

    def test_sources_are_valid_v1_and_match_manifest(self):
        manifest = json.loads((EXAMPLES / "sources" / "SOURCES.json").read_text())
        self.assertEqual(len(manifest), 6)
        for entry in manifest:
            rows = gate.load_jsonl(EXAMPLES / "sources" / entry["file"])
            self.assertEqual(len(rows), entry["rows"])
            summary = gate.validate_file_summary(rows, require_v1=True)
            self.assertEqual(summary["schema_versions"], {"pure_forecast.v1": len(rows)})
            self.assertRegex(entry["commit"], r"^[0-9a-f]{40}$")
            self.assertRegex(entry["file_sha256"], r"^[0-9a-f]{64}$")

    def test_example_statuses_match_the_sources(self):
        expected = {
            "mlb_pitcher_workload_joint_v1": "RESEARCH_HISTORICAL_ACCEPTED",
            "pitcher_prop_projection@params_asof_2026-10-07": "NOT_VALIDATED",
            "pure-player-v1.0.0": "RESEARCH_HISTORICAL_ACCEPTED",
            "pure-ewm-baseline-1.0.0": "NOT_VALIDATED",
            "NBA_BASELINE_2026_PRESEASON_V1:sim-rotation": "NOT_VALIDATED",
            "sim_challenger": "REJECTED",
        }
        seen = {}
        for sport in ("mlb", "nfl", "nba"):
            for r in self.load(sport):
                seen[r["identity"]["model_version"]] = r["validation"]["status"]
                # Nothing the sources lack is filled in.
                self.assertIsNone(r["player"]["name"])
                self.assertIsNone(r["game_script"])
                self.assertIsNone(r["change_explanation"])
                self.assertEqual(r["capture"]["capture_mode"], "historical_research_replay")
        self.assertEqual(seen, expected)


class SchemaAndTypesSyncTests(unittest.TestCase):
    schema = json.loads((ROOT / "schema" / "prop_explorer_projection.v1.schema.json").read_text())
    dts = (ROOT / "types" / "prop_explorer_projection.v1.d.ts").read_text()

    def test_schema_matches_runner(self):
        d = self.schema["$defs"]
        self.assertEqual(d["projection"]["required"], list(px.PROJECTION_REQUIRED))
        self.assertEqual(sorted(d["projection"]["properties"]),
                         sorted(px.PROJECTION_REQUIRED + px.PROJECTION_OPTIONAL))
        for name, fields in (("identity", px.IDENTITY_FIELDS), ("capture", px.CAPTURE_FIELDS),
                             ("player", px.PLAYER_FIELDS), ("game", px.GAME_FIELDS),
                             ("distribution", px.DISTRIBUTION_FIELDS), ("workload", px.WORKLOAD_FIELDS),
                             ("driver", px.DRIVER_FIELDS), ("game_script", px.SCRIPT_FIELDS),
                             ("scenario", px.SCENARIO_FIELDS), ("uncertainty", px.UNCERTAINTY_FIELDS),
                             ("coverage", px.COVERAGE_FIELDS), ("freshness", px.FRESHNESS_FIELDS),
                             ("validation", px.VALIDATION_FIELDS), ("evidence", px.EVIDENCE_FIELDS),
                             ("change", px.CHANGE_FIELDS), ("provenance", px.PROVENANCE_FIELDS),
                             ("market_comparison", px.MARKET_REQUIRED), ("rung", px.RUNG_FIELDS)):
            self.assertEqual(d[name]["required"], list(fields), name)
        self.assertEqual(d["validation"]["properties"]["status"]["enum"], list(px.VALIDATION_STATUSES))

    def test_schema_validates_examples_when_jsonschema_is_available(self):
        try:
            import jsonschema
            from referencing import Registry, Resource
        except ImportError:
            self.skipTest("jsonschema not installed (the runner itself is stdlib-only)")
        v1 = json.loads((ROOT / "schema" / "pure_forecast.v1.schema.json").read_text())
        reg = Registry().with_resources([(v1["$id"], Resource.from_contents(v1)),
                                         (self.schema["$id"], Resource.from_contents(self.schema))])
        validator = jsonschema.Draft202012Validator(self.schema, registry=reg)
        for sport in ("mlb", "nfl", "nba"):
            for row in gate.load_jsonl(EXAMPLES / f"{sport}.prop_explorer_projection.v1.jsonl"):
                validator.validate(row)
        for row in build():
            validator.validate(row)
        validator.validate(market())

    def interface(self, name):
        m = re.search(r"export interface %s \{(.*?)\n\}" % name, self.dts, re.S)
        self.assertIsNotNone(m, name)
        return set(re.findall(r"^  ([a-z_0-9]+)\??:", m.group(1), re.M))

    def test_typescript_declarations_match(self):
        for name, fields in (("PropExplorerProjectionV1", px.PROJECTION_REQUIRED + px.PROJECTION_OPTIONAL),
                             ("ExplorerIdentity", px.IDENTITY_FIELDS), ("ExplorerCapture", px.CAPTURE_FIELDS),
                             ("ExplorerPlayer", px.PLAYER_FIELDS), ("ExplorerGame", px.GAME_FIELDS),
                             ("ExplorerDistribution", px.DISTRIBUTION_FIELDS),
                             ("ExplorerWorkload", px.WORKLOAD_FIELDS), ("ExplorerDriver", px.DRIVER_FIELDS),
                             ("ExplorerGameScript", px.SCRIPT_FIELDS), ("GameScriptScenario", px.SCENARIO_FIELDS),
                             ("ExplorerUncertainty", px.UNCERTAINTY_FIELDS),
                             ("HoldoutIntervalCoverage", px.COVERAGE_FIELDS),
                             ("ExplorerFreshness", px.FRESHNESS_FIELDS), ("ExplorerValidation", px.VALIDATION_FIELDS),
                             ("ExplorerEvidence", px.EVIDENCE_FIELDS),
                             ("ExplorerChangeExplanation", px.CHANGE_FIELDS + ("unattributed",)),
                             ("ExplorerProvenance", px.PROVENANCE_FIELDS),
                             ("PropExplorerMarketComparisonV1", px.MARKET_REQUIRED),
                             ("MarketComparisonRung", px.RUNG_FIELDS)):
            self.assertEqual(self.interface(name), set(fields), name)
        for status in px.VALIDATION_STATUSES:
            self.assertIn(f"'{status}'", self.dts)


if __name__ == "__main__":
    unittest.main()
