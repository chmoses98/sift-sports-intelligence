import { describe, expect, it } from 'vitest';
import { eligibleNbaRows, rangeNote, rangeNotes } from '../src/v4/ProjectionPanels';
import { findTeamProjections, type PlayerProjection, type ProjectionDoc } from '../src/lib/projections';

const NOW = Date.parse('2026-10-22T14:00:00Z');
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
const doc = (rows: PlayerProjection[]) => ({
  players: rows, families: { points: { readiness: 'READY' }, rebounds: { readiness: 'READY' } },
});

describe('NBA preview: only valid current research rows reach the UI', () => {
  it('shows a ready, current projection without a Kalshi market', () => {
    expect(eligibleNbaRows(doc([player()]), 'espn:401909093', NOW)).toHaveLength(1);
  });
  it('blocks ruled-out players, blocked outputs, and another game', () => {
    const out = player({ participation: { status: 'CONFIRMED_OUT', certainty: 'REPORTED', source: 'nba_official_injury_report', capturedUtc: null, reasons: [] } });
    const blocked = player({ gate: { status: 'BLOCK', findings: [] } });
    const other = player({ gameId: 'espn:wrong' });
    expect(eligibleNbaRows(doc([out, blocked, other]), 'espn:401909093', NOW)).toHaveLength(0);
  });
  it('never fills from stale, incoherent, or unapproved families', () => {
    const stale = player({ dataAsOf: '2026-10-18T00:00:00Z' });
    const inverted = player({ p10: 40, p90: 20 });
    const noApproval = player({ family: 'assists' });
    expect(eligibleNbaRows(doc([stale, inverted, noApproval]), 'espn:401909093', NOW)).toHaveLength(0);
  });
  it('shows current REVIEW output with the status preserved for honest labelling', () => {
    const review = player({ gate: { status: 'REVIEW', findings: [] } });
    expect(eligibleNbaRows(doc([review]), 'espn:401909093', NOW)[0].gate.status).toBe('REVIEW');
  });
});

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

describe('negative lower bounds in published ranges are explained, never altered', () => {
  it('says nothing when the range does not start below zero', () => {
    expect(rangeNote('rushing_yards', 0)).toBeNull();
    expect(rangeNote('receiving_yards', 12)).toBeNull();
    expect(rangeNote('rushing_yards', null)).toBeNull();
  });
  it('treats a negative rushing bound as legitimate (sacks count against rushing)', () => {
    expect(rangeNote('rushing_yards', -3)).toMatch(/NCAA counts sacks against rushing/);
    expect(rangeNote('rushing_yards', -3)).not.toMatch(/artifact/);
  });
  it('calls a negative receiving bound a model artifact, and any count stat that cannot be negative the same', () => {
    expect(rangeNote('receiving_yards', -5)).toMatch(/model artifact/);
    expect(rangeNote('receiving_yards', -5)).toMatch(/about 2%/);
    expect(rangeNote('points', -1)).toMatch(/cannot be negative/);
  });
  it('lists each distinct note once, in row order', () => {
    const rows = [
      { family: 'rushing_yards', p10: -2 }, { family: 'receiving_yards', p10: -5 }, { family: 'rushing_yards', p10: -9 }, { family: 'carries', p10: 0 },
    ];
    expect(rangeNotes(rows)).toHaveLength(2);
    expect(rangeNotes([{ family: 'passing_yards', p10: 97 }])).toEqual([]);
  });
});
