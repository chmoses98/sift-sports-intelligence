"""prop_explorer_v2 tests: the v2 explorer row, its display rules, the fee/edge/bet-up-to arithmetic, the upgrade
from v1 (which stays readable), and the committed v2 examples.

The rows of examples/prop_explorer/synthetic_v2.py are SYNTHETIC fixtures (no real player, game, model or quote).
The <sport>.prop_explorer_projection.v2.jsonl examples are upgrades of the real v1 research examples and are only
read here.
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
EXAMPLES = ROOT / "examples" / "prop_explorer"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(EXAMPLES))
import prop_explorer as px  # noqa: E402
import prop_explorer_v2 as v2  # noqa: E402
import pure_gate as gate  # noqa: E402
import synthetic_v2 as syn  # noqa: E402

E = gate.GateError


def scenario(n):
    return copy.deepcopy(syn.build_synthetic()[n - 1])


def proj(row, pid):
    return next(p for p in row["projections"] if p["projection_id"] == pid)


def relabel(row):
    """Recompute the rungs and labels after a deliberate change (what an honest producer would do)."""
    if row["market_evaluation"] is not None:
        row["market_evaluation"]["rungs"] = v2.compute_rungs(row, row["market_evaluation"])
    row["display_label"] = v2.compute_display_label(row)
    return row


class ExampleTests(unittest.TestCase):
    def load(self, sport):
        return gate.load_jsonl(EXAMPLES / f"{sport}.prop_explorer_projection.v2.jsonl")

    def test_examples_rebuild_and_validate(self):
        import build_examples
        texts = build_examples.build()
        for name, text in texts.items():
            self.assertEqual((EXAMPLES / name).read_text(encoding="utf-8"), text, name)
        for sport in ("mlb", "nfl", "nba"):
            res = v2.validate_file(self.load(sport))
            self.assertEqual(res["schema_version"], "prop_explorer_projection.v2")
            self.assertEqual(res["display_labels"], {"RESEARCH": res["n"]})
        v2.validate_file(gate.load_jsonl(EXAMPLES / "synthetic.prop_explorer_projection.v2.example.jsonl"))

    def test_v1_stays_readable(self):
        for sport in ("mlb", "nfl", "nba"):
            rows = gate.load_jsonl(EXAMPLES / f"{sport}.prop_explorer_projection.v1.jsonl")
            self.assertEqual(v2.validate_file(rows)["schema_version"], "prop_explorer_projection.v1")
            # Every v1 record is embedded unchanged in the v2 row of its player-game-statistic.
            embedded = [p["explorer_projection"] for r in self.load(sport) for p in r["projections"]]
            self.assertEqual(sorted(json.dumps(x, sort_keys=True) for x in embedded),
                             sorted(json.dumps(x, sort_keys=True) for x in rows))
        mixed = gate.load_jsonl(EXAMPLES / "mlb.prop_explorer_projection.v1.jsonl")[:1] + self.load("mlb")[:1]
        with self.assertRaisesRegex(E, "one schema version"):
            v2.validate_file(mixed)

    def test_example_selection_and_statuses(self):
        for r in self.load("mlb"):
            self.assertEqual(r["best_validated_projection_id"], "mlb_pitcher_workload_joint_v1")
            self.assertEqual(r["sports_only_projection_id"], "mlb_pitcher_workload_joint_v1")
            self.assertEqual(r["primary_projection_id"], "mlb_pitcher_workload_joint_v1")
            chal = proj(r, "mlb_pitcher_workload_joint_v1")
            self.assertEqual(chal["validation"]["accuracy_status"], "ACCURACY_ACCEPTED_RESEARCH")
            self.assertEqual(chal["validation"]["value_status"], "VALUE_NOT_TESTED")
            self.assertFalse(chal["provenance"]["market_informed"])
            verdicts = {(e["model_version"], e["scope"]["season_type"]): e
                        for e in chal["validation"]["strict_rule_verdicts"]}
            self.assertEqual(verdicts[("MLB_HITTER_W2_PURE_V1", "regular")]["verdict"], "REJECTED")
            self.assertEqual(verdicts[("mlb_pitcher_workload_joint_v1", "postseason")]["row_label"],
                             "BLOCKED_NOT_VALIDATED_POSTSEASON")
            self.assertEqual(verdicts[("mlb_pitcher_workload_joint_v1", "regular")]["disposition"],
                             "PRESERVED_NOT_PROMOTED")
            self.assertEqual(proj(r, "pitcher_prop_projection@params_asof_2026-10-07")["validation"]["accuracy_status"],
                             "ACCURACY_NOT_TESTED")
            self.assertIsNone(r["market"])
        for r in self.load("nba"):
            self.assertIsNone(r["best_validated_projection_id"])
            self.assertEqual(r["primary_projection_id"], "NBA_BASELINE_2026_PRESEASON_V1:sim-rotation")
            self.assertEqual(proj(r, "sim_challenger")["validation"]["accuracy_status"], "ACCURACY_REJECTED")
        for r in self.load("nfl"):
            self.assertEqual(r["best_validated_projection_id"], "pure-player-v1.0.0")
            self.assertEqual(proj(r, "pure-ewm-baseline-1.0.0")["role"], "baseline")


class SyntheticScenarioTests(unittest.TestCase):
    def test_each_display_label(self):
        rows = syn.build_synthetic()
        self.assertEqual([r["display_label"] for r in rows],
                         ["RESEARCH", "MARKET_INFORMED", "VALIDATED_OPPORTUNITY", "NO_ELIGIBLE_PROJECTION"])
        self.assertTrue(all(r["x_synthetic"] for r in rows))
        s1, s2, s3, s4 = rows
        self.assertEqual({x["display_label"] for x in s1["market_evaluation"]["rungs"]}, {"RESEARCH", "NOT_EXECUTABLE"})
        self.assertEqual({x["display_label"] for x in s2["market_evaluation"]["rungs"]}, {"MARKET_INFORMED"})
        self.assertEqual([x["display_label"] for x in s3["market_evaluation"]["rungs"]],
                         ["NO_EDGE", "NO_EDGE", "VALIDATED_OPPORTUNITY", "NO_EDGE", "STALE_QUOTE", "STALE_QUOTE"])
        self.assertIsNone(s4["primary_projection_id"])
        self.assertIsNone(s4["market_evaluation"])


class MarketInformedTests(unittest.TestCase):
    def test_market_informed_best_accuracy_is_labelled(self):
        r = scenario(2)
        self.assertEqual(r["best_validated_projection_id"], "SYN_BEST_ACCURACY_V1")
        self.assertEqual(r["sports_only_projection_id"], "SYN_SPORTS_V1")
        mi = proj(r, "SYN_BEST_ACCURACY_V1")
        self.assertTrue(mi["provenance"]["market_informed"])
        self.assertEqual({m["dependency"] for m in mi["provenance"]["market_derived_inputs"]}, {"direct", "indirect"})
        # Positive edges against the market it learned from are still not independent value.
        self.assertTrue(any(x["edge_after_fees"] and x["edge_after_fees"] > 0.02 for x in r["market_evaluation"]["rungs"]))
        for tamper in ("RESEARCH", "VALIDATED_OPPORTUNITY"):
            t = copy.deepcopy(r)
            t["display_label"] = tamper
            with self.assertRaisesRegex(E, "display rules give MARKET_INFORMED"):
                v2.validate_row(t)
        t = copy.deepcopy(r)
        t["market_evaluation"]["rungs"][2]["display_label"] = "VALIDATED_OPPORTUNITY"
        with self.assertRaisesRegex(E, r"rungs\[2\]\.display_label"):
            v2.validate_row(t)
        # Even priced against the sports-only projection, the row headline stays MARKET_INFORMED.
        t = copy.deepcopy(r)
        t["market_evaluation"]["evaluated_projection_id"] = "SYN_SPORTS_V1"
        relabel(t)
        self.assertEqual(t["display_label"], "MARKET_INFORMED")
        v2.validate_row(t)

    def test_market_informed_flag_and_inputs(self):
        r = scenario(2)
        mi = proj(r, "SYN_BEST_ACCURACY_V1")
        mi["provenance"]["market_informed"] = False
        with self.assertRaisesRegex(E, "market_informed must be true exactly when"):
            v2.validate_row(r)
        r = scenario(2)
        mi = proj(r, "SYN_BEST_ACCURACY_V1")
        mi["provenance"]["market_derived_inputs"] = [m for m in mi["provenance"]["market_derived_inputs"]
                                                     if m["input"] != "implied_team_total"]
        with self.assertRaisesRegex(E, "undisclosed market input"):
            v2.validate_row(r)
        r = scenario(2)
        proj(r, "SYN_BEST_ACCURACY_V1")["provenance"]["market_derived_inputs"][0]["dependency"] = "maybe"
        with self.assertRaisesRegex(E, "dependency"):
            v2.validate_row(r)

    def test_sports_only_needs_its_v1_proof_and_market_informed_has_none(self):
        r = scenario(1)
        r["projections"][0]["explorer_projection"] = None
        with self.assertRaisesRegex(E, "embeds its prop_explorer_projection.v1 record"):
            v2.validate_row(r)
        r = scenario(2)
        proj(r, "SYN_BEST_ACCURACY_V1")["explorer_projection"] = copy.deepcopy(proj(r, "SYN_SPORTS_V1")["explorer_projection"])
        with self.assertRaisesRegex(E, "embeds no v1 record"):
            v2.validate_row(r)
        # The sports-only entry must show exactly what its v1 record proves.
        r = scenario(1)
        r["projections"][0]["outcome"]["mean"] += 1
        with self.assertRaisesRegex(E, "outcome must mirror"):
            v2.validate_row(r)
        r = scenario(1)
        r["projections"][0]["explorer_projection"]["forecast"]["feature_lineage"][0]["name"] = "kalshi_mid"
        with self.assertRaisesRegex(E, "explorer_projection"):
            v2.validate_row(r)

    def test_market_informed_cannot_claim_value(self):
        r = scenario(2)
        mi = proj(r, "SYN_BEST_ACCURACY_V1")
        mi["validation"]["value_status"] = "VALIDATED_VALUE"
        mi["validation"]["value_scope"] = copy.deepcopy(syn.VALUE_SCOPE)
        mi["validation"]["evidence"].append(syn.ev("value_results", "value_results"))
        mi["calibration"] = copy.deepcopy(syn.CALIBRATED)
        r["null_reasons"] = {k: v for k, v in r["null_reasons"].items() if "validation.value_scope" not in k}
        r["null_reasons"][f"projections[0].validation.evidence[2].url"] = "pinned"
        with self.assertRaisesRegex(E, "market-informed projection's disagreement"):
            v2.validate_row(r)


class ResearchVersusOpportunityTests(unittest.TestCase):
    def test_disagreement_without_value_is_research(self):
        r = scenario(3)
        p = r["projections"][0]
        p["validation"]["value_status"] = "VALUE_NOT_TESTED"
        p["validation"]["value_scope"] = None
        with self.assertRaisesRegex(E, "display_label"):
            v2.validate_row(r)  # the stored VALIDATED_OPPORTUNITY labels no longer hold
        relabel(r)
        v2.validate_row(r)
        self.assertEqual(r["display_label"], "RESEARCH")
        self.assertNotIn("VALIDATED_OPPORTUNITY", [x["display_label"] for x in r["market_evaluation"]["rungs"]])
        # A rejected or shadow value test is also only research.
        for status, kind in (("VALUE_REJECTED", "value_results"), ("VALUE_SHADOW_PROSPECTIVE", "shadow_collection"),
                             ("VALUE_INCONCLUSIVE", "value_results")):
            r = scenario(3)
            p = r["projections"][0]
            p["validation"]["value_status"] = status
            if kind == "shadow_collection":
                p["validation"]["evidence"].append(syn.ev("shadow", "shadow_collection"))
                r["null_reasons"]["projections[0].validation.evidence[4].url"] = "pinned"
            relabel(r)
            v2.validate_row(r)
            self.assertEqual(r["display_label"], "RESEARCH", status)

    def test_validated_value_needs_calibration_scope_and_evidence(self):
        r = scenario(3)
        r["projections"][0]["calibration"]["status"] = "ASSESSED"
        with self.assertRaisesRegex(E, "needs calibration.status CALIBRATED"):
            v2.validate_row(r)
        r = scenario(3)
        p = r["projections"][0]
        p["validation"]["evidence"] = [e for e in p["validation"]["evidence"] if e["kind"] != "value_results"]
        p["calibration"]["evidence_id"] = "results"
        r["null_reasons"].pop("projections[0].validation.evidence[3].url")
        with self.assertRaisesRegex(E, "value_results"):
            v2.validate_row(r)
        # Outside its value scope the same projection is research only.
        r = scenario(3)
        r["projections"][0]["validation"]["value_scope"]["statistics"] = ["receptions"]
        relabel(r)
        self.assertEqual(r["display_label"], "RESEARCH")
        r = scenario(3)
        r["projections"][0]["calibration"]["evidence_id"] = "scorecard"
        with self.assertRaisesRegex(E, "not a bare scorecard"):
            v2.validate_row(r)

    def test_accuracy_and_value_statuses_are_separate(self):
        self.assertFalse(set(v2.ACCURACY_STATUSES) & set(v2.VALUE_STATUSES))
        r = scenario(1)
        p = r["projections"][0]
        p["validation"]["accuracy_status"] = "ACCURACY_PROMOTED"
        with self.assertRaisesRegex(E, "promotion_decision"):
            v2.validate_row(r)
        p["validation"]["evidence"].append(syn.ev("promotion", "promotion_decision"))
        r["null_reasons"]["projections[0].validation.evidence[3].url"] = "pinned"
        v2.validate_row(r)  # accuracy promotion says nothing about value
        self.assertEqual(r["display_label"], "RESEARCH")
        r = scenario(1)
        r["projections"][0]["validation"]["value_scope"] = copy.deepcopy(syn.VALUE_SCOPE)
        r["null_reasons"] = {k: v for k, v in r["null_reasons"].items()}
        with self.assertRaisesRegex(E, "value_scope is null when the value is not tested"):
            v2.validate_row(r)
        r = scenario(1)
        r["projections"][0]["validation"]["value_status"] = "VALUE_REJECTED"
        with self.assertRaisesRegex(E, "value_scope"):
            v2.validate_row(r)


class RejectedAndBlockedTests(unittest.TestCase):
    def test_rejected_or_blocked_never_best_primary_sports_only_or_priced(self):
        r = scenario(1)
        r["projections"][0]["explorer_projection"]["validation"]["status"] = "REJECTED"
        r["projections"][0]["validation"]["accuracy_status"] = "ACCURACY_REJECTED"
        with self.assertRaisesRegex(E, "best_validated_projection_id names a ACCURACY_REJECTED"):
            v2.validate_row(r)
        r = scenario(4)
        for field in ("best_validated_projection_id", "primary_projection_id", "sports_only_projection_id"):
            t = copy.deepcopy(r)
            t[field] = "SYN_CHALLENGER_V1"
            t["null_reasons"].pop(field)
            with self.assertRaisesRegex(E, "BLOCKED_NOT_VALIDATED_POSTSEASON"):
                v2.validate_row(t)
        t = copy.deepcopy(r)
        t["market_evaluation"] = {**copy.deepcopy(syn.EVALUATION), "evaluated_projection_id": "SYN_CHALLENGER_V1",
                                  "rungs": []}
        t["null_reasons"].pop("market_evaluation")
        with self.assertRaisesRegex(E, "never priced"):
            v2.validate_row(t)

    def test_selection_must_be_the_highest_status(self):
        r = scenario(2)
        r["best_validated_projection_id"] = None
        r["null_reasons"]["best_validated_projection_id"] = "x"
        with self.assertRaisesRegex(E, "null although a projection has a validated accuracy status"):
            v2.validate_row(r)
        r = scenario(2)
        r["primary_projection_id"] = "SYN_SPORTS_V1"
        with self.assertRaisesRegex(E, "primary_projection_id must be the best validated"):
            v2.validate_row(r)
        r = scenario(2)
        r["sports_only_projection_id"] = "SYN_BEST_ACCURACY_V1"
        with self.assertRaisesRegex(E, "names a market-informed projection"):
            v2.validate_row(r)

    def test_postseason_label_and_strict_verdicts(self):
        r = scenario(4)
        chal = proj(r, "SYN_CHALLENGER_V1")
        chal["validation"]["accuracy_status"] = "ACCURACY_REJECTED"
        with self.assertRaisesRegex(E, "must be BLOCKED_NOT_VALIDATED_POSTSEASON: the strict preregistered rule"):
            v2.validate_row(r)
        r = scenario(1)
        r["projections"][0]["validation"]["accuracy_status"] = "BLOCKED_NOT_VALIDATED_POSTSEASON"
        with self.assertRaisesRegex(E, "not a v2 reading|postseason games only"):
            v2.validate_row(r)
        # A regular-season accepted status does not carry into a postseason game.
        r = scenario(1)
        r["game"]["season_type"] = "postseason"
        r["projections"][0]["explorer_projection"]["game"]["season_type"] = "postseason"
        with self.assertRaisesRegex(E, "does not cover"):
            v2.validate_row(r)


class ArithmeticTests(unittest.TestCase):
    fm = dict(syn.FEES)

    def test_kalshi_fee_matches_the_app_schedule(self):
        # ceil_cent(0.07 x P x (1-P)), as src/opportunity/pricing.ts kalshiFee.
        for price, fee in ((0.50, 0.02), (0.10, 0.01), (0.01, 0.01), (0.27, 0.02), (0.90, 0.01), (0.65, 0.02)):
            self.assertAlmostEqual(v2.fee_per_contract(price, self.fm), fee, places=9, msg=price)
        self.assertAlmostEqual(v2.fee_per_contract(0.5, {**self.fm, "rounding": "none"}), 0.0175, places=9)
        self.assertAlmostEqual(v2.fee_per_contract(0.3, {**self.fm, "name": "flat_per_contract", "rate": 0.01}), 0.01)

    def test_edge_and_bet_up_to(self):
        self.assertAlmostEqual(v2.edge_after_fees(0.62, 0.50, self.fm, 0.01), 0.09)
        self.assertEqual(v2.bet_up_to_price(0.70, self.fm, 0.01, 0.02), 0.65)
        self.assertIsNone(v2.bet_up_to_price(0.02, self.fm, 0.01, 0.02))
        r = scenario(3)
        rung = r["market_evaluation"]["rungs"][2]
        self.assertEqual((rung["at_least"], rung["side"], rung["executable_price"], rung["fee_per_contract"],
                          rung["edge_after_fees"], rung["spread"]), (60, "yes", 0.5, 0.02, 0.09, 0.02))
        for f, val in (("edge_after_fees", 0.2), ("bet_up_to_price", 0.6), ("model_probability", 0.7),
                       ("fee_per_contract", 0.0)):
            t = copy.deepcopy(r)
            t["market_evaluation"]["rungs"][2][f] = val
            with self.assertRaisesRegex(E, rf"rungs\[2\]\.{f} is"):
                v2.validate_row(t)

    def test_exact_strikes_only(self):
        r = scenario(1)
        r["market"]["quotes"][1]["at_least"] = 61
        with self.assertRaisesRegex(E, "no threshold at exactly 61"):
            v2.validate_row(r)

    def test_quote_rules(self):
        cases = ((lambda q: q.update(yes_bid=0.9), "yes_bid above yes_ask"),
                 (lambda q: q.update(yes_ask=1.0), r"price in \(0,1\)"),
                 (lambda q: q.update(observed_at="2026-10-18T17:00:00Z"), "after market.captured_at|not before kickoff"),
                 (lambda q: q.update(contract_ticker="lowercase"), "contract_ticker"))
        for mutate, msg in cases:
            r = scenario(1)
            mutate(r["market"]["quotes"][0])
            with self.assertRaisesRegex(E, msg):
                v2.validate_row(r)
        r = scenario(1)
        r["market"]["quotes"].reverse()
        with self.assertRaisesRegex(E, "strictly ascending"):
            v2.validate_row(r)


class FreshnessAndNullTests(unittest.TestCase):
    def test_freshness(self):
        r = scenario(1)
        r["freshness"]["inputs_max_observed_at"] = "2026-10-18T14:00:00Z"
        with self.assertRaisesRegex(E, "inputs_max_observed_at must be the latest"):
            v2.validate_row(r)
        r = scenario(1)
        r["freshness"]["kickoff_lead_seconds"] += 1
        with self.assertRaisesRegex(E, "kickoff_lead_seconds"):
            v2.validate_row(r)
        r = scenario(2)
        mi = proj(r, "SYN_BEST_ACCURACY_V1")
        mi["freshness"]["staleness_seconds"] = 0
        with self.assertRaisesRegex(E, "staleness_seconds"):
            v2.validate_row(r)
        r = scenario(1)
        r["identity"]["snapshot_at"] = r["freshness"]["snapshot_at"] = "2026-10-18T14:59:00Z"
        r["row_id"] = v2.row_id(r["identity"])
        with self.assertRaisesRegex(E, "after the row's snapshot_at"):
            v2.validate_row(r)

    def test_null_reasons(self):
        r = scenario(1)
        r["null_reasons"].pop("projections[0].game_script")
        with self.assertRaisesRegex(E, "projections\\[0\\].game_script is null without a reason"):
            v2.validate_row(r)
        r = scenario(1)
        r["null_reasons"]["market"] = "stale"
        with self.assertRaisesRegex(E, "not null"):
            v2.validate_row(r)
        r = scenario(1)
        r["null_reasons"]["projections[0].game_script"] = "a proven model"
        with self.assertRaisesRegex(E, "overstates"):
            v2.validate_row(r)

    def test_no_stake_or_recommendation_keys(self):
        for key in ("x_kelly_fraction", "x_recommended_stake", "x_pick"):
            r = scenario(3)
            r[key] = 0.1
            with self.assertRaisesRegex(E, "stake/recommendation key"):
                v2.validate_row(r)

    def test_unknown_fields_and_versions(self):
        r = scenario(1)
        r["edge_summary"] = 1
        with self.assertRaisesRegex(E, "unexpected fields"):
            v2.validate_row(r)
        r = scenario(1)
        r["schema_version"] = "prop_explorer_projection.v3"
        with self.assertRaisesRegex(E, "schema_version"):
            v2.validate_row(r)


class UpgradeAndCliTests(unittest.TestCase):
    def test_upgrade_refuses_unknown_model_and_unexplained_null(self):
        rows = gate.load_jsonl(EXAMPLES / "nba.prop_explorer_projection.v1.jsonl")
        ctx = json.loads((EXAMPLES / "contexts" / "v2.context.json").read_text())
        bad = copy.deepcopy(ctx)
        bad["models"].pop("sim_challenger")
        with self.assertRaisesRegex(E, "no entry for model_version 'sim_challenger'"):
            v2.upgrade(rows, bad)
        bad = copy.deepcopy(ctx)
        bad["null_reasons"].pop("market")
        with self.assertRaisesRegex(E, "market is null and the context gives no reason"):
            v2.upgrade(rows, bad)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "rows.jsonl"
            args = ["upgrade", "--projections", str(EXAMPLES / "mlb.prop_explorer_projection.v1.jsonl"),
                    "--context", str(EXAMPLES / "contexts" / "v2.context.json"), "--out", str(out)]
            with redirect_stdout(io.StringIO()):
                self.assertEqual(v2.main(args), 0)
            self.assertEqual(out.read_text(), (EXAMPLES / "mlb.prop_explorer_projection.v2.jsonl").read_text())
            with redirect_stderr(io.StringIO()) as err:
                self.assertEqual(v2.main(args), 2)
            self.assertIn("write-once", err.getvalue())
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(v2.main(["validate", "--rows", str(out)]), 0)
            self.assertTrue(json.loads(buf.getvalue())["passed"])


class SchemaAndTypesSyncTests(unittest.TestCase):
    schema = json.loads((ROOT / "schema" / "prop_explorer_projection.v2.schema.json").read_text())
    dts = (ROOT / "types" / "prop_explorer_projection.v2.d.ts").read_text()

    def test_schema_matches_runner(self):
        d = self.schema["$defs"]
        for name, fields in (("row", v2.ROW_FIELDS), ("identity", v2.ROW_IDENTITY_FIELDS),
                             ("projection", v2.PROJECTION_FIELDS), ("model", v2.MODEL_FIELDS),
                             ("model_provenance", v2.MODEL_PROVENANCE_FIELDS), ("market_input", v2.MARKET_INPUT_FIELDS),
                             ("outcome", v2.OUTCOME_FIELDS), ("matchup", v2.MATCHUP_FIELDS),
                             ("driver", v2.DRIVER_FIELDS), ("calibration", v2.CALIBRATION_FIELDS),
                             ("projection_freshness", v2.PROJECTION_FRESHNESS_FIELDS),
                             ("validation", v2.VALIDATION_FIELDS), ("market", v2.MARKET_FIELDS),
                             ("quote", v2.QUOTE_FIELDS), ("market_evaluation", v2.EVALUATION_FIELDS),
                             ("fee_model", v2.FEE_MODEL_FIELDS), ("evaluation_rung", v2.EVALUATION_RUNG_FIELDS),
                             ("row_freshness", v2.ROW_FRESHNESS_FIELDS)):
            self.assertEqual(d[name]["required"], list(fields), name)
            self.assertEqual(sorted(d[name]["properties"]), sorted(fields), name)
        vp = d["validation"]["properties"]
        self.assertEqual(vp["accuracy_status"]["enum"], list(v2.ACCURACY_STATUSES))
        self.assertEqual(vp["value_status"]["enum"], list(v2.VALUE_STATUSES))
        self.assertEqual(d["row"]["properties"]["display_label"]["enum"], list(v2.ROW_LABELS))
        self.assertEqual(d["evaluation_rung"]["properties"]["display_label"]["enum"], list(v2.RUNG_LABELS))
        self.assertEqual(d["evidence"]["properties"]["kind"]["enum"], list(v2.EVIDENCE_KINDS))

    def test_schema_validates_examples_when_jsonschema_is_available(self):
        try:
            import jsonschema
            from referencing import Registry, Resource
        except ImportError:
            self.skipTest("jsonschema not installed (the runner itself is stdlib-only)")
        docs = [json.loads((ROOT / "schema" / f"{n}.schema.json").read_text())
                for n in ("pure_forecast.v1", "prop_explorer_projection.v1")] + [self.schema]
        reg = Registry().with_resources([(s["$id"], Resource.from_contents(s)) for s in docs])
        validator = jsonschema.Draft202012Validator(self.schema, registry=reg)
        for name in ("mlb", "nfl", "nba"):
            for row in gate.load_jsonl(EXAMPLES / f"{name}.prop_explorer_projection.v2.jsonl"):
                validator.validate(row)
        for row in syn.build_synthetic():
            validator.validate(row)
        bad = scenario(1)
        bad["display_label"] = "PROFITABLE"
        self.assertFalse(validator.is_valid(bad))

    def interface(self, name):
        m = re.search(r"export interface %s \{(.*?)\n\}" % name, self.dts, re.S)
        self.assertIsNotNone(m, name)
        return set(re.findall(r"^  ([a-z_0-9]+)\??:", m.group(1), re.M))

    def test_typescript_declarations_match(self):
        for name, fields in (("PropExplorerRowV2", v2.ROW_FIELDS), ("RowIdentity", v2.ROW_IDENTITY_FIELDS),
                             ("ExplorerProjectionV2", v2.PROJECTION_FIELDS), ("ProjectionModel", v2.MODEL_FIELDS),
                             ("ModelProvenance", v2.MODEL_PROVENANCE_FIELDS),
                             ("MarketDerivedInput", v2.MARKET_INPUT_FIELDS), ("ProjectionOutcome", v2.OUTCOME_FIELDS),
                             ("ProjectionMatchup", v2.MATCHUP_FIELDS), ("ProjectionDriver", v2.DRIVER_FIELDS),
                             ("ProjectionCalibration", v2.CALIBRATION_FIELDS),
                             ("ProjectionFreshness", v2.PROJECTION_FRESHNESS_FIELDS),
                             ("ProjectionValidation", v2.VALIDATION_FIELDS), ("RowMarket", v2.MARKET_FIELDS),
                             ("KalshiQuote", v2.QUOTE_FIELDS), ("MarketEvaluation", v2.EVALUATION_FIELDS),
                             ("FeeModel", v2.FEE_MODEL_FIELDS), ("EvaluationRung", v2.EVALUATION_RUNG_FIELDS),
                             ("RowFreshness", v2.ROW_FRESHNESS_FIELDS)):
            self.assertEqual(self.interface(name), set(fields), name)
        for value in v2.ACCURACY_STATUSES + v2.VALUE_STATUSES + v2.ROW_LABELS + v2.RUNG_LABELS + v2.EVIDENCE_KINDS:
            self.assertIn(f"'{value}'", self.dts)


if __name__ == "__main__":
    unittest.main()
