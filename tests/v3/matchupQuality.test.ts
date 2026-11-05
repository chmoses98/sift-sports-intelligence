// Matchup quality: the weights, the shrinkage, missing inputs, and the two monotonicity promises (better recent form never lowers the score,
// a tougher defense never raises it). The last block runs the real CeeDee Lamb log and published position ranks.
import { describe, expect, it } from 'vitest';
import hist from './fixtures/nfl-player-history-lamb.json';
import { nflObs } from '../../src/v3/data/usePlayer';
import { rankFor } from '../../src/history/stats';
import { withRest, type Obs } from '../../src/v3/model/research';
import {
  FAVORABLE_AT, MIN_COMPONENTS, SHRINK_K, TOUGH_AT, USAGE_ANCHORS, WEIGHTS, inputsFrom, matchupComponent, matchupQuality, qualityFor, recentComponent, shrink, talentComponent, usageComponent, wordOf,
  type QualityInputs, type UnitInput,
} from '../../src/v3/model/matchupQuality';

const unit = (rank: number, o: Partial<UnitInput> = {}): UnitInput => ({ label: 'EPA per dropback allowed', rank, n: 32, sample: 8, ...o });
const base = (): QualityInputs => ({
  talent: { rank: 10, of: 100, games: 12, position: 'WR', season: 2026 },
  recent: { recent: [6, 7, 8, 6, 7], baseline: [5, 6, 6, 7, 5, 6, 6, 7, 6, 6], recentLabel: 'L5', baselineLabel: 'season' },
  usage: { metric: 'target share', recent: [0.2, 0.22, 0.18, 0.25, 0.21] },
  matchup: [unit(16)],
});

describe('weights', () => {
  it('sum to one and put usage first, the opposing unit last', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(WEIGHTS.usage).toBeGreaterThan(WEIGHTS.talent);
    expect(WEIGHTS.talent).toBeGreaterThan(WEIGHTS.recent);
    expect(WEIGHTS.recent).toBeGreaterThanOrEqual(WEIGHTS.matchup);
  });
  it('the headline is the weighted mean of the component scores', () => {
    const q = matchupQuality(base());
    const exp = q.components.reduce((a, c) => a + WEIGHTS[c.id] * c.score!, 0);
    expect(q.available).toBe(4);
    expect(q.score).toBe(Math.round(exp));
  });
  it('missing components are dropped and the weights renormalised, not counted as zero or neutral', () => {
    const only = (m: Partial<QualityInputs>) => matchupQuality({ ...base(), ...m });
    const full = only({});
    const noMatch = only({ matchup: { missing: 'x' } });
    const c = full.components;
    const exp = (['talent', 'recent', 'usage'] as const).reduce((a, id) => a + WEIGHTS[id] * c.find((x) => x.id === id)!.score!, 0) / (1 - WEIGHTS.matchup);
    expect(noMatch.available).toBe(3);
    expect(noMatch.score).toBe(Math.round(exp));
  });
});

