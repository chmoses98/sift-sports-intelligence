"""accuracy_scorecard tests: known-answer metrics, PIT uniformity under calibration, CRPS identities,
accounting of missing captures, the pregame market-listed cohort, head-to-head CIs, breakdowns and the CLI.

All rows and numbers here are synthetic test fixtures, not sports results.
"""
import json
import math
import random
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import accuracy_scorecard as acc  # noqa: E402

PY = sys.executable
STAT = "receiving_yards"


def v1(game="g1", player="p1", mean=60.0, stat=STAT, cond=True, *, median=None, p10=None, p90=None,
       quantiles=None, thresholds=None, as_of="2026-10-11T15:00:00Z", kickoff="2026-10-11T17:00:00Z",
       x_capture=None, lineage_extra=None):
    row = {
        "schema_version": "pure_forecast.v1", "sport": "NFL", "game_id": game, "player_id": player,
        "statistic": stat, "as_of": as_of, "kickoff": kickoff,
        "source_max_observed_at": "2026-10-07T04:00:00Z", "projection_mode": "PURE_INDEPENDENT",
        "model_version": "TEST_V1", "model_frozen_hash": "sha256:" + "a" * 64,
        "conditional_on_playing": cond, "participation_probability": None,
        "projection": {"mean": mean, "median": mean - 2 if median is None else median,
                       "p10": mean - 30 if p10 is None else p10, "p90": mean + 30 if p90 is None else p90,
                       "thresholds": [{"at_least": 40.5, "probability": 0.70},
                                      {"at_least": 60.5, "probability": 0.48},
                                      {"at_least": 80.5, "probability": 0.25}]
                       if thresholds is None else thresholds},
        "sources": [{"source_id": "pbp", "class": "sports_only", "max_observed_at": "2026-10-07T04:00:00Z"}],
        "feature_lineage": [{"name": "targets_ewm", "value": 6.1, "source": "pbp",
                             "observed_at": "2026-10-07T04:00:00Z", "class": "sports_only"}],
    }
    if quantiles is not None:
        row["projection"]["quantiles"] = quantiles
    if x_capture is not None:
        row["x_capture"] = x_capture
    for name, value in (lineage_extra or {}).items():
        row["feature_lineage"].append({"name": name, "value": value, "source": "pbp",
                                       "observed_at": "2026-10-07T04:00:00Z", "class": "sports_only"})
    return row


def out(game="g1", actual=60.0, played=True, player="p1", stat=STAT):
    return {"sport": "NFL", "game_id": game, "player_id": player, "statistic": stat,
            "actual": actual, "played": played}


def stat_block(report, pop="full_eligible", stat=f"NFL:{STAT}"):
    return report["populations"][pop]["by_statistic"][stat]


def normal_row(game, player, mu, sigma, levels):
    nd = NormalDist(mu, sigma)
    qs = [{"q": q, "value": round(nd.inv_cdf(q), 9)} for q in levels]
    by = {round(q, 12): v["value"] for q, v in zip(levels, qs)}
    return v1(game, player, mean=mu, median=by[0.5], p10=by[0.1], p90=by[0.9], quantiles=qs, thresholds=[])


LEVELS = [round(0.05 * i, 2) for i in range(1, 20)]


