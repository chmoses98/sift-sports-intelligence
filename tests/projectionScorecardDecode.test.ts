// The live scorecard (`sift.prospective_scorecard.v1`) as pf_core 1.3.0 writes it: a real card from the shared library with
// one yes/no family (scored by Brier) and one count family (CRPS/MAE, unchanged). The reader must take each family's score
// from the metric the card names (Brier for yes/no, average miss for counts), never show MAE for a probability, never invent
// an 80% range for a yes/no family, and read the paired comparison from the card's primary metric.
import { describe, expect, it } from 'vitest';
import { decodeScorecard } from '../src/lib/projections';
import card from './fixtures/pf-scorecard/nfl-season.pf_core-1.3.0.json';

type Raw = { families: { family: string; outcome_type?: string; paired: Record<string, { mean_diff: number; n_obs: number }> & { primary_metric: string }; models: Record<string, unknown>[] }[] } & Record<string, unknown>;
const raw = card as unknown as Raw;
const rawFam = (name: string) => raw.families.find((f) => f.family === name)!;
const challenger = (name: string) => rawFam(name).models.find((m) => m.model_role === 'challenger')!;

describe('decodeScorecard on a pf_core 1.3.0 card', () => {
  const sc = decodeScorecard(card)!;
  const fam = (name: string) => sc.families.find((f) => f.family === name)!;

  it('carries the scoring version and keeps both families', () => {
    expect(sc.scoringVersion).toBe('1.3.0');
    expect(sc.sport).toBe('NFL');
    expect(sc.settled).toBe(240 * 2);
    expect(sc.families.map((f) => f.family).sort()).toEqual(['anytime_td', 'receptions']);
  });

  it('yes/no family: Brier from the card, no MAE, no 80% range, calibration as bias, paired difference is the Brier difference', () => {
    const td = fam('anytime_td');
    expect(td.kind).toBe('binary');
    expect(td.brier).toBeCloseTo(challenger('anytime_td').brier as number, 12);
    expect(td.brier).not.toBeCloseTo(challenger('anytime_td').mae as number, 3);   // the card carries both; Brier is the one read
    expect(td.mae).toBeNull();
    expect(td.cover80).toBeNull();
    expect(td.n).toBe(120);
    expect(td.bias).toBeCloseTo(challenger('anytime_td').bias as number, 12);
    expect(rawFam('anytime_td').paired.primary_metric).toBe('brier');
    expect(td.vsIncumbent!.diff).toBeCloseTo(rawFam('anytime_td').paired.brier_diff.mean_diff, 12);
    expect(td.vsIncumbent!.n).toBe(120);
  });

  it('count family: average miss and the 80% range, unchanged; no Brier', () => {
    const r = fam('receptions');
    expect(r.kind).toBe('count');
    expect(r.mae).toBeCloseTo(challenger('receptions').mae as number, 12);
    expect(r.brier).toBeNull();
    expect(r.cover80).toBeCloseTo(challenger('receptions').cover_80 as number, 12);
    // the incumbent publishes a mean only, so pf_core pairs this count family on MAE; the reader follows the card's primary metric
    expect(rawFam('receptions').paired.primary_metric).toBe('mae');
    expect(r.vsIncumbent!.diff).toBeCloseTo(rawFam('receptions').paired.mae_diff.mean_diff, 12);
  });

  it('rejects a card that is not research-only', () => {
    expect(decodeScorecard({ ...card, authority: 'actionable' })).toBeNull();
  });
});

describe('decodeScorecard on a card that predates pf_core 1.3.0 (no outcome_type, no Brier)', () => {
  // the same real card with the 1.3.0 fields removed, as pf_core 1.2.x wrote it
  const legacy = JSON.parse(JSON.stringify(card));
  delete legacy.scoring_version;
  for (const f of legacy.families) {
    delete f.outcome_type; delete f.scoring_version; delete f.paired.primary_metric; delete f.paired.brier_diff;
    for (const m of f.models) { for (const k of ['outcome_type', 'primary_metric', 'brier', 'log_loss', 'calibration', 'base_rate', 'mean_prob']) delete m[k]; }
  }
  const sc = decodeScorecard(legacy)!;

  it('still treats the known yes/no family as yes/no: no MAE is shown for a probability, the Brier cell is simply empty', () => {
    const td = sc.families.find((f) => f.family === 'anytime_td')!;
    expect(sc.scoringVersion).toBeNull();
    expect(td.kind).toBe('binary');
    expect(td.brier).toBeNull();
    expect(td.mae).toBeNull();
    expect(td.cover80).toBeNull();
  });

  it('keeps count families on MAE and reads their paired CRPS difference as before', () => {
    const r = sc.families.find((f) => f.family === 'receptions')!;
    expect(r.kind).toBe('count');
    expect(r.mae).not.toBeNull();
    expect(r.vsIncumbent).not.toBeNull();
  });
});
