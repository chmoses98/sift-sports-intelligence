"""value_scorecard tests: Kalshi fee known answers, executable prices, bet-up-to, the never-later-quote rule,
one decision per player-game-stat, hindsight guards, CLV cutoffs, verdicts and the CLI.

All rows and numbers here are synthetic test fixtures, not market or sports results.
"""
import json
import random
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import value_scorecard as vs  # noqa: E402

PY = sys.executable
AS_OF = "2026-10-11T15:00:00Z"
KICK = "2026-10-11T17:00:00Z"
STAT = "receiving_yards"


def prob(game="g1", player="p1", at_least=50.0, p_yes=0.6, as_of=AS_OF, stat=STAT, **extra):
    return {"sport": "NFL", "game_id": game, "player_id": player, "statistic": stat, "at_least": at_least,
            "as_of": as_of, "kickoff": KICK, "p_yes": p_yes, **extra}


def quote(game="g1", player="p1", at_least=50.0, bid=0.48, ask=0.50, observed="2026-10-11T14:50:00Z",
          opened="2026-10-10T12:00:00Z", stat=STAT, ticker=None, **extra):
    return {"sport": "NFL", "game_id": game, "player_id": player, "statistic": stat, "at_least": at_least,
            "observed_at": observed, "open_time": opened, "yes_bid": bid, "yes_ask": ask,
            "ticker": ticker or f"KXNFLRECYDS-{game}-{player}-{int(at_least)}", **extra}


def out(game="g1", player="p1", actual=60.0, played=True, stat=STAT):
    return {"sport": "NFL", "game_id": game, "player_id": player, "statistic": stat, "actual": actual,
            "played": played}


class FeeTests(unittest.TestCase):
    def test_known_taker_fees(self):
        self.assertEqual(vs.kalshi_fee(Decimal("0.50")), Decimal("0.02"))      # 0.0175 -> 2c
        self.assertEqual(vs.kalshi_fee(Decimal("0.29")), Decimal("0.02"))      # 0.014413 -> 2c
        self.assertEqual(vs.kalshi_fee(Decimal("0.50"), 100), Decimal("1.75"))  # exactly $1.75
        self.assertEqual(vs.kalshi_fee(Decimal("0.29"), 10), Decimal("0.15"))   # 0.14413 -> 15c
        self.assertEqual(vs.kalshi_fee(Decimal("0.01")), Decimal("0.01"))       # minimum one cent
        self.assertEqual(vs.kalshi_fee(Decimal("0.0")), Decimal("0"))
        self.assertEqual(vs.kalshi_fee(Decimal("1.0")), Decimal("0"))

    def test_exact_decimal_no_float_overcharge(self):
        # 0.07 x 100 x 0.1 x 0.9 = 0.63 exactly; binary floating point would round up to 0.64
        self.assertEqual(vs.kalshi_fee(0.1, 100), Decimal("0.63"))
        self.assertEqual(vs.kalshi_fee(Decimal("0.1"), 100, rounding="none"), Decimal("0.630"))

    def test_maker_and_multiplier(self):
        self.assertEqual(vs.kalshi_fee(Decimal("0.50"), role="maker"), Decimal("0.01"))      # 0.004375
        self.assertEqual(vs.kalshi_fee(Decimal("0.50"), 100, role="maker"), Decimal("0.44"))  # 0.4375
        self.assertEqual(vs.kalshi_fee(Decimal("0.50"), 100, multiplier=Decimal("0.5")), Decimal("0.88"))
        with self.assertRaises(vs.ScorecardError):
            vs.kalshi_fee(0.5, role="whale")

    def test_constants_match_the_shared_schedule(self):
        self.assertEqual(vs.KALSHI_TAKER_COEFFICIENT, Decimal("0.07"))
        self.assertEqual(vs.KALSHI_MAKER_COEFFICIENT, Decimal("0.0175"))

    def test_bet_up_to(self):
        fm = vs.FeeModel()
        # p = .60: at .58 the cost is .58 + .02 = .60 (EV 0); at .59 it is .61
        self.assertEqual(fm.bet_up_to(0.60), 0.58)
        self.assertIsNone(fm.bet_up_to(0.01))
        self.assertEqual(vs.FeeModel(slippage=0.01).bet_up_to(0.60), 0.57)
        self.assertEqual(fm.cost(0.50), (0.5, 0.02, 0.52))
        self.assertIsNone(fm.cost(1.0))

    def test_per_contract_fee_amortizes_over_order(self):
        self.assertAlmostEqual(vs.FeeModel(contracts=100).fee_per_contract(0.5), 0.0175)
        self.assertAlmostEqual(vs.FeeModel(contracts=1).fee_per_contract(0.5), 0.02)