class KnownAnswerTests(unittest.TestCase):
    def test_point_forecast_crps_equals_mae(self):
        rng = random.Random(3)
        rows, outs = [], []
        for i in range(60):
            x = round(rng.uniform(20, 90), 3)
            qs = [{"q": q, "value": x} for q in (0.25, 0.75)]
            rows.append(v1(f"g{i % 12}", f"p{i}", mean=x, median=x, p10=x, p90=x, quantiles=qs, thresholds=[]))
            outs.append(out(f"g{i % 12}", round(rng.uniform(0, 120), 3), player=f"p{i}"))
        r = acc.score(rows, outs, bootstrap=0)
        s = stat_block(r)["arms"]["challenger"]
        self.assertAlmostEqual(s["crps_quantile_approx"], s["mae"], places=6)
        for x, o in zip(rows, outs):
            f = acc.parse_forecasts([x], contract="pure_forecast", label="t")
            (fo,) = f.values()
            self.assertAlmostEqual(acc.pinball_crps(fo.levels, fo.levels, o["actual"]),
                                   abs(x["projection"]["mean"] - o["actual"]), places=9)

    def test_single_row_brier_log_rps_coverage(self):
        r = acc.score([v1(mean=60.0)], [out(actual=60.0)], bootstrap=0)
        s = stat_block(r)["arms"]["challenger"]
        lad = {x["at_least"]: x for x in s["ladder"]}
        # y = 60: hit 40.5 (p .70), miss 60.5 (p .48), miss 80.5 (p .25)
        self.assertAlmostEqual(lad[40.5]["brier"], 0.09, places=6)
        self.assertAlmostEqual(lad[60.5]["brier"], 0.2304, places=6)
        self.assertAlmostEqual(lad[80.5]["brier"], 0.0625, places=6)
        self.assertAlmostEqual(lad[40.5]["log_score"], -math.log(0.70), places=6)
        self.assertAlmostEqual(lad[60.5]["log_score"], -math.log(0.52), places=6)
        self.assertAlmostEqual(s["rps_mean"], 0.09 + 0.2304 + 0.0625, places=6)
        self.assertAlmostEqual(s["rps_normalized_mean"], (0.09 + 0.2304 + 0.0625) / 3, places=6)
        self.assertEqual(s["interval_coverage"]["p10_p90"]["observed"], 1.0)
        self.assertEqual(s["mae"], 0.0)
        self.assertEqual(s["bias_mean_minus_actual"], 0.0)
        self.assertEqual(s["mae_of_median"], 2.0)

    def test_log_score_clipping_is_counted(self):
        th = [{"at_least": 10.5, "probability": 1.0}]
        r = acc.score([v1(thresholds=th)], [out(actual=5.0)], bootstrap=0)
        lad = stat_block(r)["arms"]["challenger"]["ladder"][0]
        self.assertEqual(lad["n_log_clipped"], 1)
        self.assertAlmostEqual(lad["log_score"], -math.log(acc.LOG_EPS), places=4)

    def test_interval_pairs_and_quantile_calibration(self):
        qs = [{"q": 0.25, "value": 50.0}, {"q": 0.75, "value": 70.0}]
        rows = [v1("g1", "p1", mean=60, median=60, p10=40, p90=80, quantiles=qs),
                v1("g1", "p2", mean=60, median=60, p10=40, p90=80, quantiles=qs)]
        r = acc.score(rows, [out("g1", 55, player="p1"), out("g1", 85, player="p2")], bootstrap=0)
        s = stat_block(r)["arms"]["challenger"]
        self.assertEqual(s["interval_coverage"]["p10_p90"]["observed"], 0.5)
        self.assertEqual(s["interval_coverage"]["q0.25_q0.75"], {"nominal": 0.5, "observed": 0.5, "n": 2})
        qc = {x["q"]: x for x in s["quantile_calibration"]}
        self.assertEqual(qc[0.5]["frac_actual_below"], 0.5)
        self.assertEqual(qc[0.9]["frac_actual_below"], 0.5)

    def test_chi2_sf_reference_values(self):
        self.assertAlmostEqual(acc.chi2_sf(16.918978, 9), 0.05, places=5)
        self.assertAlmostEqual(acc.chi2_sf(2.087901, 9), 0.99, places=5)
        self.assertAlmostEqual(acc.chi2_sf(3.841459, 1), 0.05, places=5)
        self.assertEqual(acc.chi2_sf(0.0, 4), 1.0)


