"""pure_gate tests beyond the kit port: schema v1, lineage, ladders, pooling refusal, exclusions, CRPS,
two-file refusal, and the rerun non-leakage proof against synthetic toy models.

All rows and numbers here are synthetic test fixtures, not sports results.
"""
import copy
import io
import json
import shlex
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import pure_gate as gate  # noqa: E402

TOY = Path(__file__).resolve().parent / "toy_models" / "toy_model.py"
PY = sys.executable


def v1(game="g1", player="p1", mean=60.0, stat="receiving_yards", cond=True, pp=0.95):
    return {
        "schema_version": "pure_forecast.v1", "sport": "NFL", "game_id": game, "player_id": player,
        "statistic": stat, "as_of": "2026-10-11T15:00:00Z", "kickoff": "2026-10-11T17:00:00Z",
        "source_max_observed_at": "2026-10-11T14:55:00Z", "projection_mode": "PURE_INDEPENDENT",
        "model_version": "TEST_V1", "model_frozen_hash": "sha256:" + "a" * 64,
        "conditional_on_playing": cond, "participation_probability": pp,
        "projection": {"mean": mean, "median": mean - 2, "p10": mean - 30, "p90": mean + 30,
                       "thresholds": [{"at_least": 40.5, "probability": 0.70},
                                      {"at_least": 60.5, "probability": 0.48},
                                      {"at_least": 80.5, "probability": 0.25}]},
        "sources": [{"source_id": "pbp", "class": "sports_only", "max_observed_at": "2026-10-07T04:00:00Z"},
                    {"source_id": "injuries", "class": "sports_only", "max_observed_at": "2026-10-11T14:55:00Z"}],
        "feature_lineage": [
            {"name": "targets_ewm", "value": 6.1, "source": "pbp", "observed_at": "2026-10-07T04:00:00Z",
             "class": "sports_only"},
            {"name": "status", "value": "ACTIVE", "source": "injuries", "observed_at": "2026-10-11T14:55:00Z",
             "class": "sports_only"}],
    }


def out(game="g1", actual=60.0, played=True, player="p1", stat="receiving_yards"):
    return {"sport": "NFL", "game_id": game, "player_id": player, "statistic": stat,
            "actual": actual, "played": played}