class PriceAndQuoteTests(unittest.TestCase):
    def test_executable_side_prices(self):
        self.assertEqual(vs.side_price("YES", 0.40, 0.45), 0.45)
        self.assertEqual(vs.side_price("NO", 0.40, 0.45), 0.60)   # 100 - bid
        self.assertIsNone(vs.side_price("NO", None, 0.45))
        self.assertIsNone(vs.side_price("NO", 0.0, 0.45))
        self.assertIsNone(vs.side_price("YES", 0.40, None))

    def test_cents_units(self):
        q = {"yes_bid_cents": 41, "yes_ask_cents": 44}
        self.assertEqual(vs.quote_prices(q), (0.41, 0.44))
        self.assertEqual(vs.quote_prices({"yes_bid": "0.41", "yes_ask": "0.44"}), (0.41, 0.44))
        self.assertEqual(vs.quote_prices({"yes_bid": 41, "yes_ask": 44, "price_unit": "cents"}), (0.41, 0.44))
        with self.assertRaises(vs.ScorecardError):
            vs.quote_prices({"yes_bid": 0.5, "yes_ask": 0.4})

    def test_edge_after_fees_and_spread(self):
        r = vs.evaluate([prob(p_yes=0.6)], [quote(bid=0.48, ask=0.50)], [out(actual=60)], bootstrap=0,
                        include_decisions=True)
        (d,) = r["decisions"]
        self.assertEqual(d["side"], "YES")
        self.assertEqual(d["executed_price"], 0.5)
        self.assertEqual(d["fee_per_contract"], 0.02)
        self.assertAlmostEqual(d["edge_after_fees"], 0.08)
        self.assertAlmostEqual(d["edge_before_fees"], 0.10)
        self.assertAlmostEqual(d["spread"], 0.02)
        self.assertEqual(d["bet_up_to"], 0.58)
        self.assertAlmostEqual(d["return"], 1 - 0.52)
        self.assertAlmostEqual(r["decisions_summary"]["roi_after_fees"], 0.48 / 0.52, places=6)

    def test_no_side_bought_at_one_minus_bid(self):
        r = vs.evaluate([prob(p_yes=0.2)], [quote(bid=0.40, ask=0.45)], [out(actual=10)], bootstrap=0,
                        include_decisions=True)
        (d,) = r["decisions"]
        self.assertEqual(d["side"], "NO")
        self.assertEqual(d["quoted_price"], 0.6)
        self.assertAlmostEqual(d["cost_per_contract"], 0.62)
        self.assertEqual(d["won"], 1.0)

    def test_slippage_raises_price(self):
        r = vs.evaluate([prob(p_yes=0.6)], [quote(ask=0.50)], [out()], fees=vs.FeeModel(slippage=0.02),
                        bootstrap=0, include_decisions=True)
        self.assertEqual(r["decisions"][0]["executed_price"], 0.52)


