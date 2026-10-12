// Wave 2 D: raw vs opponent-adjusted pairing for NHL and NBA (backlog 5.1, 5.2), sport-aware Metric / Ranking
// formatting (5.4) and injury freshness tied to each sport's report cadence (6.4). Profiles are the real fixtures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityProfileDoc, MetricDef } from '../src/contract/types';
import { adjRawRows, coverage, nbaAdjRawRows, nhlAdjRawRows, shownSide } from '../src/insights/adjRaw';
import { footingOf, sportMetricFormat } from '../src/insights/sportUnits';
import { injuryAge, injuryCadence, injurySource } from '../src/lib/injurySource';

const fx = (p: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', p), 'utf-8'));
const reg = (sport: string) => new Map<string, MetricDef>((fx(`${sport}/app/latest/explorer/metrics.json`).items as MetricDef[]).map((d) => [d.metric_id, d]));
const NHL = reg('nhl');
const NBA = reg('nba');
const VGK: EntityProfileDoc = fx('nhl/app/latest/explorer/teams/prt_6a6712b98b3104e80135.json');
const MIL: EntityProfileDoc = fx('nba/app/latest/explorer/teams/prt_8848b90e0c224d6f089f.json');

describe('NHL raw vs adjusted', () => {
  const rows = nhlAdjRawRows(VGK, NHL);
  it('pairs every opponent-adjusted 5v5 measure with its raw value on the same games', () => {
    expect(rows).toHaveLength(7);
    const xgf = rows.find((r) => r.key === 'met_nhl.oa_xgf_pct_5v5')!;
    expect(xgf.adjusted).toMatchObject({ value: 0.5189, rank: 2, of: expect.any(Number), window: '5v5 recency-weighted' });
    expect(xgf.raw).toMatchObject({ value: 0.5814, rank: null, metricId: 'met_nhl.oa_xgf_pct_5v5' });
    expect(xgf).toMatchObject({ scheduleEffect: 0.0625, sameGames: true, priorHeavy: true });
    expect(coverage(rows)).toBe('both');
  });
  it('the toggle picks the footing; a missing side falls back and says "only"', () => {
    const xgf = rows.find((r) => r.key === 'met_nhl.oa_xgf_pct_5v5')!;
    expect(shownSide(xgf, 'adjusted')).toMatchObject({ basis: 'adjusted', only: false, other: { basis: 'raw' } });
    expect(shownSide(xgf, 'raw')).toMatchObject({ basis: 'raw', only: false, data: { value: 0.5814 }, other: { basis: 'adjusted' } });
    const noRaw = { ...xgf, raw: null };
    expect(shownSide(noRaw, 'raw')).toMatchObject({ basis: 'adjusted', only: true, other: null });
    const noAdj = { ...xgf, adjusted: null };
    expect(shownSide(noAdj, 'adjusted')).toMatchObject({ basis: 'raw', only: true });
    expect(shownSide({ ...xgf, raw: null, adjusted: null }, 'raw')).toBeNull();
    expect(coverage([noRaw])).toBe('adjusted');
    expect(coverage([noAdj])).toBe('raw');
    expect(coverage([])).toBe('none');
  });
});

describe('NBA raw vs adjusted', () => {
  const rows = nbaAdjRawRows(MIL, NBA);
  it('pairs raw season ratings with the model’s opponent-adjusted points per 100, each with its own rank and window', () => {
    expect(rows.map((r) => r.key)).toEqual(['off', 'def', 'net']);
    const off = rows[0];
    expect(off.raw).toMatchObject({ value: 115.0172, rank: 24, of: 30, metricId: 'met_nba.team_off_rtg', window: 'season' });
    expect(off.adjusted).toMatchObject({ value: 111.8079, rank: 23, of: 30, metricId: 'met_nba.team_adj_off_ppp', window: 'EWM to 2026-06-14' });
    expect(off).toMatchObject({ sameGames: false, scheduleEffect: null });
    expect(rows[1].higherIsBetter).toBe(false);
  });
  it('a team with only the raw ratings shows "Raw only"', () => {
    const rawOnly = { ...MIL, metrics: MIL.metrics.filter((o) => !o.metric_id.includes('team_adj_')) };
    const rs = nbaAdjRawRows(rawOnly, NBA);
    expect(coverage(rs)).toBe('raw');
    expect(shownSide(rs[0], 'adjusted')).toMatchObject({ basis: 'raw', only: true });
  });
  it('other sports have no pairing here', () => expect(adjRawRows('MLB', MIL, NBA)).toEqual([]));
  it('the adjusted model inputs carry the Adjusted footing, the ratings Raw', () => {
    expect(footingOf('met_nba.team_adj_off_ppp', NBA.get('met_nba.team_adj_off_ppp')).kind).toBe('adjusted');
    expect(footingOf('met_nba.team_off_rtg', NBA.get('met_nba.team_off_rtg')).kind).toBe('raw');
  });
});

describe('Metric / Ranking formatting outside the NFL', () => {
  const f = (sport: string, id: string, def: { unit?: string | null } | undefined, v: number) => sportMetricFormat(sport, id, def)!.fmt(v);
  it('leaves the NFL to its own helpers', () => expect(sportMetricFormat('NFL', 'met_nfl.adj_off_epa', { unit: 'EPA/play' })).toBeNull());
  it('NBA ratings keep a decimal, win rates and shares are percentages, margins are signed', () => {
    expect(f('NBA', 'met_nba.team_off_rtg', NBA.get('met_nba.team_off_rtg'), 115.0172)).toBe('115.0');
    expect(f('NBA', 'met_nba.team_win_pct', NBA.get('met_nba.team_win_pct'), 0.3902)).toBe('39.0%');
    expect(f('NBA', 'met_nba.team_margin', NBA.get('met_nba.team_margin'), -6.2073)).toBe('−6.2');
    expect(f('NBA', 'met_nba.player_fg3_pct', NBA.get('met_nba.player_fg3_pct'), 0.371)).toBe('37.1%');
    expect(sportMetricFormat('NBA', 'met_nba.team_off_rtg', NBA.get('met_nba.team_off_rtg'))!.words).toBe('pts / 100 poss');
  });
  it('NHL shares and per-60 rates print in their units', () => {
    expect(f('NHL', 'met_nhl.oa_xgf_pct_5v5', NHL.get('met_nhl.oa_xgf_pct_5v5'), 0.5189)).toBe('51.9%');
    expect(f('NHL', 'met_nhl.oa_xgf60_5v5', NHL.get('met_nhl.oa_xgf60_5v5'), 2.5915)).toBe('2.59');
  });
  it('a registry unit Sift has no entry for is written as published, counts as whole numbers', () => {
    expect(f('TENNIS', 'met_tennis.elo', { unit: 'Elo points' }, 1734.52)).toBe('1735');
    expect(f('MLB', 'met_mlb.velo', { unit: 'mph' }, 94.37)).toBe('94.4');
    expect(sportMetricFormat('MLB', 'met_mlb.x', { unit: '' })!.words).toBe('unit not stated');
  });
});

describe('injury freshness follows the sport’s report cadence', () => {
  const NOW = Date.parse('2026-10-11T12:00:00Z');
  const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
  it('NFL: one report a day in game week, so 20 h is fresh and 40 h aging; 3 days is stale', () => {
    expect(injuryAge(ago(20), NOW, 'NFL')).toBe('fresh');
    expect(injuryAge(ago(40), NOW, 'NFL')).toBe('aging');
    expect(injuryAge(ago(72), NOW, 'NFL')).toBe('stale');
  });
  it('NBA: statuses move through tip-off, so 8 h is already aging', () => {
    expect(injuryAge(ago(5), NOW, 'NBA')).toBe('fresh');
    expect(injuryAge(ago(8), NOW, 'NBA')).toBe('aging');
    expect(injuryAge(ago(25), NOW, 'NBA')).toBe('stale');
  });
  it('NHL: about once a day', () => {
    expect(injuryAge(ago(10), NOW, 'NHL')).toBe('fresh');
    expect(injuryAge(ago(30), NOW, 'NHL')).toBe('aging');
    expect(injuryAge(ago(40), NOW, 'NHL')).toBe('stale');
  });
  it('unknown sports and callers without a sport keep the 6 h / 24 h default', () => {
    expect(injuryCadence('CBB')).toMatchObject({ freshMs: 6 * 3600_000, staleMs: 24 * 3600_000 });
    expect(injuryAge(ago(8), NOW)).toBe('aging');
    expect(injurySource([{ source: 'espn', as_of: ago(20) }], NOW, 'NFL').age).toBe('fresh');
    expect(injurySource([{ source: 'espn', as_of: ago(20) }], NOW).age).toBe('aging');
  });
});