class CalibrationTests(unittest.TestCase):
    def _normal_world(self, n, sigma_forecast, seed=11):
        rng = random.Random(seed)
        rows, outs = [], []
        for i in range(n):
            mu = rng.uniform(30, 90)
            rows.append(normal_row(f"g{i // 8}", f"p{i}", mu, sigma_forecast, LEVELS))
            outs.append(out(f"g{i // 8}", rng.gauss(mu, 20.0), player=f"p{i}"))
        return rows, outs

    def test_perfectly_calibrated_pit_is_uniform(self):
        rows, outs = self._normal_world(4000, 20.0)
        pit = stat_block(acc.score(rows, outs, bootstrap=0))["arms"]["challenger"]["pit"]
        for h in pit["histogram_fraction"]:
            self.assertAlmostEqual(h, 0.1, delta=0.02)
        self.assertGreater(pit["p_value_iid"], 0.01)
        self.assertAlmostEqual(pit["pit_mean"], 0.5, delta=0.02)
        self.assertEqual(pit["n_inconsistent_knots"], 0)
        cov = stat_block(acc.score(rows, outs, bootstrap=0))["arms"]["challenger"]["interval_coverage"]
        self.assertAlmostEqual(cov["p10_p90"]["observed"], 0.8, delta=0.03)

    def test_overconfident_forecasts_fail_uniformity(self):
        rows, outs = self._normal_world(4000, 10.0)
        s = stat_block(acc.score(rows, outs, bootstrap=0))["arms"]["challenger"]
        pit = s["pit"]
        self.assertLess(pit["p_value_iid"], 1e-6)
        self.assertGreater(pit["histogram_fraction"][0], 0.15)  # U-shaped
        self.assertGreater(pit["histogram_fraction"][-1], 0.15)
        self.assertLess(s["interval_coverage"]["p10_p90"]["observed"], 0.6)

    def test_discrete_poisson_ladder_pit_uniform_and_ladder_crps_exact(self):
        lam = 4.2
        pmf = [math.exp(-lam) * lam ** k / math.factorial(k) for k in range(40)]
        cdf = [sum(pmf[:k + 1]) for k in range(40)]

        def quant(q):
            return float(next(k for k in range(40) if cdf[k] >= q))
        ladder = [{"at_least": k + 0.5, "probability": round(1 - cdf[k], 12)} for k in range(25)]
        rng = random.Random(5)
        rows, outs = [], []
        for i in range(3000):
            u, y = rng.random(), 0
            while cdf[y] < u:
                y += 1
            rows.append(v1(f"g{i // 6}", f"p{i}", mean=lam, median=quant(0.5), p10=quant(0.1), p90=quant(0.9),
                           thresholds=ladder, stat="receptions"))
            outs.append(out(f"g{i // 6}", float(y), player=f"p{i}", stat="receptions"))
        s = stat_block(acc.score(rows, outs, bootstrap=0), stat="NFL:receptions")["arms"]["challenger"]
        for h in s["pit"]["histogram_fraction"]:
            self.assertAlmostEqual(h, 0.1, delta=0.025)
        self.assertGreater(s["pit"]["p_value_iid"], 0.001)
        # ladder CRPS == exact discrete CRPS: sum_k (F(k) - 1{y <= k})^2
        f = next(iter(acc.parse_forecasts([rows[0]], contract="pure_forecast", label="t").values()))
        for y in (0.0, 3.0, 4.0, 11.0):
            exact = sum((cdf[k] - (1.0 if y <= k else 0.0)) ** 2 for k in range(40))
            self.assertAlmostEqual(acc.ladder_crps(f.ladder, sorted(f.ladder), y), exact, places=9)
        # per-rung reliability: observed frequency tracks the probability
        for rung in s["ladder"][:8]:
            self.assertAlmostEqual(rung["observed_frequency"], rung["mean_probability"], delta=0.03)