class AntiHindsightTests(unittest.TestCase):
    def test_entry_never_uses_a_quote_after_as_of(self):
        qs = [quote(ask=0.55, observed="2026-10-11T14:00:00Z"),
              quote(bid=0.28, ask=0.30, observed="2026-10-11T15:00:01Z")]  # better price one second late
        r = vs.evaluate([prob(p_yes=0.6)], qs, [out()], bootstrap=0, include_decisions=True)
        (d,) = r["decisions"]
        self.assertEqual(d["executed_price"], 0.55)
        self.assertEqual(d["quote_observed_at"], "2026-10-11T14:00:00Z")
        self.assertEqual(r["accounting"]["quotes_after_as_of_ignored_for_entry"], 1)
        # only a later quote -> no decision, and it is counted
        r = vs.evaluate([prob(p_yes=0.6)], qs[1:], [out()], bootstrap=0)
        self.assertEqual(r["accounting"]["decisions"], 0)
        self.assertEqual(r["accounting"]["rungs_without_quote_at_or_before_as_of"], 1)

    def test_quote_at_exactly_as_of_is_allowed_and_unopened_market_is_not(self):
        r = vs.evaluate([prob()], [quote(observed=AS_OF)], [out()], bootstrap=0)
        self.assertEqual(r["accounting"]["decisions"], 1)
        r = vs.evaluate([prob()], [quote(opened="2026-10-11T15:30:00Z")], [out()], bootstrap=0)
        self.assertEqual(r["accounting"]["decisions"], 0)
        r = vs.evaluate([prob()], [quote(observed="2026-10-11T10:00:00Z")], [out()], bootstrap=0,
                        max_quote_age_seconds=3600)
        self.assertEqual(r["accounting"]["rungs_with_only_stale_quote"], 1)
        late = dict(prob(), kickoff=None)
        r = vs.evaluate([late], [quote(kickoff="2026-10-11T14:59:00Z", observed="2026-10-11T14:00:00Z")],
                        [out()], bootstrap=0)
        self.assertEqual(r["accounting"]["rungs_at_or_after_kickoff_excluded"], 1)

    def test_one_decision_per_player_game_stat_best_edge(self):
        ps = [prob(at_least=a, p_yes=p) for a, p in ((30.0, 0.80), (50.0, 0.60), (70.0, 0.35))]
        qs = [quote(at_least=30.0, bid=0.70, ask=0.72), quote(at_least=50.0, bid=0.46, ask=0.48),
              quote(at_least=70.0, bid=0.30, ask=0.33)]
        r = vs.evaluate(ps, qs, [out(actual=55)], bootstrap=0, include_decisions=True)
        self.assertEqual(r["accounting"]["decisions"], 1)
        self.assertEqual(r["decisions"][0]["at_least"], 50.0)  # EV .60 - .50 = .10 is the best
        self.assertEqual(r["config"]["decision_unit"], "one decision per (sport, game_id, player_id, statistic)")

    def test_selection_is_invariant_to_outcomes(self):
        rng = random.Random(2)
        ps, qs, o1, o2 = [], [], [], []
        for g in range(10):
            for j in range(3):
                pid = f"p{g}_{j}"
                for a in (20.0, 40.0, 60.0):
                    p = rng.uniform(0.1, 0.9)
                    m = min(0.97, max(0.03, p + rng.uniform(-0.15, 0.15)))
                    ps.append(prob(f"g{g}", pid, a, round(p, 4)))
                    qs.append(quote(f"g{g}", pid, a, bid=round(m - 0.02, 2), ask=round(m, 2)))
                o1.append(out(f"g{g}", pid, actual=rng.uniform(0, 80)))
                o2.append(out(f"g{g}", pid, actual=80 - o1[-1]["actual"]))
        a = vs.evaluate(ps, qs, o1, bootstrap=0, include_decisions=True)
        b = vs.evaluate(ps, qs, o2, bootstrap=0, include_decisions=True)
        key = lambda r: [(d["game_id"], d["player_id"], d["at_least"], d["side"]) for d in r["decisions"]]  # noqa
        self.assertEqual(key(a), key(b))
        self.assertNotEqual(a["decisions_summary"]["total_return"], b["decisions_summary"]["total_return"])

    def test_rule_cannot_see_outcomes(self):
        def peeking(cands):
            return max(cands, key=lambda c: c.actual)
        with self.assertRaises(vs.HindsightError):
            vs.evaluate([prob()], [quote()], [out()], rule=peeking, bootstrap=0)

        def closing_peek(cands):
            return cands[0] if cands[0].clv_mid > 0 else None
        with self.assertRaises(vs.HindsightError):
            vs.evaluate([prob()], [quote()], [out()], rule=closing_peek, bootstrap=0)

    def test_rule_must_return_an_offered_candidate_and_be_deterministic(self):
        with self.assertRaises(vs.HindsightError):
            vs.evaluate([prob()], [quote()], [out()], rule=lambda c: vs.CandidateView(**c[0].to_dict()),
                        bootstrap=0)
        flip = {"n": 0}

        def flaky(cands):
            flip["n"] += 1
            return cands[0] if flip["n"] % 2 else None
        with self.assertRaises(vs.HindsightError):
            vs.evaluate([prob()], [quote()], [out()], rule=flaky, bootstrap=0)

    def test_views_are_immutable(self):
        v = vs.CandidateView(**{f: None for f in vs._VIEW_FIELDS})
        with self.assertRaises(vs.HindsightError):
            v.probability = 1.0

    def test_as_of_policy_and_calibration_fit_end(self):
        ps = [prob(p_yes=0.6, as_of="2026-10-11T15:00:00Z"), prob(p_yes=0.9, as_of="2026-10-11T16:00:00Z")]
        qs = [quote(ask=0.50, observed="2026-10-11T14:00:00Z"), quote(ask=0.52, observed="2026-10-11T15:30:00Z")]
        r = vs.evaluate(ps, qs, [out()], bootstrap=0, include_decisions=True)
        self.assertEqual(r["decisions"][0]["as_of"], "2026-10-11T15:00:00Z")
        self.assertEqual(r["accounting"]["rungs_at_other_as_of_dropped"], 1)
        r = vs.evaluate(ps, qs, [out()], bootstrap=0, as_of_policy="latest", include_decisions=True)
        self.assertEqual(r["decisions"][0]["executed_price"], 0.52)
        with self.assertRaises(vs.ScorecardError):
            vs.evaluate(ps, qs, [out()], bootstrap=0, as_of_policy="unique")
        r = vs.evaluate(ps, qs, [out()], bootstrap=0, calibration_fit_end="2026-10-11T15:00:00Z")
        self.assertEqual(r["accounting"]["rungs_in_sample_excluded"], 1)
        self.assertEqual(r["accounting"]["decisions"], 0)


