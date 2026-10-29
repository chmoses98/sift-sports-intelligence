import { describe, expect, it } from 'vitest';
import { cfbPlayerRows, rangeNote, rangeNotes } from '../src/v4/ProjectionPanels';
import { coherenceProblems, findTeamProjections, type PlayerProjection, type ProjectionDoc } from '../src/lib/projections';

function player(changes: Partial<PlayerProjection> = {}): PlayerProjection {
  return {
    playerId: 'espn:1', name: 'Test Player', team: 'CLE', opponent: 'PHI',
    gameId: 'espn:401909093', family: 'points', mean: 21, median: 20, p10: 12, p90: 32,
    quantiles: null, quantileBasis: null, thresholds: [{ k: 20, p: 0.55 }],
    opportunity: null, opponentAdjustment: null, adjustments: [],
    readiness: 'READY', gate: { status: 'PASS', findings: [] },
    dataAsOf: '2026-10-22T01:34:27Z',
    participation: { status: 'LIKELY_ACTIVE', certainty: 'PROJECTED', source: 'nba_official_injury_report', capturedUtc: '2026-10-22T01:34:27Z', reasons: [] },
    segments: null, role: 'shadow', ...changes,
  };
}
// The NBA player rows are resolved through SIFT's approved authority (tests/nbaProjection.test.ts, tests/v4NbaPlayers.test.tsx).

describe('game identity join', () => {
  const source = {
    sport: 'CFB', generatedAt: '2026-10-21T20:56:03Z', dataAsOf: '2026-10-21T03:30:00Z',
    modelVersion: 'test', families: {}, players: [], teams: [
      { gameId: '401869845', team: 'App State', teamId: '2026', family: 'team_points', mean: 23.7, p10: 9, p90: 39, startUtc: '2026-10-22T23:00:00Z', home: 'App State', away: 'James Madison', homeId: '2026', awayId: '256' },
      { gameId: '401869845', team: 'James Madison', teamId: '256', family: 'team_points', mean: 32, p10: 17, p90: 47, startUtc: '2026-10-22T23:00:00Z', home: 'App State', away: 'James Madison', homeId: '2026', awayId: '256' },
    ],
  } as ProjectionDoc;
  it('matches CFB by ESPN identity even where Kalshi uses codes and names differ', () => {
    const t = findTeamProjections(source, { home: 'APP', away: 'JMU', homeId: '2026', awayId: '256', startUtc: '2026-10-22T23:00:00Z' });
    expect(t?.length).toBe(2);
  });
  it('rejects a different game and a different date', () => {
    expect(findTeamProjections(source, { home: 'APP', away: 'JMU', homeId: '2026', awayId: '999', startUtc: '2026-10-22T23:00:00Z' })).toBeNull();
    expect(findTeamProjections(source, { home: 'APP', away: 'JMU', homeId: '2026', awayId: '256', startUtc: '2026-11-22T23:00:00Z' })).toBeNull();
  });
});

describe('negative lower bounds in published CFB yardage ranges', () => {
  const NOW_CFB = Date.parse('2026-10-22T14:00:00Z');
  const cfb = (changes: Partial<PlayerProjection> = {}) => player({
    playerId: 'espn:9', name: 'CFB Player', team: 'JMU', opponent: 'APP', gameId: '401869845', family: 'rushing_yards',
    mean: 17.36, median: 6, p10: -2, p90: 54, readiness: 'SHADOW VALIDATION', gate: { status: 'REVIEW', findings: [] }, dataAsOf: '2026-10-21T03:30:00Z',
    participation: { status: 'UNCERTAIN', certainty: 'PROJECTED', source: 'pf_cfb_prior_game_passer', capturedUtc: null, reasons: [] }, ...changes,
  });
  it('shows a legitimate negative rushing range exactly as published (sacks count against rushing)', () => {
    expect(coherenceProblems(cfb())).toEqual([]);
    const r = cfbPlayerRows({ players: [cfb()] }, '401869845', NOW_CFB);
    expect(r.items).toHaveLength(1);
    expect(r.items[0][0].p10).toBe(-2);
    expect(r.withheld).toBe(0);
  });
  it('allows a negative rushing mean (a sacked quarterback) but not one below the model support', () => {
    expect(coherenceProblems(cfb({ mean: -5.8, median: -11, p10: -20, p90: 12 }))).toEqual([]);
    expect(coherenceProblems(cfb({ p10: -31 }))).toContain('a projected value is negative');
  });
  it('still withholds a receiving range that starts below zero, and says how many', () => {
    const rec = cfb({ family: 'receiving_yards', mean: 12, median: 7, p10: -4, p90: 31 });
    expect(coherenceProblems(rec)).toContain('a projected value is negative');
    const r = cfbPlayerRows({ players: [rec, cfb({ playerId: 'espn:10', family: 'receiving_yards', mean: 40, p10: 6, p90: 91 })] }, '401869845', NOW_CFB);
    expect(r.items).toHaveLength(1);
    expect(r.withheld).toBe(1);
    expect(r.withheldNegativeReceiving).toBe(1);
  });
  it('does not count rows that were out or blocked as withheld for incoherence', () => {
    const out = cfb({ family: 'receiving_yards', p10: -4, participation: { status: 'LIKELY_OUT', certainty: 'PROJECTED', source: 'x', capturedUtc: null, reasons: [] } });
    const blocked = cfb({ family: 'receiving_yards', p10: -4, gate: { status: 'BLOCK', findings: [] } });
    expect(cfbPlayerRows({ players: [out, blocked] }, '401869845', NOW_CFB)).toMatchObject({ withheld: 0, items: [] });
  });
  it('other stats are unchanged: a negative range is incoherent for a count', () => {
    expect(coherenceProblems(cfb({ family: 'carries', p10: -1 }))).toContain('a projected value is negative');
    expect(coherenceProblems(cfb({ family: 'points', p10: -1 }))).toContain('a projected value is negative');
  });
  it('explains a negative rushing bound and nothing else', () => {
    expect(rangeNote('rushing_yards', -3)).toMatch(/NCAA counts sacks against rushing/);
    expect(rangeNote('rushing_yards', 0)).toBeNull();
    expect(rangeNote('rushing_yards', null)).toBeNull();
    expect(rangeNote('receiving_yards', -3)).toBeNull();
    expect(rangeNotes([{ family: 'rushing_yards', p10: -2 }, { family: 'rushing_yards', p10: -9 }, { family: 'carries', p10: 0 }])).toHaveLength(1);
  });
});
