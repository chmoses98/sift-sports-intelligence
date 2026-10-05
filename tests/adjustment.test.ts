import { describe, expect, it } from 'vitest';
import { compareAdjustment, unitOf } from '../src/lib/adjustment';

const side = (value: number, rank: number, leagueAverage?: number) => ({ value, rank, size: 32, leagueAverage });

describe('raw vs opponent-adjusted comparison', () => {
  it('measures the delta on the adjusted scale (raw minus its league average) and the rank movement', () => {
    // offense, higher is better: raw 0.081 with league avg 0.004 -> +0.077 vs avg; adjusted +0.052
    const c = compareAdjustment(side(0.081, 6, 0.004), side(0.052, 11), true, { unit: 'offense', team: 'BUF' });
    expect(c.rawVsAvg).toBeCloseTo(0.077, 6);
    expect(c.adjVsAvg).toBeCloseTo(0.052, 6);
    expect(c.delta).toBeCloseTo(-0.025, 6);
    expect(c.rankMove).toBe(-5); // #6 -> #11 = down five places
  });

  it('higher_is_better=true: a rating that drops after adjustment reads as weaker', () => {
    const c = compareAdjustment(side(0.081, 6, 0.004), side(0.052, 11), true, { unit: 'offense', team: 'BUF' });
    expect(c.direction).toBe('worse');
    expect(c.towardAverage).toBe(true);
    expect(c.interpretation).toBe('The raw number looked stronger. Accounting for the opponents faced moves BUF closer to league average.');
  });

  it('higher_is_better=true: a rating that rises after adjustment reads as improved', () => {
    const c = compareAdjustment(side(0.01, 20, 0.004), side(0.05, 9), true, { unit: 'offense', team: 'NE' });
    expect(c.rankMove).toBe(11);
    expect(c.direction).toBe('better');
    expect(c.interpretation).toMatch(/^Accounting for the opponents faced improves the offensive rating/);
  });

  it('higher_is_better=false (defense): a numerical INCREASE is a worse rating, never "better" (HOU, published)', () => {
    // HOU def EPA/play: raw -0.1196 (#1, league avg 0.007465); adjusted -0.0826 (#3)
    const c = compareAdjustment(side(-0.1196, 1, 0.007465), side(-0.0826, 3), false, { unit: 'defense', team: 'HOU' });
    expect(c.delta).toBeGreaterThan(0);
    expect(c.delta).toBeCloseTo(0.044465, 6); // -0.0826 - (-0.1196 - 0.007465)
    expect(c.rankMove).toBe(-2);
    expect(c.direction).toBe('worse');
    expect(c.interpretation).toMatch(/moves HOU closer to league average|looks stronger than the adjusted defensive rating/);
  });

  it('higher_is_better=false (defense): a numerical DECREASE after adjustment is an improvement', () => {
    const c = compareAdjustment(side(0.02, 24, 0.007), side(-0.03, 8), false, { unit: 'defense', team: 'NYJ' });
    expect(c.delta).toBeLessThan(0);
    expect(c.direction).toBe('better');
    expect(c.interpretation).toMatch(/improves the defensive rating/);
  });

  it('without ranks, direction comes from the delta and higher_is_better', () => {
    expect(compareAdjustment({ value: 0.02, rank: null, size: null, leagueAverage: 0 }, { value: -0.03, rank: null, size: null }, false).direction).toBe('better');
    expect(compareAdjustment({ value: 0.02, rank: null, size: null, leagueAverage: 0 }, { value: -0.03, rank: null, size: null }, true).direction).toBe('worse');
  });

  it('an essentially unchanged adjustment says so', () => {
    const c = compareAdjustment(side(0.05, 7, 0.004), side(0.045, 8), true, { unit: 'offense' });
    expect(c.direction).toBe('same');
    expect(c.interpretation).toBe('Opponent adjustment barely changes the rating.');
  });

  it('never fabricates: a missing twin or league average gives no delta and no reading', () => {
    const c = compareAdjustment({ value: 0.05, rank: null, size: null, leagueAverage: null }, { value: null, rank: null, size: null }, true);
    expect(c.delta).toBeNull();
    expect(c.rankMove).toBeNull();
    expect(c.interpretation).toBeNull();
  });

  it('knows which side of the ball a metric describes', () => {
    expect(unitOf('met_nfl.adj_def_epa')).toBe('defense');
    expect(unitOf('met_nfl.off_success_rate')).toBe('offense');
    expect(unitOf('met_nfl.proj_target_share')).toBeNull();
  });
});

describe('mixed signals', () => {
  it('a rank move with a negligible value change reads as barely changed (BUF def EPA/dropback, published)', () => {
    // raw 0.049 (#13, league avg 0.0635 -> -0.0145 vs avg); adjusted -0.0150 (#15): delta -0.0005, rank -2
    const c = compareAdjustment(side(0.049, 13, 0.0635), side(-0.015, 15), false, { unit: 'defense', team: 'BUF' });
    expect(c.rankMove).toBe(-2);
    expect(Math.abs(c.delta!)).toBeLessThan(0.001);
    expect(c.direction).toBe('same');
    expect(c.interpretation).toBe('Opponent adjustment barely changes the rating.');
  });
});