class ClvTests(unittest.TestCase):
    def test_clv_uses_only_pre_close_quotes(self):
        qs = [quote(bid=0.48, ask=0.50, observed="2026-10-11T14:50:00Z"),
              quote(bid=0.58, ask=0.60, observed="2026-10-11T16:59:00Z"),
              quote(bid=0.98, ask=0.99, observed="2026-10-11T17:30:00Z")]  # in-game, after kickoff
        r = vs.evaluate([prob(p_yes=0.6)], qs, [out()], bootstrap=0, include_decisions=True)
        (d,) = r["decisions"]
        self.assertEqual(d["closing_quote_observed_at"], "2026-10-11T16:59:00Z")
        self.assertAlmostEqual(d["clv_mid"], 0.59 - 0.50)
        self.assertAlmostEqual(d["clv_executable"], 0.60 - 0.50)
        self.assertEqual(r["closing_line_value"]["role"], "DIAGNOSTIC_ONLY_NOT_IN_VERDICT")
        # close_time earlier than kickoff tightens the cutoff
        qs2 = [dict(q, close_time="2026-10-11T16:00:00Z") for q in qs]
        r = vs.evaluate([prob(p_yes=0.6)], qs2, [out()], bootstrap=0, include_decisions=True)
        self.assertIsNone(r["decisions"][0]["clv_mid"])


def world(n_games, *, mispricing, noise, seed, per_game=4, rungs=(30.0, 50.0, 70.0)):
    """Synthetic world: the model's probability is the truth plus noise; the market's mid is the truth
    shifted by ``mispricing`` toward 0.5 (a favourite-longshot style error) with a 2c spread."""
    rng = random.Random(seed)
    ps, qs, outs = [], [], []
    for g in range(n_games):
        for j in range(per_game):
            pid = f"p{g}_{j}"
            for a in rungs:
                true = min(0.95, max(0.05, rng.uniform(0.1, 0.9)))
                # each rung is its own statistic so its outcome is exactly Bernoulli(true); the rungs of
                # one player share a game, so they are still clustered
                st = f"{STAT}_r{int(a)}"
                hit = rng.random() < true
                model = min(0.99, max(0.01, true + rng.gauss(0, noise)))
                mid = true + mispricing * (0.5 - true) * 2
                bid, ask = round(max(0.01, mid - 0.01), 2), round(min(0.99, mid + 0.01), 2)
                ps.append(prob(f"g{g}", pid, 50.0, round(model, 4), stat=st))
                qs.append(quote(f"g{g}", pid, 50.0, bid=bid, ask=ask, stat=st))
                outs.append(out(f"g{g}", pid, actual=60.0 if hit else 40.0, stat=st))
    return ps, qs, outs