class SchemaV1Tests(unittest.TestCase):
    def test_valid_v1(self):
        self.assertEqual(gate.validate(v1()), gate.SCHEMA_V1)

    def test_examples_validate(self):
        for name, version in (("pure_forecast.v1.example.jsonl", gate.SCHEMA_V1),
                              ("kit_interim_v0.example.jsonl", gate.SCHEMA_V0)):
            rows = gate.load_jsonl(ROOT / "examples" / name)
            summary = gate.validate_file_summary(rows)
            self.assertEqual(list(summary["schema_versions"]), [version])

    def test_schema_file_matches_runner(self):
        schema = json.loads((ROOT / "schema" / "pure_forecast.v1.schema.json").read_text())
        defs = schema["$defs"]
        self.assertEqual(sorted(defs["v1"]["required"]), sorted(gate.V1_REQUIRED))
        self.assertEqual(sorted(defs["v0_kit_interim"]["required"]), sorted(gate.V0_REQUIRED))
        self.assertEqual(sorted(defs["feature"]["required"]), sorted(gate.FEATURE_REQUIRED))
        self.assertEqual(sorted(defs["source"]["required"]), sorted(gate.SOURCE_REQUIRED))
        self.assertEqual(defs["v1"]["properties"]["schema_version"]["const"], gate.SCHEMA_V1)
        try:
            import jsonschema  # optional; the runner itself is stdlib-only
        except ImportError:
            return
        for name in ("pure_forecast.v1.example.jsonl", "kit_interim_v0.example.jsonl"):
            for row in gate.load_jsonl(ROOT / "examples" / name):
                jsonschema.validate(row, schema)
        jsonschema.validate(v1(), schema)

    def test_unknown_schema_version_refused(self):
        r = v1()
        r["schema_version"] = "pure_forecast.v2"
        with self.assertRaisesRegex(gate.GateError, "unknown schema_version"):
            gate.validate(r)

    def test_frozen_hash_required_and_formatted(self):
        r = v1()
        del r["model_frozen_hash"]
        with self.assertRaisesRegex(gate.GateError, "missing required"):
            gate.validate(r)
        for bad in ("abc", "sha256:xyz", "md5:" + "a" * 32, "git:12"):
            r = v1()
            r["model_frozen_hash"] = bad
            with self.assertRaises(gate.GateError):
                gate.validate(r)
        r = v1()
        r["model_frozen_hash"] = "git:0123abc"
        gate.validate(r)

    def test_participation_probability(self):
        r = v1(pp=1.2)
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1(pp=None)
        gate.validate(r)
        summary = gate.validate_file_summary([r])
        self.assertTrue(any("not modeled" in w for w in summary["warnings"]))
        r = v1()
        del r["participation_probability"]
        with self.assertRaisesRegex(gate.GateError, "missing required"):
            gate.validate(r)

    def test_unconditional_ladder_cannot_exceed_participation(self):
        r = v1(cond=False, pp=0.6)  # P(X >= 40.5) = 0.70 > P(play) = 0.6
        with self.assertRaisesRegex(gate.GateError, "participation_probability"):
            gate.validate(r)
        gate.validate(v1(cond=False, pp=0.8))

    def test_extra_fields_and_x_metadata(self):
        r = v1()
        r["market_line"] = 55.5
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1()
        r["notes"] = "free text"
        with self.assertRaisesRegex(gate.GateError, "unexpected fields"):
            gate.validate(r)
        r = v1()
        r["x_run_id"] = "abc"
        gate.validate(r)
        r = v1()
        r["x_kalshi_ticker"] = "KX..."
        with self.assertRaisesRegex(gate.GateError, "market-dependent"):
            gate.validate(r)

    def test_require_v1_refuses_kit_interim(self):
        rows = gate.load_jsonl(ROOT / "examples" / "kit_interim_v0.example.jsonl")
        with self.assertRaisesRegex(gate.GateError, "require-v1"):
            gate.validate_file_summary(rows, require_v1=True)
        summary = gate.validate_file_summary(rows)
        self.assertTrue(any("NOT verified" in w for w in summary["warnings"]))

    def test_timestamp_order(self):
        r = v1()
        r["as_of"] = "2026-10-11T17:00:00Z"  # as_of == kickoff
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1()
        r["as_of"] = "2026-10-11T15:00:00"  # naive
        with self.assertRaisesRegex(gate.GateError, "timezone"):
            gate.validate(r)


class LineageTests(unittest.TestCase):
    def test_feature_after_cutoff_refused(self):
        r = v1()
        r["feature_lineage"][0]["observed_at"] = "2026-10-11T14:56:00Z"
        with self.assertRaisesRegex(gate.GateError, "lineage cutoff violation"):
            gate.validate(r)

    def test_feature_after_its_source_refused(self):
        r = v1()
        r["feature_lineage"][0]["observed_at"] = "2026-10-08T00:00:00Z"  # pbp max is 10-07
        with self.assertRaisesRegex(gate.GateError, "observed after its source"):
            gate.validate(r)

    def test_source_after_cutoff_refused(self):
        r = v1()
        r["sources"][1]["max_observed_at"] = "2026-10-11T16:00:00Z"
        with self.assertRaisesRegex(gate.GateError, "source cutoff"):
            gate.validate(r)

    def test_undeclared_source_and_class(self):
        r = v1()
        r["feature_lineage"][0]["source"] = "unknown_feed"
        with self.assertRaisesRegex(gate.GateError, "not declared"):
            gate.validate(r)
        r = v1()
        r["feature_lineage"][0]["class"] = "market_derived"
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1()
        r["sources"][0]["class"] = "mixed"
        with self.assertRaises(gate.GateError):
            gate.validate(r)

    def test_market_names_and_sources_refused(self):
        cases = [("name", "closing_line_total"), ("name", "teamImpliedTotal"), ("name", "no_vig_prob"),
                 ("name", "moneyline_home"), ("name", "point_spread_home"), ("source", "kalshi_settlements"),
                 ("source", "draftkings_props"), ("name", "over_under")]
        for field, value in cases:
            r = v1()
            r["feature_lineage"][0][field] = value
            if field == "source":
                r["sources"][0]["source_id"] = value
            with self.assertRaisesRegex(gate.GateError, "market-dependent", msg=value):
                gate.validate(r)
        r = v1()
        r["sources"][0]["uri"] = "https://api.example/odds/nfl"
        with self.assertRaisesRegex(gate.GateError, "market-dependent"):
            gate.validate(r)

    def test_no_false_positive_on_embedded_letters(self):
        # token matching: "navigation" is not "vig", "closing_speed" is not a closing line, "spreadsheet" ok
        for name in ("navigation_score", "closing_speed_ewm", "red_zone_targets", "snap_share"):
            r = v1()
            r["feature_lineage"][0]["name"] = name
            gate.validate(r)

    def test_duplicate_feature_and_source(self):
        r = v1()
        r["feature_lineage"][1]["name"] = r["feature_lineage"][0]["name"]
        with self.assertRaisesRegex(gate.GateError, "duplicate feature"):
            gate.validate(r)
        r = v1()
        r["sources"][1]["source_id"] = "pbp"
        with self.assertRaisesRegex(gate.GateError, "duplicate source"):
            gate.validate(r)

    def test_empty_lineage_refused(self):
        r = v1()
        r["feature_lineage"] = []
        with self.assertRaises(gate.GateError):
            gate.validate(r)


