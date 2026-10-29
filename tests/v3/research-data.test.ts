// The research data layer against REAL published documents (trimmed copies in tests/v3/fixtures, captured 2026-10-26).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EntityProfileDoc, ExplorerIndexDoc, MetricDef, RankingDoc } from '../../src/contract/types';
import { buildRankingCatalog, defaultWindow, nextGame, normalizeRanking, normalizeTeamProfile, percentileOf, scheduleOf, seasonOfDate, shortMetricId, teamRecord } from '../../src/v3/data/research/normalize';
import { counterpartOf, deriveRelated } from '../../src/v3/data/research/relations';

const load = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/${f}`, 'utf8')) as T;
const dal = load<EntityProfileDoc>('nfl-team-dal.json');
const tor = load<EntityProfileDoc>('nhl-team-tor.json');
const rk = load<RankingDoc>('nfl-ranking-adj-def-db-epa.json');
const defs = new Map(load<{ items: MetricDef[] }>('nfl-metrics.json').items.map((d) => [d.metric_id, d]));
const index = load<ExplorerIndexDoc>('nfl-index.json');

describe('team profile', () => {
  const p = normalizeTeamProfile(dal, 'nfl');
  it('keeps every window of a statistic with the rank, universe size and percentile the publication states', () => {
    const m = p.metrics.get('adj_def_db_epa')!;
    expect(m.metricId).toBe('met_nfl.adj_def_db_epa');
    const w = m.windows.ADJ_RIDGE;
    expect(w.rank).toBe(28);
    expect(w.n).toBe(28); // the packet's universe, not 32
    expect(w.percentile).toBeCloseTo(3.57, 2);
    expect(w.rankingId).toBe('rnk_e3485aaecabb0ec363a8');
    expect(w.higherIsBetter).toBe(false);
  });
  it('does not mix windows or raw and adjusted statistics', () => {
    expect(Object.keys(p.metrics.get('off_epa_play')!.windows).every((k) => ['SEASON', 'L6', 'L34'].includes(k))).toBe(true);
    expect(p.metrics.get('adj_off_epa')!.windows.SEASON).toBeUndefined();
  });
  it('orders games by start time and keeps results from the team side', () => {
    expect(p.games.map((g) => g.startUtc)).toEqual([...p.games.map((g) => g.startUtc)].sort());
    const done = p.games.find((g) => g.status === 'FINAL' && g.result)!;
    expect(done.result).toMatchObject({ for: expect.any(Number), against: expect.any(Number) });
    expect(done.home === null || typeof done.home === 'boolean').toBe(true);
  });
  it('counts the football record from completed regular-season results of the current season only', () => {
    const wins = p.games.filter((g) => g.status === 'FINAL' && g.result?.outcome === 'W').length;
    expect(p.record).toMatchObject({ wins, source: 'results' });
    expect(p.record!.text).toMatch(/^\d+–\d+(–\d+)?$/);
  });
  it('reports a missing value as null, never as zero or a substitute', () => {
    expect(p.metrics.get('adj_off_epa')!.windows.ADJ_RIDGE.sample).toBeNull();
    expect(p.metrics.get('nonexistent')).toBeUndefined();
  });
});

describe('hockey record', () => {
  const p = normalizeTeamProfile(tor, 'nhl');
  const strip = (display: string | null, value?: number) => {
    const m = new Map(p.metrics);
    const pp = m.get('points_pct')!;
    m.set('points_pct', { ...pp, windows: { ...pp.windows, '2026-27': { ...pp.windows['2026-27'], display, ...(value != null ? { value } : {}) } } });
    return m;
  };
  it('shows wins, losses and overtime losses separately, as the publication states them', () => {
    expect(p.record).toMatchObject({ wins: 7, losses: 4, otLosses: 2, games: 13, source: 'published', text: '7–4–2' });
  });
  it('derives overtime losses from the official points percentage when the publication states no record', () => {
    const r = teamRecord('nhl', { games: p.games, metrics: strip(null), season: '2026-27' })!;
    expect(r.source).toBe('derived');
    expect(r.otLosses).not.toBeNull();
    expect(r.wins + r.losses + r.otLosses!).toBe(r.games);
    const pct = p.metrics.get('points_pct')!.windows['2026-27'].value!;
    expect(Math.abs((2 * r.wins + r.otLosses!) / (2 * r.games) - pct)).toBeLessThan(0.6 / (2 * r.games));
    expect(r.text).toBe(`${r.wins}–${r.losses}–${r.otLosses}`);
  });
  it('uses the publication\'s own stated record for a completed season', () => {
    const prior = p.metrics.get('points_pct')!.windows['2025-26'];
    expect(prior.display).toBe('32-36-14');
    const r = teamRecord('nhl', { games: [], metrics: p.metrics, season: '2025-26' });
    expect(r).toMatchObject({ wins: 32, losses: 36, otLosses: 14, source: 'published', text: '32–36–14' });
  });
  it('gives no record rather than an unreconcilable one', () => {
    expect(teamRecord('nhl', { games: p.games, metrics: strip(null, 0.99), season: '2026-27' })).toBeNull();
  });
  it('derives the season of a date per sport', () => {
    expect(seasonOfDate('nhl', '2026-10-24T00:00:00Z')).toBe('2026-27');
    expect(seasonOfDate('nhl', '2027-02-01T00:00:00Z')).toBe('2026-27');
    expect(seasonOfDate('nfl', '2027-01-10T18:00:00Z')).toBe('2026');
  });
});

describe('ranking catalog and rankings', () => {
  it('reads which ranking is which from the profile\'s own list, not from labels', () => {
    const c = buildRankingCatalog([dal]);
    expect(c.windows.get('met_nfl.adj_def_db_epa')!.get('ADJ_RIDGE')).toBe('rnk_e3485aaecabb0ec363a8');
    expect(c.byRanking.get('rnk_e3485aaecabb0ec363a8')).toEqual({ metricId: 'met_nfl.adj_def_db_epa', window: 'ADJ_RIDGE' });
  });
  it('normalizes a ranking with the universe it was published for', () => {
    const r = normalizeRanking(rk, defs.get(rk.metric_id), (_id, short) => short ?? '?');
    expect(r.n).toBe(28);
    expect(r.entries).toHaveLength(28);
    expect(r.entries[0].rank).toBe(1);
    expect(r.higherIsBetter).toBe(false);
    expect(r.adjusted).toBe(true);
    expect(r.entries.find((e) => e.code === 'DAL')!.rank).toBe(28);
    expect(r.limitations.length).toBeGreaterThan(0);
  });
  it('computes percentile from rank and universe the way the design system defines it', () => {
    expect(percentileOf(1, 28)).toBe(100);
    expect(percentileOf(28, 28)).toBe(0);
    expect(percentileOf(14, 28)).toBeCloseTo(51.85, 1);
    expect(percentileOf(null, 28)).toBeNull();
    expect(percentileOf(1, 1)).toBeNull();
  });
  it('picks a default window only from the windows that exist', () => {
    expect(defaultWindow(['SEASON', 'L6', 'L34'])).toBe('SEASON');
    expect(defaultWindow(['ADJ_RIDGE'])).toBe('ADJ_RIDGE');
    expect(defaultWindow(['2025-26', '2026-27', 'L10'])).toBe('2025-26');
    expect(defaultWindow([])).toBeNull();
  });
  it('strips the sport prefix from a metric id', () => { expect(shortMetricId('met_nfl.adj_off_epa')).toBe('adj_off_epa'); });
});

describe('schedule authority', () => {
  const sched = scheduleOf(index);
  it('takes start times from the explorer schedule and maps participants to team codes', () => {
    expect(sched.length).toBeGreaterThan(0);
    expect(sched.map((e) => e.startUtc)).toEqual([...sched.map((e) => e.startUtc)].sort());
    expect(sched.every((e) => e.homeCode === null || e.homeCode.length >= 2)).toBe(true);
  });
  it('finds a team\'s next unfinished game and ignores finished ones', () => {
    const e = sched.find((x) => x.status !== 'FINAL')!;
    const n = nextGame(sched, e.homeId!, Date.parse(e.startUtc) - 3600_000);
    expect(n?.eventId).toBe(e.eventId);
    expect(nextGame(sched, e.homeId!, Date.parse(e.startUtc) + 10 * 3600_000)).toBeNull();
  });
});

describe('derived related statistics (temporary)', () => {
  it('relates raw and adjusted versions explicitly and never merges them', () => {
    expect(counterpartOf('nfl', 'adj_off_epa')).toEqual({ id: 'off_epa_play', relation: 'raw_counterpart' });
    expect(counterpartOf('nfl', 'off_epa_play')).toEqual({ id: 'adj_off_epa', relation: 'adjusted_counterpart' });
    expect(counterpartOf('nhl', 'gf_per_game')).toBeNull();
  });
  it('lists only statistics the registry has, in the same sport, with typed reasons', () => {
    const rel = deriveRelated('nfl', 'adj_def_epa', defs);
    expect(rel.length).toBeGreaterThan(0);
    for (const r of rel) { expect(defs.has(r.metricId)).toBe(true); expect(r.id).not.toBe('adj_def_epa'); }
    expect(rel.find((r) => r.id === 'def_epa_play')?.relation).toBe('raw_counterpart');
    expect(deriveRelated('nfl', 'adj_def_epa', new Map())).toEqual([]);
    expect(deriveRelated('mlb', 'anything', defs)).toEqual([]);
  });
});