class VerdictTests(unittest.TestCase):
    def test_market_informed_source_forces_not_independent(self):
        ps, qs, outs = world(80, mispricing=0.4, noise=0.0, seed=1)
        r = vs.evaluate(ps, qs, outs, market_informed_source=True, bootstrap=200)
        self.assertEqual(r["verdict"]["verdict"], "NOT_INDEPENDENT_EVIDENCE")
        ps[0]["market_informed"] = True
        r = vs.evaluate(ps, qs, outs, bootstrap=200)
        self.assertEqual(r["verdict"]["verdict"], "NOT_INDEPENDENT_EVIDENCE")

    def test_small_sample_is_insufficient(self):
        ps, qs, outs = world(5, mispricing=0.4, noise=0.0, seed=1)
        r = vs.evaluate(ps, qs, outs, bootstrap=200)
        self.assertEqual(r["verdict"]["verdict"], "INSUFFICIENT_SAMPLE")
        self.assertTrue(any("min_games" in x for x in r["verdict"]["reasons"]))

    def test_true_edge_is_validated(self):
        ps, qs, outs = world(150, mispricing=0.35, noise=0.0, seed=3)
        r = vs.evaluate(ps, qs, outs, bootstrap=500)
        s = r["decisions_summary"]
        self.assertGreaterEqual(s["n_decisions"], 200)
        self.assertGreater(s["roi_ci95_game_clustered"][0], 0)
        self.assertEqual(r["verdict"]["verdict"], "VALIDATED_VALUE")

    def test_noise_against_an_efficient_market_is_not_value(self):
        ps, qs, outs = world(150, mispricing=0.0, noise=0.08, seed=4)
        r = vs.evaluate(ps, qs, outs, bootstrap=500)
        self.assertIn(r["verdict"]["verdict"], ("NO_EVIDENCE_OF_VALUE", "POSITIVE_BUT_INCONCLUSIVE"))
        self.assertLess(r["decisions_summary"]["roi_ci95_game_clustered"][0], 0)

    def test_player_cluster_must_also_clear_when_requested(self):
        ps, qs, outs = world(150, mispricing=0.35, noise=0.0, seed=3)
        r = vs.evaluate(ps, qs, outs, bootstrap=300, cluster_by=("game", "player"))
        self.assertIn("roi_ci95_player_clustered", r["decisions_summary"])
        self.assertIn(r["verdict"]["verdict"], ("VALIDATED_VALUE", "POSITIVE_BUT_INCONCLUSIVE"))

    def test_preregistered_thresholds_are_echoed_and_hashed(self):
        ps, qs, outs = world(150, mispricing=0.35, noise=0.0, seed=3)
        pre = {"min_decisions": 10000, "min_games": 10, "min_roi_ci_lower": 0.0}
        r = vs.evaluate(ps, qs, outs, bootstrap=100, thresholds=pre, prereg=pre)
        self.assertEqual(r["verdict"]["verdict"], "INSUFFICIENT_SAMPLE")
        self.assertEqual(r["preregistration"]["thresholds_source"], "preregistration")
        self.assertEqual(len(r["preregistration"]["sha256"]), 64)
        with self.assertRaises(vs.ScorecardError):
            vs.evaluate(ps, qs, outs, thresholds={"min_sharpe": 1})

    def test_edge_bands_and_breakdowns(self):
        ps, qs, outs = world(60, mispricing=0.3, noise=0.0, seed=8)
        r = vs.evaluate(ps, qs, outs, bootstrap=0)
        bands = r["edge_bands"]["decisions"]
        self.assertTrue(bands)
        self.assertEqual(sum(b["n"] for b in bands), r["decisions_summary"]["n_decisions"])
        self.assertTrue(all(b["band"].startswith(("0", "ge_")) for b in bands))  # only positive-edge bets
        self.assertTrue(r["edge_bands"]["all_executable_candidates_descriptive"])
        self.assertTrue(r["by_statistic"])
        self.assertEqual(set(r["by_side"]) <= {"YES", "NO"}, True)
        self.assertTrue(all(k.startswith("KXNFLRECYDS") for k in r["by_market"]))

    def test_cluster_bootstrap_needs_three_clusters(self):
        items = [{"game": "a", "x": 1.0, "c": 1.0}, {"game": "b", "x": 0.0, "c": 1.0}]
        self.assertIsNone(vs.cluster_bootstrap_ratio(items, "x", "c", "game", 100, 1))