class LadderAndQuantileTests(unittest.TestCase):
    def test_non_increasing_probabilities(self):
        r = v1()
        r["projection"]["thresholds"][1]["probability"] = 0.71
        with self.assertRaisesRegex(gate.GateError, "monotone"):
            gate.validate(r)

    def test_equal_probabilities_allowed(self):
        r = v1()
        r["projection"]["thresholds"][1]["probability"] = 0.70
        gate.validate(r)

    def test_strikes_ascending_and_probability_range(self):
        r = v1()
        r["projection"]["thresholds"][2]["at_least"] = 60.5
        with self.assertRaisesRegex(gate.GateError, "ascending"):
            gate.validate(r)
        r = v1()
        r["projection"]["thresholds"][0]["probability"] = 1.01
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1()
        r["projection"]["thresholds"][0]["probability"] = -0.01
        with self.assertRaises(gate.GateError):
            gate.validate(r)
        r = v1()
        r["projection"]["thresholds"][0]["market_probability"] = 0.6
        with self.assertRaises(gate.GateError):
            gate.validate(r)

    def test_quantiles(self):
        r = v1()
        r["projection"]["quantiles"] = [{"q": 0.25, "value": 45.0}, {"q": 0.75, "value": 75.0}]
        gate.validate(r)
        r["projection"]["quantiles"] = [{"q": 0.25, "value": 59.0}]  # above median 58
        with self.assertRaisesRegex(gate.GateError, "non-decreasing"):
            gate.validate(r)
        r["projection"]["quantiles"] = [{"q": 0.5, "value": 61.0}]  # disagrees with median
        with self.assertRaisesRegex(gate.GateError, "disagrees"):
            gate.validate(r)
        r["projection"]["quantiles"] = [{"q": 0.75, "value": 75.0}, {"q": 0.25, "value": 45.0}]
        with self.assertRaisesRegex(gate.GateError, "ascending"):
            gate.validate(r)