class AccountingAndCohortTests(unittest.TestCase):
    def test_missing_forecasts_outcomes_and_dnp_are_counted(self):
        rows = [v1("g1", "p1"), v1("g1", "p2"), v1("g2", "p3")]
        outs = [out("g1", 50, player="p1"), out("g1", 0, played=False, player="p2"),
                out("g2", 40, player="p4")]  # p3: no outcome; p4: no forecast
        eligible = [{"sport": "NFL", "game_id": g, "player_id": p, "statistic": STAT}
                    for g, p in (("g1", "p1"), ("g1", "p2"), ("g2", "p3"), ("g2", "p4"), ("g3", "p5"))]
        r = acc.score(rows, outs, eligible_rows=eligible, bootstrap=0)
        a = r["populations"]["full_eligible"]["accounting"]["arms"]["challenger"]
        self.assertEqual(a["eligible_identities"], 5)
        self.assertEqual(a["missing_forecast"], 2)          # p4 (outcome, no forecast) and p5 (nothing)
        self.assertEqual(a["missing_forecast_with_outcome"], 1)
        self.assertEqual(a["forecast_rows_missing_outcome"], 1)
        self.assertEqual(a["conditional_dnp_excluded"], 1)
        self.assertEqual(a["scored_rows"], 1)
        self.assertIn(["NFL", "g3", "p5", STAT], a["missing_forecast_examples"])
        self.assertEqual(stat_block(r)["arms"]["challenger"]["n_rows"], 1)

    def test_without_eligible_list_outcomes_define_missing_forecasts(self):
        r = acc.score([v1("g1", "p1")], [out("g1", 50, player="p1"), out("g1", 50, player="p9")], bootstrap=0)
        a = r["populations"]["full_eligible"]["accounting"]["arms"]["challenger"]
        self.assertEqual(a["missing_forecast"], 1)
        self.assertIn("invisible", r["config"]["eligible_population"])

    def test_unconditional_dnp_is_scored(self):
        r = acc.score([v1(cond=False)], [out(actual=0.0, played=False)], bootstrap=0)
        self.assertEqual(stat_block(r)["arms"]["challenger"]["n_rows"], 1)

    def test_pregame_cohort_requires_open_and_observed_at_or_before_as_of(self):
        rows = [v1("g1", "p1"), v1("g1", "p2"), v1("g1", "p3"), v1("g1", "p4")]
        outs = [out("g1", 50, player=p) for p in ("p1", "p2", "p3", "p4")]
        mk = lambda p, opened, seen: {"sport": "NFL", "game_id": "g1", "player_id": p, "statistic": STAT,  # noqa
                                      "open_time": opened, "observed_at": seen, "ticker": f"T-{p}"}
        market = [mk("p1", "2026-10-10T12:00:00Z", "2026-10-11T14:00:00Z"),   # listed
                  mk("p2", "2026-10-10T12:00:00Z", "2026-10-11T15:30:00Z"),   # only seen after as_of
                  mk("p3", "2026-10-11T16:00:00Z", "2026-10-11T14:00:00Z"),   # opens after as_of
                  {"game_id": "g1", "player_id": "p4", "statistic": STAT, "observed_at": "2026-10-11T14:00:00Z"}]
        r = acc.score(rows, outs, market_rows=market, bootstrap=0)
        cohort = r["populations"]["pregame_market_listed"]
        self.assertEqual(cohort["accounting"]["arms"]["challenger"]["scored_rows"], 1)
        self.assertEqual(stat_block(r, "pregame_market_listed")["arms"]["challenger"]["n_rows"], 1)
        self.assertEqual(stat_block(r)["arms"]["challenger"]["n_rows"], 4)
        self.assertEqual(r["config"]["market_family"]["rows_without_open_time_or_observed_at"], 1)

    def test_no_market_family_means_no_cohort(self):
        r = acc.score([v1()], [out()], bootstrap=0)
        self.assertNotIn("pregame_market_listed", r["populations"])

    def test_duplicates_and_contract_violations_are_refused(self):
        with self.assertRaises(acc.ScorecardError):
            acc.score([v1(), v1()], [out()])
        bad = v1()
        bad["x_kalshi_price"] = 0.5
        with self.assertRaises(acc.ScorecardError):
            acc.score([bad], [out()])
        with self.assertRaises(acc.ScorecardError):
            acc.score([v1()], [out(), out()])

    def test_multiple_capture_times_are_distinct_rows(self):
        rows = [v1(as_of="2026-10-11T15:00:00Z"), v1(as_of="2026-10-10T15:00:00Z")]
        r = acc.score(rows, [out()], bootstrap=0, breakdowns=dict([acc.parse_breakdown_spec("capture_window")]))
        a = r["populations"]["full_eligible"]["accounting"]["arms"]["challenger"]
        self.assertEqual(a["identities_with_multiple_capture_times"], 1)
        self.assertEqual(a["scored_rows"], 2)
        bd = r["populations"]["full_eligible"]["breakdowns"]["capture_window"][f"NFL:{STAT}"]
        self.assertEqual(sorted(bd), ["24h_72h", "le_2h"])