describe('shrinkage toward neutral', () => {
  it('50 + (raw - 50) * n / (n + k)', () => {
    expect(shrink(100, 3, 3)).toBeCloseTo(75, 10);
    expect(shrink(0, 6, 2)).toBeCloseTo(50 - 50 * 0.75, 10);
    expect(shrink(80, 0, 3)).toBe(50);
  });
  it('talent: a bigger games sample moves the same rank further from 50, and the sample is reported', () => {
    const few = talentComponent({ rank: 1, of: 100, games: 2, position: 'WR', season: 2026 });
    const many = talentComponent({ rank: 1, of: 100, games: 16, position: 'WR', season: 2026 });
    expect(few.raw).toBe(100);
    expect(few.score).toBeCloseTo(50 + 50 * (2 / (2 + SHRINK_K.talent)), 1);
    expect(many.score!).toBeGreaterThan(few.score!);
    expect(few.n).toBe(2);
    expect(many.detail).toContain('16 games');
  });
  it('talent percentile: rank 1 is 100, the last rank is 0, the middle is 50', () => {
    expect(talentComponent({ rank: 1, of: 101, games: 9, position: 'WR', season: 2026 }).raw).toBe(100);
    expect(talentComponent({ rank: 101, of: 101, games: 9, position: 'WR', season: 2026 }).raw).toBe(0);
    expect(talentComponent({ rank: 51, of: 101, games: 9, position: 'WR', season: 2026 }).raw).toBe(50);
  });
  it('matchup: the opponent with the larger sample counts for more (strongest weight when the sample is large)', () => {
    const tough4 = matchupComponent([unit(1, { sample: 4 })]);
    const tough16 = matchupComponent([unit(1, { sample: 16 })]);
    expect(tough4.raw).toBe(0);
    expect(tough16.score!).toBeLessThan(tough4.score!); // both below 50; the larger sample is further below
    expect(tough4.score).toBeCloseTo(50 - 50 * (4 / (4 + SHRINK_K.matchup)), 1);
    expect(tough16.n).toBe(16);
  });
  it('usage: five games are shrunk by 5 / (5 + k); one game by far more', () => {
    const five = usageComponent({ metric: 'target share', recent: Array(5).fill(0.25) });
    const one = usageComponent({ metric: 'target share', recent: [0.25] });
    expect(five.raw).toBe(100);
    expect(five.score).toBeCloseTo(50 + 50 * (5 / (5 + SHRINK_K.usage)), 1);
    expect(one.score!).toBeLessThan(five.score!);
  });
  it('usage anchors: share at the low anchor is 0, at the high anchor 100, clamped outside', () => {
    const { lo, hi } = USAGE_ANCHORS['snap share'];
    expect(usageComponent({ metric: 'snap share', recent: [lo] }).raw).toBe(0);
    expect(usageComponent({ metric: 'snap share', recent: [hi] }).raw).toBe(100);
    expect(usageComponent({ metric: 'snap share', recent: [1] }).raw).toBe(100);
    expect(usageComponent({ metric: 'minutes', recent: [24] }).raw).toBe(50);
  });
});

describe('missing inputs say which input is missing', () => {
  it('each component is unavailable with its own reason', () => {
    const q = matchupQuality({ talent: { missing: 'no ranking' }, recent: { missing: 'no log' }, usage: { missing: 'no shares' }, matchup: { missing: 'no opponent' } });
    expect(q.score).toBeNull();
    expect(q.word).toBeNull();
    expect(q.available).toBe(0);
    expect(q.components.map((c) => [c.id, c.score, c.why])).toEqual([['talent', null, 'no ranking'], ['recent', null, 'no log'], ['usage', null, 'no shares'], ['matchup', null, 'no opponent']]);
  });
  it(`one input is not a headline: it needs ${MIN_COMPONENTS}`, () => {
    const q = matchupQuality({ ...base(), recent: { missing: 'a' }, usage: { missing: 'b' }, matchup: { missing: 'c' } });
    expect(q.available).toBe(1);
    expect(q.score).toBeNull();
    expect(q.why).toMatch(/needs at least 2 of 4/);
    expect(q.components[0].score).not.toBeNull(); // the one that exists is still shown
  });
  it('recent: too few games, a short baseline, or a zero baseline are unavailable with the number named', () => {
    expect(recentComponent({ recent: [5], baseline: [1, 2, 3, 4, 5], recentLabel: 'L5', baselineLabel: 'season' }).why).toMatch(/at least 2 recent games \(has 1\)/);
    expect(recentComponent({ recent: [5, 5], baseline: [1, 2, 3], recentLabel: 'L5', baselineLabel: 'season' }).why).toMatch(/at least 5 games for the season average \(has 3\)/);
    expect(recentComponent({ recent: [0, 0], baseline: [0, 0, 0, 0, 0], recentLabel: 'L5', baselineLabel: 'season' }).why).toMatch(/no trend to measure/);
  });
  it('matchup: a unit with no rank, or no opponent sample, is left out and named; none left means unavailable', () => {
    const ok = matchupComponent([unit(8), unit(20, { label: 'Explosive plays allowed', sample: null })]);
    expect(ok.score).not.toBeNull();
    expect(ok.detail).toMatch(/left out: Explosive plays allowed \(opponent sample not published\)/);
    const none = matchupComponent([unit(8, { sample: null }), unit(3, { rank: null })]);
    expect(none.score).toBeNull();
    expect(none.why).toMatch(/opponent sample not published/);
    expect(none.why).toMatch(/rank not published/);
    expect(matchupComponent([]).why).toMatch(/no opposing-unit rank/);
  });
  it('a malformed ranking is refused, not drawn', () => {
    expect(talentComponent({ rank: 5, of: 3, games: 9, position: 'WR', season: 2026 }).score).toBeNull();
  });
});