class PoolingRefusalTests(unittest.TestCase):
    def test_rungs_as_separate_rows_refused(self):
        rows = [v1(stat="receiving_yards_over_50"), v1(stat="receiving_yards_over_75")]
        with self.assertRaisesRegex(gate.GateError, "ladder rungs exported as separate rows"):
            gate.index_rows(rows)
        rows = [v1(stat="points_15"), v1(stat="points_20")]
        with self.assertRaisesRegex(gate.GateError, "pooling"):
            gate.index_rows(rows)

    def test_rung_named_statistic_refused(self):
        for stat in ("receiving_yards_50+", "points_at_least_20"):
            with self.assertRaisesRegex(gate.GateError, "ladder rung", msg=stat):
                gate.validate(v1(stat=stat))

    def test_distinct_stats_not_mistaken_for_rungs(self):
        gate.index_rows([v1(stat="points_q1"), v1(stat="points_q2"), v1(stat="receiving_yards")])

    def test_outcomes_per_rung_refused(self):
        o = out()
        o["at_least"] = 50
        with self.assertRaisesRegex(gate.GateError, "per-rung"):
            gate.outcomes_index([o])
        with self.assertRaisesRegex(gate.GateError, "duplicate outcome"):
            gate.outcomes_index([out(), out()])
        o = out()
        o["source"] = "kalshi_settlement"
        with self.assertRaisesRegex(gate.GateError, "market-dependent"):
            gate.outcomes_index([o])

    def test_one_threshold_per_player_game(self):
        champ = [v1(f"g{i}", f"p{j}") for i in range(4) for j in range(3)]
        chal = [v1(f"g{i}", f"p{j}", mean=62.0) for i in range(4) for j in range(3)]
        truth = [out(f"g{i}", 50.0 + i, player=f"p{j}") for i in range(4) for j in range(3)]
        s = gate.compare(champ, chal, truth, bootstrap=20)["statistic_scorecards"]["NFL:receiving_yards"]
        self.assertEqual(s["n_player_games"], 12)
        self.assertEqual(s["n_common_thresholds_scored_one_per_player_game"], 12)  # not 36 rungs
        self.assertEqual(s["n_games"], 4)

    def test_threshold_selection_symmetric_and_exact_strike(self):
        a, b = v1(), v1()
        b["projection"]["thresholds"] = [{"at_least": 40.5, "probability": 0.9},
                                         {"at_least": 60.5, "probability": 0.62},
                                         {"at_least": 81.0, "probability": 0.2}]
        ta, tb = gate.selected_threshold(a, b)
        self.assertEqual(ta["at_least"], 60.5)
        self.assertEqual(gate.selected_threshold(b, a)[0]["at_least"], 60.5)
        b["projection"]["thresholds"] = [{"at_least": 41.0, "probability": 0.7}]
        self.assertIsNone(gate.selected_threshold(a, b))


