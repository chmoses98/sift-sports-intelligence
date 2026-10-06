// The model scorecard (lib/scorecard.ts) reads ONLY the published scorecard and never the wager ledger.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MetricDef } from '../src/contract/types';
import { calibrationText, lowerWins, readScorecard, SCORECARD_METRIC, verdictHeadline, verdictText } from '../src/lib/scorecard';

const REG = JSON.parse(readFileSync('public/data/nfl/app/latest/explorer/metrics.json', 'utf-8')).items as MetricDef[];
const DEF = REG.find((m) => m.metric_id === SCORECARD_METRIC)!;

describe('model scorecard', () => {
  it('reads the published scorecard object from the metric registry', () => {
    const sc = readScorecard(DEF, ['research evaluation: the model is worse than the market overall'])!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = (DEF.extensions as any).scorecard;
    expect(sc.brier).toMatchObject({ model: pub.model_event_probability.brier, market: pub.market_where_spaces_coincide.brier });
    expect(sc.logLoss).toMatchObject({ model: pub.model_event_probability.log_loss, market: pub.market_where_spaces_coincide.log_loss });
    expect(sc.headToHead).toMatchObject({ model: pub.contract_payout_quality.model_contract_value.mean_squared_payout_error, market: pub.contract_payout_quality.market_at_snapshot.mean_squared_payout_error });
    expect(sc.clv).toMatchObject({ towardShare: pub.clv.toward_share_of_directional, meanExecutable: pub.clv.mean_signed_clv_executable, n: pub.clv.n });
    expect(sc.calibration!.bands).toHaveLength(pub.calibration_by_event_probability.length);
    expect(sc.games).toBe(49);
    expect(sc.asOf).toBe('2026-10-02T13:23:36Z');
    expect(sc.marketSubset).toBe(true);
    expect(sc.caveats).toContain('research evaluation: the model is worse than the market overall');
  });

  it('says plainly when the market beats the model', () => {
    const sc = readScorecard(DEF)!;
    expect(sc.overall).toBe('market');
    expect(sc.headToHead!.leader).toBe('market');
    expect(sc.logLoss!.leader).toBe('market');
    expect(verdictHeadline(sc)).toBe('Market currently stronger overall');
    expect(verdictText(sc)).toBe('The model is not currently beating the market overall. Use its projections as research evidence, not as a validated betting edge.');
    expect(calibrationText(sc.calibration!)).toMatch(/^Its probabilities run low/);
    expect(sc.families.find((f) => f.family === 'PLAYER_STAT')!.leader).toBe('market');
  });

  it('Brier and log loss are lower-is-better; tiny gaps read about even', () => {
    expect(lowerWins(0.15, 0.17)!.leader).toBe('model');
    expect(lowerWins(0.17, 0.15)!.leader).toBe('market');
    expect(lowerWins(0.1660, 0.1653)!.leader).toBe('even');
    expect(readScorecard(DEF)!.brier!.leader).toBe('even'); // 0.1662 vs 0.1653: under 1% apart
  });

  it('missing fields stay missing: no fake values', () => {
    expect(readScorecard(undefined)).toBeNull();
    expect(readScorecard({ ...DEF, extensions: {} })).toBeNull();
    const sc = readScorecard({ ...DEF, extensions: { scorecard: { model_event_probability: { brier: 0.2, n: 10 } } } })!;
    expect(sc.brier).toBeNull();
    expect(sc.logLoss).toBeNull();
    expect(sc.headToHead).toBeNull();
    expect(sc.clv).toBeNull();
    expect(sc.calibration).toBeNull();
    expect(sc.families).toEqual([]);
    expect(sc.overall).toBeNull();
    expect(verdictHeadline(sc)).toBe('No overall comparison published');
  });

  it('never reads the owner wager ledger (performance.json) for model performance', () => {
    for (const f of ['src/lib/scorecard.ts', 'src/views/Scorecard.tsx']) {
      expect(readFileSync(f, 'utf-8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/performance|wager|ledger/i);
    }
  });
});