class DnpAndInputTests(unittest.TestCase):
    def test_dnp_policies(self):
        r = vs.evaluate([prob(p_yes=0.6)], [quote()], [out(actual=0.0, played=False)], bootstrap=0,
                        include_decisions=True)
        self.assertEqual(r["decisions"][0]["won"], 0.0)
        self.assertEqual(r["decisions_summary"]["n_dnp_settled"], 1)
        r = vs.evaluate([prob(p_yes=0.6)], [quote()], [out(actual=0.0, played=False)], bootstrap=0,
                        dnp_policy="void", include_decisions=True)
        self.assertEqual(r["decisions"][0]["settlement"], "VOID_DNP")
        self.assertEqual(r["decisions_summary"]["n_decisions"], 0)

    def test_missing_outcome_is_visible(self):
        r = vs.evaluate([prob()], [quote()], [], bootstrap=0)
        self.assertEqual(r["accounting"]["decisions_by_settlement"], {"MISSING_OUTCOME": 1})

    def test_side_probability_rows_and_conflicts(self):
        rows = [{k: v for k, v in prob().items() if k != "p_yes"} | {"side": "NO", "probability": 0.4}]
        r = vs.evaluate(rows, [quote()], [out()], bootstrap=0, include_decisions=True)
        self.assertAlmostEqual(r["decisions"][0]["p_yes"], 0.6)
        with self.assertRaises(vs.ScorecardError):
            vs.evaluate([prob(p_yes=0.6), prob(p_yes=0.7)], [quote()], [out()], bootstrap=0)
        with self.assertRaises(vs.ScorecardError):
            vs.evaluate([prob(as_of=KICK)], [quote()], [out()], bootstrap=0)

    def test_probabilities_from_forecasts(self):
        row = {"sport": "NFL", "game_id": "g1", "player_id": "p1", "statistic": STAT, "as_of": AS_OF,
               "kickoff": KICK, "conditional_on_playing": True, "participation_probability": 0.9,
               "projection_mode": "PURE_INDEPENDENT",
               "projection": {"thresholds": [{"at_least": 49.5, "probability": 0.5}]}}
        (p,) = vs.probabilities_from_forecasts([row])
        self.assertAlmostEqual(p["p_yes"], 0.45)
        self.assertFalse(p["market_informed"])
        (p,) = vs.probabilities_from_forecasts([dict(row, participation_probability=None)])
        self.assertEqual(p["probability_basis"], "conditional_on_playing")


class CliTests(unittest.TestCase):
    def _write(self, d, name, rows):
        (d / name).write_text("".join(json.dumps(x) + "\n" for x in rows))
        return str(d / name)

    def test_fee_cli(self):
        res = subprocess.run([PY, "-I", str(ROOT / "value_scorecard.py"), "fee", "--price", "0.5",
                              "--contracts", "100"], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(json.loads(res.stdout)["fee_total"], 1.75)

    def test_evaluate_cli_with_prereg(self):
        ps, qs, outs = world(30, mispricing=0.3, noise=0.0, seed=9)
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            args = [PY, "-I", str(ROOT / "value_scorecard.py"), "evaluate",
                    "--probabilities", self._write(d, "p.jsonl", ps), "--quotes", self._write(d, "q.jsonl", qs),
                    "--outcomes", self._write(d, "o.jsonl", outs)]
            pre = {"rule": "max_edge_after_fees", "min_edge": 0.02, "min_decisions": 50, "min_games": 20,
                   "min_roi_ci_lower": 0.0, "bootstrap": 100, "role": "taker"}
            (d / "pre.json").write_text(json.dumps(pre))
            res = subprocess.run(args + ["--prereg", str(d / "pre.json"), "--output", str(d / "r.json"),
                                         "--decisions-out", str(d / "dec.jsonl")], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, res.stderr)
            rep = json.loads((d / "r.json").read_text())
            self.assertEqual(rep["config"]["rule"], "max_edge_after_fees(min_edge=0.02)")
            self.assertEqual(rep["preregistration"]["thresholds"]["min_decisions"], 50)
            self.assertIn(rep["verdict"]["verdict"], vs.VERDICTS)
            decs = [json.loads(x) for x in (d / "dec.jsonl").read_text().splitlines()]
            self.assertEqual(len(decs), rep["accounting"]["decisions"])
            self.assertTrue(all(x["edge_after_fees"] >= 0.02 - 1e-9 for x in decs))
            # a command-line setting that contradicts the preregistration is refused
            res = subprocess.run(args + ["--prereg", str(d / "pre.json"), "--min-edge", "0.0"],
                                 capture_output=True, text=True)
            self.assertEqual(res.returncode, 2)
            res = subprocess.run(args + ["--market-informed-source", "--bootstrap", "20"],
                                 capture_output=True, text=True)
            self.assertEqual(json.loads(res.stdout)["verdict"]["verdict"], "NOT_INDEPENDENT_EVIDENCE")


if __name__ == "__main__":
    unittest.main()
