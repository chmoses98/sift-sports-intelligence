// The shared plain-English glossary (lib/glossary.ts): short, directional, never invented.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MetricDef } from '../src/contract/types';
import { glossLine, metricGloss, term, TERMS } from '../src/lib/glossary';

const REG = JSON.parse(readFileSync('public/data/nfl/app/latest/explorer/metrics.json', 'utf-8')).items as MetricDef[];
const def = (id: string) => REG.find((m) => m.metric_id === id)!;
const words = (s: string) => s.split(/\s+/).length;

describe('metric glossary', () => {
  it('EPA and EPA/play have one short sentence', () => {
    expect(term('epa')!.text).toMatch(/expected scoring/);
    const g = metricGloss('met_nfl.off_epa_play', def('met_nfl.off_epa_play'))!;
    expect(g.text).toBe('How much each play changes expected scoring, averaged per play.');
    expect(g.direction).toBe('Higher is better.');
    expect(words(g.text)).toBeLessThanOrEqual(20);
  });

  it('defensive EPA allowed reads lower-is-better, from the registry direction', () => {
    const g = metricGloss('met_nfl.def_epa_play', def('met_nfl.def_epa_play'))!;
    expect(def('met_nfl.def_epa_play').higher_is_better).toBe(false);
    expect(g.text).toBe('Expected points this defense allows per play.');
    expect(g.direction).toBe('Lower is better.');
    expect(glossLine(metricGloss('met_nfl.adj_def_db_epa', def('met_nfl.adj_def_db_epa')))).toMatch(/allows per dropback.*Lower is better\.$/);
    // A defensive metric where higher IS better keeps the registry's direction.
    expect(metricGloss('met_nfl.def_sack_rate', def('met_nfl.def_sack_rate'))!.direction).toBe('Higher is better.');
  });

  it('success rate has a short definition (offense and defense)', () => {
    expect(metricGloss('met_nfl.off_success_rate', def('met_nfl.off_success_rate'))!.text).toBe('Share of plays that improve the offense’s expected scoring.');
    const d = metricGloss('met_nfl.def_success_rate', def('met_nfl.def_success_rate'))!;
    expect(d.text).toMatch(/^Share of opponent plays/);
    expect(d.direction).toBe('Lower is better.');
  });

  it('CPOE has a short definition', () => {
    const g = metricGloss('met_nfl.off_cpoe', def('met_nfl.off_cpoe'))!;
    expect(g.text).toBe('Completion percentage above or below what the difficulty of the throws would predict.');
    expect(g.direction).toBe('Higher is better.');
  });

  it('opponent-adjusted ratings say they account for the opponents faced', () => {
    expect(term('opponent_adjusted')!.text).toBe('Performance after accounting for the quality of the opponents faced, shown as a difference from league average.');
    expect(metricGloss('met_nfl.adj_off_epa', def('met_nfl.adj_off_epa'))!.text).toMatch(/adjusted for the opponents faced/);
  });

  it('an unknown metric gets no invented definition', () => {
    expect(metricGloss('met_nfl.something_new_xyz', { name: 'Something new', higher_is_better: true, description: 'x' })).toBeNull();
    expect(metricGloss('met_nfl.sim_unknown_stat', null)).toBeNull();
    expect(term('not_a_term')).toBeNull();
    expect(glossLine(null)).toBeNull();
  });

  it('usage, scorecard and simulation terms are covered, each one short sentence', () => {
    for (const k of ['target_share', 'carry_share', 'dropbacks', 'sim_share', 'clv', 'brier', 'log_loss', 'calibration', 'pressure_rate', 'sack_rate', 'explosive_rate']) {
      expect(TERMS[k], k).toBeTruthy();
      expect(TERMS[k].text.split(/(?<=\.)\s/).length, k).toBe(1);
    }
    expect(term('brier')!.direction).toBe('Lower is better.');
    expect(term('log_loss')!.direction).toBe('Lower is better.');
  });

  it('every directional registry metric that the glossary knows carries the registry’s direction', () => {
    for (const m of REG) {
      const g = metricGloss(m.metric_id, m);
      if (!g || m.higher_is_better == null) continue;
      expect(g.direction, m.metric_id).toBe(m.higher_is_better ? 'Higher is better.' : 'Lower is better.');
    }
  });
});