class HeadToHeadTests(unittest.TestCase):
    def _world(self, n_games=30, per_game=6, seed=7):
        rng = random.Random(seed)
        chal, champ, outs = [], [], []
        for g in range(n_games):
            for j in range(per_game):
                mu = rng.uniform(30, 90)
                y = mu + rng.gauss(0, 15)
                gid, pid = f"g{g}", f"p{g}_{j}"
                chal.append(v1(gid, pid, mean=mu, median=mu, p10=mu - 19, p90=mu + 19))
                champ.append(v1(gid, pid, mean=mu + 12, median=mu + 12, p10=mu - 7, p90=mu + 31))
                outs.append(out(gid, y, player=pid))
        return chal, champ, outs

    def test_identical_arms_give_zero_deltas(self):
        chal, _, outs = self._world()
        r = acc.score(chal, outs, comparators={"champion": {"rows": chal, "role": "production_champion"}},
                      bootstrap=200)
        h = stat_block(r)["head_to_head"]["champion"]
        self.assertEqual(h["n_pairs"], len(chal))
        for m, d in h["deltas_challenger_minus_comparator"].items():
            self.assertEqual(d["delta"], 0.0, m)
            self.assertEqual(d["ci95_game_clustered"], [0.0, 0.0], m)

    def test_better_challenger_detected_with_game_and_player_clusters(self):
        chal, champ, outs = self._world()
        r = acc.score(chal, outs, comparators={"champion": {"rows": champ, "role": "production_champion"}},
                      cluster_by=("game", "player"), bootstrap=300)
        h = stat_block(r)["head_to_head"]["champion"]
        d = h["deltas_challenger_minus_comparator"]
        self.assertLess(d["abs"]["delta"], 0)
        self.assertLess(d["abs"]["ci95_game_clustered"][1], 0)
        self.assertEqual(d["abs"]["reading_game_clustered"], "CHALLENGER_LOWER_LOSS")
        self.assertIn("ci95_player_clustered", d["crps_q"])
        self.assertEqual(h["status"], "DESCRIPTIVE_ONLY_NOT_AUTOMATIC_PROMOTION")
        self.assertIn("rmse", h)

    def test_bootstrap_is_deterministic_given_seed(self):
        chal, champ, outs = self._world(n_games=10)
        comps = {"champion": {"rows": champ, "role": "production_champion"}}
        a = acc.score(chal, outs, comparators=comps, bootstrap=100, seed=1)
        b = acc.score(chal, outs, comparators=comps, bootstrap=100, seed=1)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_pairing_requires_same_as_of_and_conditionality(self):
        chal = [v1("g1", "p1"), v1("g1", "p2"), v1("g1", "p3")]
        comp = [v1("g1", "p1", as_of="2026-10-11T14:00:00Z"), v1("g1", "p2", cond=False)]
        outs = [out("g1", 50, player=p) for p in ("p1", "p2", "p3")]
        r = acc.score(chal, outs, comparators={"base": {"rows": comp, "role": "statistical_baseline"}},
                      bootstrap=0)
        pa = r["populations"]["full_eligible"]["head_to_head_pairing"]["base"]
        self.assertEqual(pa, {"comparator_has_identity_at_other_as_of": 1, "comparator_missing": 1,
                              "conditionality_mismatch_excluded": 1, "paired": 0})

    def test_market_informed_benchmark_uses_projection_only_contract(self):
        bench = {"sport": "NFL", "game_id": "g1", "player_id": "p1", "statistic": STAT,
                 "as_of": "2026-10-11T15:00:00Z", "conditional_on_playing": True, "x_market_center": 61.5,
                 "projection": {"mean": 61.0, "median": 60.0, "p10": 35.0, "p90": 88.0,
                                "thresholds": [{"at_least": 60.5, "probability": 0.5}]}}
        r = acc.score([v1()], [out(actual=70)],
                      comparators={"mkt": {"rows": [bench], "role": "market_informed_benchmark"}}, bootstrap=0)
        h = stat_block(r)["head_to_head"]["mkt"]
        self.assertEqual(h["n_pairs"], 1)
        self.assertIn("PRICE_OF_INDEPENDENCE", h["note"])
        self.assertEqual(h["n_pairs_with_common_ladder"], 1)
        # brier on the one common rung only: challenger .48 vs benchmark .5, y = 70 >= 60.5
        self.assertAlmostEqual(h["deltas_challenger_minus_comparator"]["brier"]["delta"],
                               (0.48 - 1) ** 2 - (0.5 - 1) ** 2, places=6)
        self.assertEqual(r["config"]["arms"]["mkt"]["contract"], "projection_only")