class CompareTests(unittest.TestCase):
    def test_exclusion_counting(self):
        champ = [v1("g1", "a"), v1("g2", "b"), v1("g3", "c"), v1("g4", "d"), v1("g5", "e")]
        chal = [v1("g1", "a"), v1("g2", "b"), v1("g3", "c"), v1("g4", "d"), v1("g6", "f")]
        truth = [out("g1", player="a"), out("g2", player="b", played=False, actual=0),
                 out("g3", player="c"), out("g7", player="z")]
        r = gate.compare(champ, chal, truth, bootstrap=10)
        cov = r["coverage"]
        self.assertEqual(cov["champion_only_without_challenger"], 1)       # e
        self.assertEqual(cov["challenger_only_without_champion"], 1)       # f
        self.assertEqual(cov["matched_forecasts_without_outcome"], 1)      # d
        self.assertEqual(cov["outcomes_without_matched_forecasts"], 1)     # z
        self.assertEqual(cov["settled_with_both_forecasts"], 3)            # a b c
        self.assertEqual(r["conditional_dnp_excluded"], 1)                 # b
        self.assertEqual(r["exclusions_by_statistic"]["NFL:receiving_yards"],
                         {"champion_only": 1, "challenger_only": 1, "conditional_dnp": 1, "no_outcome": 1})
        self.assertEqual(r["statistic_scorecards"]["NFL:receiving_yards"]["n_player_games"], 2)

    def test_unconditional_dnp_is_scored(self):
        a, b = v1(cond=False, pp=0.8), v1(cond=False, pp=0.8)
        r = gate.compare([a], [b], [out(played=False, actual=0.0)], bootstrap=0)
        self.assertEqual(r["conditional_dnp_excluded"], 0)
        self.assertEqual(r["statistic_scorecards"]["NFL:receiving_yards"]["n_player_games"], 1)

    def test_metrics_and_crps(self):
        a, b = v1(mean=60.0), v1(mean=70.0)
        s = gate.compare([a], [b], [out(actual=65.0)], bootstrap=0)["statistic_scorecards"]["NFL:receiving_yards"]
        self.assertAlmostEqual(s["champion_mae"], 5.0)
        self.assertAlmostEqual(s["challenger_mae"], 5.0)
        self.assertAlmostEqual(s["champion_bias"], -5.0)
        self.assertAlmostEqual(s["challenger_bias"], 5.0)
        # champion levels: q.1=30, q.5=58, q.9=90 vs y=65 -> pinball .1*35 + .5*7 + .1*25 = 9.5 -> CRPS 2*9.5/3
        self.assertAlmostEqual(s["champion_crps_quantile_approx"], round(2 * 9.5 / 3, 6))
        self.assertEqual(s["crps_min_common_quantile_levels"], 3)
        self.assertIsNone(s["delta_mae_game_cluster_bootstrap_95ci"])  # < 3 games -> no CI

    def test_crps_uses_common_extra_quantiles(self):
        a, b = v1(), v1()
        for r in (a, b):
            r["projection"]["quantiles"] = [{"q": 0.25, "value": 45.0}, {"q": 0.75, "value": 75.0}]
        s = gate.compare([a], [b], [out()], bootstrap=0)["statistic_scorecards"]["NFL:receiving_yards"]
        self.assertEqual(s["crps_min_common_quantile_levels"], 5)

    def test_bootstrap_ci_paired_and_deterministic(self):
        champ = [v1(f"g{i}", mean=60.0) for i in range(30)]
        chal = [v1(f"g{i}", mean=62.0) for i in range(30)]
        truth = [out(f"g{i}", actual=60.0 + (i % 7)) for i in range(30)]
        r1 = gate.compare(champ, chal, truth, bootstrap=200)
        r2 = gate.compare(champ, chal, truth, bootstrap=200)
        s = r1["statistic_scorecards"]["NFL:receiving_yards"]
        self.assertEqual(s, r2["statistic_scorecards"]["NFL:receiving_yards"])
        lo, hi = s["delta_mae_game_cluster_bootstrap_95ci"]
        self.assertLessEqual(lo, s["delta_mae_challenger_minus_champion"])
        self.assertGreaterEqual(hi, s["delta_mae_challenger_minus_champion"])
        self.assertFalse(s["few_game_clusters_warning"])
        for k in ("delta_mse_game_cluster_bootstrap_95ci", "delta_brier_game_cluster_bootstrap_95ci",
                  "delta_crps_game_cluster_bootstrap_95ci", "delta_coverage_game_cluster_bootstrap_95ci"):
            self.assertIsNotNone(s[k], k)

    def test_v0_champion_vs_v1_challenger(self):
        kit = gate.load_jsonl(ROOT / "examples" / "kit_interim_v0.example.jsonl")
        chal = []
        for row in kit:
            r = v1(row["game_id"], row["player_id"], mean=row["projection"]["mean"] + 3)
            r["as_of"], r["kickoff"] = row["as_of"], row["kickoff"]
            r["source_max_observed_at"] = row["source_max_observed_at"]
            r["sources"][1]["max_observed_at"] = row["source_max_observed_at"]
            r["feature_lineage"][1]["observed_at"] = row["source_max_observed_at"]
            r["projection"]["thresholds"] = row["projection"]["thresholds"]
            chal.append(r)
        truth = [out(r["game_id"], 85.0, player=r["player_id"]) for r in kit]
        rep = gate.compare(kit, chal, truth, bootstrap=20)
        self.assertEqual(rep["coverage"]["settled_with_both_forecasts"], len(kit))


class TwoFileRefusalTests(unittest.TestCase):
    def _cli(self, *args):
        o, e = io.StringIO(), io.StringIO()
        with redirect_stdout(o), redirect_stderr(e):
            code = gate.main(list(args))
        return code, o.getvalue(), e.getvalue()

    def test_identical_copies_are_not_certified(self):
        src = ROOT / "examples" / "pure_forecast.v1.example.jsonl"
        with tempfile.TemporaryDirectory() as d:
            cp = Path(d) / "copy.jsonl"
            cp.write_bytes(src.read_bytes())
            code, stdout, _ = self._cli("mutation", "--before", str(src), "--after", str(cp))
        self.assertEqual(code, 3)
        rep = json.loads(stdout)
        self.assertFalse(rep["certified"])
        self.assertEqual(rep["verdict"], "NOT_CERTIFIED_PRECOMPUTED_FILES")

    def test_differing_files_fail(self):
        src = ROOT / "examples" / "pure_forecast.v1.example.jsonl"
        rows = gate.load_jsonl(src)
        rows[0]["projection"]["mean"] += 1
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.jsonl"
            p.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
            code, stdout, _ = self._cli("mutation", "--before", str(src), "--after", str(p))
        self.assertEqual(code, 1)

    def test_rerun_requires_control_command(self):
        with self.assertRaises(SystemExit):
            with redirect_stderr(io.StringIO()):
                gate.main(["rerun", "--model-cmd", "x {out}", "--manifest", "m.json"])