describe('monotonicity', () => {
  const score = (m: Partial<QualityInputs>) => matchupQuality({ ...base(), ...m }).score!;
  it('better recent form never lowers the score (last-five values raised one at a time, baseline fixed)', () => {
    let prev = -1;
    for (let bump = -4; bump <= 8; bump += 0.5) {
      const recent = [6, 7, 8, 6, 7].map((x) => Math.max(0, x + bump));
      const s = score({ recent: { recent, baseline: [5, 6, 6, 7, 5, 6, 6, 7, 6, 6], recentLabel: 'L5', baselineLabel: 'season' } });
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(prev).toBeGreaterThan(score({ recent: { recent: [1, 1, 1, 1, 1], baseline: [5, 6, 6, 7, 5, 6, 6, 7, 6, 6], recentLabel: 'L5', baselineLabel: 'season' } }));
  });
  it('better recent form never lowers it when the baseline contains those same games, either', () => {
    const older = [5, 6, 6, 7, 5];
    let prev = -1;
    for (let v = 0; v <= 14; v++) {
      const recent = [v, v, v, v, v];
      const s = recentComponent({ recent, baseline: [...older, ...recent], recentLabel: 'L5', baselineLabel: 'season' }).score!;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
  it('a tougher defense (a better opponent rank) never raises the score', () => {
    let prev = Infinity;
    for (let rank = 32; rank >= 1; rank--) {
      const s = matchupQuality({ ...base(), matchup: [unit(rank)] }).score!;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
    expect(score({ matchup: [unit(1)] })).toBeLessThan(score({ matchup: [unit(32)] }));
  });
  it('an elite defense lowers it below the same player against a soft one, and by more than a neutral one', () => {
    const elite = score({ matchup: [unit(1)] }), mid = score({ matchup: [unit(16)] }), soft = score({ matchup: [unit(32)] });
    expect(elite).toBeLessThan(mid);
    expect(mid).toBeLessThan(soft);
  });
  it('a better talent rank or usage never lowers it', () => {
    let prev = -1;
    for (let rank = 100; rank >= 1; rank -= 9) { const s = score({ talent: { rank, of: 100, games: 12, position: 'WR', season: 2026 } }); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
    prev = -1;
    for (let sh = 0; sh <= 0.4; sh += 0.04) { const s = score({ usage: { metric: 'target share', recent: [sh, sh, sh] } }); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
  it('the score stays within 0 to 100 at the extremes', () => {
    const lo = matchupQuality({ talent: { rank: 100, of: 100, games: 99, position: 'WR', season: 2026 }, recent: { recent: [0, 0], baseline: [9, 9, 9, 9, 9], recentLabel: 'L5', baselineLabel: 'season' }, usage: { metric: 'target share', recent: [0, 0] }, matchup: [unit(1, { sample: 99 })] });
    const hi = matchupQuality({ talent: { rank: 1, of: 100, games: 99, position: 'WR', season: 2026 }, recent: { recent: [99, 99], baseline: [1, 1, 1, 1, 1], recentLabel: 'L5', baselineLabel: 'season' }, usage: { metric: 'target share', recent: [1, 1] }, matchup: [unit(32, { sample: 99 })] });
    expect(lo.score!).toBeGreaterThanOrEqual(0);
    expect(hi.score!).toBeLessThanOrEqual(100);
    expect(lo.score!).toBeLessThan(TOUGH_AT);
    expect(hi.score!).toBeGreaterThan(FAVORABLE_AT);
    expect([wordOf(lo.score!), wordOf(50), wordOf(hi.score!)]).toEqual(['Tough', 'Neutral', 'Favorable']);
  });
});

describe('the real CeeDee Lamb log, position ranks and a published opponent', () => {
  const stats = [{ key: 'receptions', label: 'Receptions', short: 'REC' }, { key: 'targets', label: 'Targets', short: 'TGT' }];
  const all: Obs[] = withRest(nflObs([...hist.prior.games.map((g) => ({ ...g, season: g.season ?? hist.prior.season })), ...hist.games] as never, stats as never, hist.season).sort((a, b) => a.date.localeCompare(b.date)));
  const r = rankFor(hist as never, 'receptions', 5)!;
  const args = { sport: 'NFL', stat: 'receptions', statLabel: 'Receptions', obs: all, season: String(hist.season), rank: { rank: r.rank, of: r.of, games: r.games, position: r.position, season: r.season }, units: [unit(7, { sample: 9 })] };

  it('uses the last five games, falls back to all logged games when the season is under five, and target share for receptions', () => {
    const i = inputsFrom(args);
    const vals = all.map((o) => o.v.receptions as number);
    expect(i.recent).toMatchObject({ recent: vals.slice(-5), baseline: vals, baselineLabel: 'all-games' });
    expect(i.usage).toMatchObject({ metric: 'target share', recent: all.slice(-5).map((o) => o.tgtShare) });
  });
  it('builds all four components from published numbers and gives a stable headline', () => {
    const q = qualityFor(args);
    expect(q.available).toBe(4);
    expect(q.score).toBeGreaterThan(50); // a top-ranked, high-target-share receiver against the 7th-best pass defense
    expect(q.components.find((c) => c.id === 'talent')!.detail).toContain(`#${r.rank} of ${r.of} WRs`);
    expect(qualityFor({ ...args, units: [unit(1, { sample: 9 })] }).score!).toBeLessThan(qualityFor({ ...args, units: [unit(32, { sample: 9 })] }).score!);
  });
  it('names the missing input: no ranking, no opponent profile', () => {
    const q = qualityFor({ ...args, rank: null, units: { missing: 'PHI has no published team profile.' } });
    expect(q.available).toBe(2);
    expect(q.components.find((c) => c.id === 'talent')!.why).toMatch(/no receptions position ranking is published/);
    expect(q.components.find((c) => c.id === 'matchup')!.why).toBe('PHI has no published team profile.');
  });
  it('quarterback passing stats have no usage component (snap share does not separate roles); basketball uses minutes', () => {
    expect(inputsFrom({ ...args, stat: 'passing_yards' }).usage).toEqual({ missing: expect.stringMatching(/quarterbacks play nearly every snap/) });
    const nba = inputsFrom({ ...args, rank: null, sport: 'NBA', stat: 'pts', obs: [1, 2, 3].map((i) => ({ ...all[0], key: `k${i}`, date: `2026-11-0${i}`, v: { pts: 20 + i }, min: 30 + i })) });
    expect(nba.usage).toMatchObject({ metric: 'minutes', recent: [31, 32, 33] });
    expect(nba.talent).toEqual({ missing: expect.stringMatching(/no position ranking is published for NBA/) });
  });
});
