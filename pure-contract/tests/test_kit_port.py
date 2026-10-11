"""The 13 kit prototype tests, ported to pure_gate (kit interim rows are read as pure_forecast.v0).

Deliberate behaviour changes versus the kit are asserted explicitly and noted inline.
"""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pure_gate as gate  # noqa: E402


def example(game='g1', player='p1', mean=80, stat='receiving_yards'):
    """Kit interim (v0) row. Synthetic values for tests only."""
    return dict(sport='NFL', game_id=game, player_id=player, statistic=stat,
                as_of='2026-10-10T10:00:00-04:00', kickoff='2026-10-11T13:00:00-04:00',
                source_max_observed_at='2026-10-10T09:58:00-04:00',
                projection_mode='PURE_INDEPENDENT', model_version='research-1',
                conditional_on_playing=True,
                model_features={'opponent_adjusted_rate': .55, 'target_count': 8.2},
                projection={'mean': mean, 'median': mean - 2, 'p10': mean - 40, 'p90': mean + 40,
                            'thresholds': [{'at_least': 50, 'probability': .73},
                                           {'at_least': 75, 'probability': .52},
                                           {'at_least': 100, 'probability': .29}]})


def outcome(game='g1', actual=80, played=True, player='p1'):
    return dict(sport='NFL', game_id=game, player_id=player, statistic='receiving_yards',
                actual=actual, played=played)


class GateTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(gate.validate(example()), gate.SCHEMA_V0)

    def test_market_dependent_feature_rejected(self):
        r = example()
        r['model_features']['vegas_spread_line'] = -6.5
        with self.assertRaisesRegex(gate.GateError, 'market-dependent'):
            gate.validate(r)

    def test_market_implied_feature_rejected(self):
        r = example()
        r['model_features']['implied_team_total'] = 27.5
        with self.assertRaises(gate.GateError):
            gate.validate(r)

    def test_market_mutation_detects_changed_projection(self):
        r = example()
        changed = copy.deepcopy(r)
        changed['projection']['mean'] = r['projection']['mean'] + 0.01
        check = gate.mutate_compare([r], [changed])
        self.assertFalse(check['passed'])
        self.assertEqual(len(check['changed_model_outputs']), 1)
        self.assertEqual(check['verdict'], 'FAIL_OUTPUTS_DIFFER')

    def test_identical_outputs_pass_mutation(self):
        # Changed from the kit: identical files still "match", but are NEVER certified.
        r = example()
        check = gate.mutate_compare([r], [copy.deepcopy(r)])
        self.assertTrue(check['outputs_identical'])
        self.assertFalse(check['certified'])
        self.assertEqual(check['verdict'], 'NOT_CERTIFIED_PRECOMPUTED_FILES')

    def test_future_features_refused(self):
        r = example()
        r['source_max_observed_at'] = '2026-10-11T14:00:00Z'
        with self.assertRaises(gate.GateError):
            gate.validate(r)

    def test_threshold_monotonicity(self):
        r = example()
        r['projection']['thresholds'][2]['probability'] = .8
        with self.assertRaises(gate.GateError):
            gate.validate(r)

    def test_duplicate_entity_refused(self):
        r = example()
        with self.assertRaises(gate.GateError):
            gate.index_rows([r, r])

    def test_paired_comparison_only_and_clusters(self):
        champions = [example(f'g{i}', mean=80) for i in range(6)]
        challengers = [example(f'g{i}', mean=86) for i in range(5)]
        truth = [outcome(f'g{i}', actual=90) for i in range(6)]
        report = gate.compare(champions, challengers, truth, bootstrap=50)
        s = report['statistic_scorecards']['NFL:receiving_yards']
        self.assertEqual(s['n_player_games'], 5)
        self.assertEqual(s['n_games'], 5)
        self.assertAlmostEqual(s['delta_mae_challenger_minus_champion'], -6.0)
        self.assertEqual(report['coverage']['champion_only_without_challenger'], 1)
        self.assertEqual(s['n_common_thresholds_scored_one_per_player_game'], 5)
        self.assertIsNotNone(s['delta_mae_game_cluster_bootstrap_95ci'])

    def test_dnp_conditional_excluded(self):
        c = example()
        z = copy.deepcopy(c)
        report = gate.compare([c], [z], [outcome(actual=0, played=False)])
        self.assertEqual(report['conditional_dnp_excluded'], 1)
        self.assertEqual(report['statistic_scorecards'], {})

    def test_conditionality_mismatch_refused(self):
        c = example()
        z = copy.deepcopy(c)
        z['conditional_on_playing'] = False
        with self.assertRaises(gate.GateError):
            gate.compare([c], [z], [outcome()])


class ArchiveStrictnessTests(unittest.TestCase):
    def test_market_appearing_outside_features_fails_closed(self):
        row = example()
        row['vegas_market_prices'] = {'total': 45}
        with self.assertRaises(gate.GateError):
            gate.validate(row)

    def test_challenger_later_cutoff_not_a_fair_comparison(self):
        champ = example()
        chal = copy.deepcopy(champ)
        chal['as_of'] = '2026-10-10T18:00:00-04:00'
        with self.assertRaises(gate.GateError):
            gate.compare([champ], [chal], [outcome()])


if __name__ == '__main__':
    unittest.main()