SPORTS = {"as_of": "2026-10-11T15:00:00Z", "source_max_observed_at": "2026-10-11T14:00:00Z",
          "players": [{"player_id": f"p{i}", "game_id": f"g{i % 3}", "kickoff": "2026-10-11T17:00:00Z",
                       "recent": [30.0 + i, 55.0 + 2 * i, 47.0, 61.0 - i]} for i in range(6)]}
MARKET = {"lines": {f"p{i}": {"line": 70.5 - i, "over_price": 0.52} for i in range(6)}}


class RerunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        (self.d / "sports.json").write_text(json.dumps(SPORTS))
        (self.d / "data").mkdir()
        (self.d / "data" / "market.json").write_text(json.dumps(MARKET, sort_keys=True))

    def tearDown(self):
        self.tmp.cleanup()

    def manifest(self, **over):
        m = {"mode": "placeholder", "market_inputs": {"lines": "data/market.json"},
             "sports_inputs": {"box": "sports.json"}, "outputs": ["pure_forecasts.jsonl"]}
        m.update(over)
        p = self.d / "manifest.json"
        p.write_text(json.dumps(m))
        return p

    @staticmethod
    def cmd(variant, *extra, markets="{market[lines]}"):
        c = [PY, "-I", str(TOY), "--variant", variant, "--sports", "{sports[box]}", "--out", "{out}",
             "--seed", "{seed}"]
        if markets:
            c += ["--markets", markets]
        return c + list(extra)

    def run_gate(self, model, control, manifest=None, **kw):
        return gate.rerun(model, control, manifest or self.manifest(), workdir=self.d / "work", **kw)

    def test_honest_model_passes(self):
        rep = self.run_gate(self.cmd("honest"), self.cmd("leaky"))
        self.assertEqual(rep["verdict"], "PASS_RUNTIME_NONLEAKAGE", json.dumps(rep["checks"]))
        self.assertTrue(rep["certified"])
        self.assertEqual(set(rep["per_arm"]["control_responded"].values()), {"output_changed"})
        self.assertTrue(rep["checks"]["sports_inputs_unchanged"])

    def test_leaky_model_fails(self):
        rep = self.run_gate(self.cmd("leaky", "--weight", "0.1"), self.cmd("leaky"))
        self.assertEqual(rep["verdict"], "FAIL_MARKET_LEAK")
        self.assertFalse(rep["certified"])
        self.assertEqual(rep["per_arm"]["model_identical"], {"deleted": False, "randomized_0": False})

    def test_control_without_response_fails_no_power(self):
        rep = self.run_gate(self.cmd("honest"), self.cmd("deaf"))
        self.assertEqual(rep["verdict"], "FAIL_NO_POWER")
        self.assertFalse(rep["passed"])

    def test_nondeterministic_model_fails(self):
        rep = self.run_gate(self.cmd("nondeterministic"), self.cmd("leaky"))
        self.assertEqual(rep["verdict"], "FAIL_NONDETERMINISTIC")

    def test_wallclock_metadata_needs_pure_jsonl_compare(self):
        rep = self.run_gate(self.cmd("wallclock"), self.cmd("leaky"))
        self.assertEqual(rep["verdict"], "FAIL_NONDETERMINISTIC")  # bytes differ every run
        rep = self.run_gate(self.cmd("wallclock"), self.cmd("leaky"),
                            manifest=self.manifest(compare="pure_jsonl"))
        self.assertEqual(rep["verdict"], "PASS_RUNTIME_NONLEAKAGE")  # x_ metadata is not model-owned

    def test_multiple_random_draws(self):
        rep = self.run_gate(self.cmd("honest"), self.cmd("leaky"), random_draws=3)
        self.assertEqual(rep["verdict"], "PASS_RUNTIME_NONLEAKAGE")
        self.assertEqual(len(rep["per_arm"]["model_identical"]), 4)

    def test_csv_market_input(self):
        (self.d / "data" / "market.csv").write_text(
            "player_id,line,price\n" + "".join(f"p{i},{70.5 - i},0.5\n" for i in range(6)))
        m = self.manifest(market_inputs={"lines": "data/market.csv"})
        self.assertEqual(self.run_gate(self.cmd("honest"), self.cmd("leaky"), manifest=m)["verdict"],
                         "PASS_RUNTIME_NONLEAKAGE")
        self.assertEqual(self.run_gate(self.cmd("leaky", "--weight", "0.2"), self.cmd("leaky"), manifest=m)["verdict"],
                         "FAIL_MARKET_LEAK")

    def test_in_place_mode_restores_market_files(self):
        before = (self.d / "data" / "market.json").read_bytes()
        m = self.manifest(mode="in_place")
        fixed = ["--fixed-market-path", "data/market.json"]
        rep = self.run_gate(self.cmd("honest", *fixed, markets=None), self.cmd("leaky", *fixed, markets=None), manifest=m)
        self.assertEqual(rep["verdict"], "PASS_RUNTIME_NONLEAKAGE", json.dumps(rep["checks"]))
        self.assertEqual((self.d / "data" / "market.json").read_bytes(), before)
        rep = self.run_gate(self.cmd("leaky", "--weight", "0.2", *fixed, markets=None),
                            self.cmd("leaky", *fixed, markets=None), manifest=m)
        self.assertEqual(rep["verdict"], "FAIL_MARKET_LEAK")
        self.assertTrue(rep["checks"]["market_inputs_restored_unchanged"])
        self.assertEqual((self.d / "data" / "market.json").read_bytes(), before)

    def test_in_place_reused_workdir_never_restores_stale_backup(self):
        m = self.manifest(mode="in_place")
        fixed = ["--fixed-market-path", "data/market.json"]
        args = (self.cmd("honest", *fixed, markets=None), self.cmd("leaky", *fixed, markets=None))
        self.run_gate(*args, manifest=m)
        newer = dict(MARKET, lines={"p0": {"line": 12.5, "over_price": 0.4}})
        (self.d / "data" / "market.json").write_text(json.dumps(newer))
        expected = (self.d / "data" / "market.json").read_bytes()
        self.run_gate(*args, manifest=m)  # same workdir as the first run
        self.assertEqual((self.d / "data" / "market.json").read_bytes(), expected)

    def test_placeholder_model_must_receive_market_inputs(self):
        with self.assertRaisesRegex(gate.GateError, "never receives market input"):
            self.run_gate(self.cmd("honest", markets=None), self.cmd("leaky"))

    def test_refusals(self):
        with self.assertRaisesRegex(gate.GateError, "different"):
            self.run_gate(self.cmd("honest"), self.cmd("honest"))
        with self.assertRaisesRegex(gate.GateError, "market_inputs"):
            self.run_gate(self.cmd("honest"), self.cmd("leaky"), manifest=self.manifest(market_inputs={}))
        with self.assertRaisesRegex(gate.GateError, "does not exist"):
            self.run_gate(self.cmd("honest"), self.cmd("leaky"),
                          manifest=self.manifest(market_inputs={"lines": "data/missing.json"}))
        with self.assertRaisesRegex(gate.GateError, "outputs"):
            self.run_gate(self.cmd("honest"), self.cmd("leaky"), manifest=self.manifest(outputs=[]))

    def test_ineffective_randomization_is_invalid(self):
        (self.d / "data" / "names.json").write_text(json.dumps({"lines": {}, "book": "none"}))
        m = self.manifest(market_inputs={"lines": "data/names.json"})
        rep = self.run_gate(self.cmd("honest"), self.cmd("leaky"), manifest=m)
        self.assertEqual(rep["verdict"], "ERROR_INVALID_EXPERIMENT")

    def test_cli_rerun_exit_codes(self):
        m = str(self.manifest())
        honest = shlex.join(self.cmd("honest"))
        leaky = shlex.join(self.cmd("leaky"))
        o = io.StringIO()
        with redirect_stdout(o):
            code = gate.main(["rerun", "--model-cmd", honest, "--control-cmd", leaky, "--manifest", m,
                              "--workdir", str(self.d / "w1")])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(o.getvalue())["verdict"], "PASS_RUNTIME_NONLEAKAGE")
        with redirect_stdout(io.StringIO()):
            code = gate.main(["rerun", "--model-cmd", shlex.join(self.cmd("leaky", "--weight", "0.2")),
                              "--control-cmd", leaky, "--manifest", m, "--workdir", str(self.d / "w2")])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