class BreakdownTests(unittest.TestCase):
    def test_path_lineage_and_binned_breakdowns(self):
        rows, outs = [], []
        for i in range(12):
            pos = "WR" if i % 2 else "TE"
            rows.append(v1(f"g{i % 4}", f"p{i}", x_capture={"position": pos},
                           lineage_extra={"exp_snap_share": 0.2 + 0.06 * i}))
            outs.append(out(f"g{i % 4}", 55, player=f"p{i}"))
        bks = dict(acc.parse_breakdown_spec(s) for s in
                   ("position=x_capture.position", "workload=lineage.exp_snap_share|bins=0.4,0.6",
                    "matchup=x_capture.matchup_tier"))
        bks["custom"] = lambda ctx: "even" if int(ctx["forecast"]["player_id"][1:]) % 2 == 0 else "odd"
        r = acc.score(rows, outs, breakdowns=bks, bootstrap=0)
        b = r["populations"]["full_eligible"]["breakdowns"]
        pos = b["position"][f"NFL:{STAT}"]
        self.assertEqual({k: v["arms"]["challenger"]["n_rows"] for k, v in pos.items()}, {"TE": 6, "WR": 6})
        wl = b["workload"][f"NFL:{STAT}"]
        self.assertEqual(sum(v["arms"]["challenger"]["n_rows"] for v in wl.values()), 12)
        self.assertEqual(set(wl), {"lt_0.4", "0.4_to_0.6", "ge_0.6"})
        self.assertEqual(list(b["matchup"][f"NFL:{STAT}"]), ["UNKNOWN"])
        self.assertEqual(set(b["custom"][f"NFL:{STAT}"]), {"even", "odd"})

    def test_bad_spec_refused(self):
        with self.assertRaises(acc.ScorecardError):
            acc.parse_breakdown_spec("x=a.b|width=3")


class CliTests(unittest.TestCase):
    def test_cli_score_end_to_end_isolated_mode(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            rows = [v1(f"g{i % 5}", f"p{i}", mean=50 + i) for i in range(20)]
            champ = [v1(f"g{i % 5}", f"p{i}", mean=58 + i) for i in range(20)]
            outs = [out(f"g{i % 5}", 52 + i, player=f"p{i}") for i in range(20)]
            market = [{"sport": "NFL", "game_id": "g0", "player_id": "p0", "statistic": STAT,
                       "open_time": "2026-10-10T00:00:00Z", "observed_at": "2026-10-11T14:00:00Z"}]
            for name, data in (("c.jsonl", rows), ("ch.jsonl", champ), ("o.jsonl", outs), ("m.jsonl", market)):
                (d / name).write_text("".join(json.dumps(x) + "\n" for x in data))
            res = subprocess.run([PY, "-I", str(ROOT / "accuracy_scorecard.py"), "score",
                                  "--challenger", str(d / "c.jsonl"), "--champion", str(d / "ch.jsonl"),
                                  "--outcomes", str(d / "o.jsonl"), "--market", str(d / "m.jsonl"),
                                  "--breakdown", "capture_window", "--bootstrap", "50",
                                  "--output", str(d / "r.json")], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, res.stderr)
            rep = json.loads((d / "r.json").read_text())
            self.assertEqual(rep["version"], acc.VERSION)
            self.assertEqual(rep["gate"], "pure_gate 1.0.0")
            self.assertEqual(rep["populations"]["full_eligible"]["by_statistic"][f"NFL:{STAT}"]
                             ["head_to_head"]["champion"]["n_pairs"], 20)
            self.assertEqual(rep["populations"]["pregame_market_listed"]["accounting"]["arms"]["challenger"]
                             ["scored_rows"], 1)
            # config file form, relative paths resolved against the config's directory
            (d / "cfg.json").write_text(json.dumps({"challenger": "c.jsonl", "outcomes": "o.jsonl",
                                                    "bootstrap": 0}))
            res = subprocess.run([PY, "-I", str(ROOT / "accuracy_scorecard.py"), "score",
                                  "--config", str(d / "cfg.json")], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertEqual(json.loads(res.stdout)["config"]["bootstrap"], 0)
            res = subprocess.run([PY, "-I", str(ROOT / "accuracy_scorecard.py"), "score",
                                  "--challenger", str(d / "c.jsonl")], capture_output=True, text=True)
            self.assertEqual(res.returncode, 2)


if __name__ == "__main__":
    unittest.main()
