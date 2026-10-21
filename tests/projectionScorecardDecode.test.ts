// The live scorecard (`sift.prospective_scorecard.v1`) as pf_core 1.3.0 writes it: a real card from the shared library with
// one yes/no family (scored by Brier) and one count family (CRPS/MAE, unchanged). The reader must keep both, never invent
// an 80% range for the yes/no family, and read the paired comparison from the primary metric.
import { describe, expect, it } from 'vitest';
import { decodeScorecard } from '../src/lib/projections';
import card from './fixtures/pf-scorecard/nfl-season.pf_core-1.3.0.json';

describe('decodeScorecard on a pf_core 1.3.0 card', () => {
  const sc = decodeScorecard(card)!;
  const fam = (name: string) => sc.families.find((f) => f.family === name)!;

  it('carries the scoring version and keeps both families', () => {
    expect((card as { scoring_version: string }).scoring_version).toBe('1.3.0');
    expect(sc.sport).toBe('NFL');
    expect(sc.settled).toBe(240 * 2);
    expect(sc.families.map((f) => f.family).sort()).toEqual(['anytime_td', 'receptions']);
  });

  it('yes/no family: no 80% range, bias is calibration in the large, the paired difference is the Brier difference', () => {
    const td = fam('anytime_td');
    expect(td.cover80).toBeNull();
    expect(td.n).toBe(120);
    const raw = (card.families.find((f) => f.family === 'anytime_td')!) as { models: { model_role: string; bias: number }[]; paired: { brier_diff: { mean_diff: number } } };
    expect(td.bias).toBeCloseTo(raw.models.find((m) => m.model_role === 'challenger')!.bias, 12);
    expect(td.vsIncumbent!.diff).toBeCloseTo(raw.paired.brier_diff.mean_diff, 12);
    expect(td.vsIncumbent!.n).toBe(120);
  });

  it('count family: unchanged metrics, the 80% range is still reported', () => {
    const r = fam('receptions');
    expect(r.cover80).not.toBeNull();
    expect(Number.isFinite(r.mae)).toBe(true);
    expect(r.vsIncumbent).not.toBeNull();
  });

  it('rejects a card that is not research-only', () => {
    expect(decodeScorecard({ ...card, authority: 'actionable' })).toBeNull();
  });
});
