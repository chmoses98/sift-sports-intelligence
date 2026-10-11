// The Player Prop Explorer's pure layer (views/props/model.ts) on a real NFL game: markets grouped by player, the
// matchup in plain words, supporting usage from game logs only, and the slate ranking rules (role disagreements
// set aside, touchdowns ranked apart, history ranked by its own count and labelled history).
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { propBoard, type PropRow } from '../src/insights/propBoard';
import type { GameLogRow } from '../src/history/types';
import { groupByPlayer, historySide, matchupSentence, rankByGap, rankByHistory, roleDisagreement, supportMetrics, type DiscoveryRow } from '../src/views/props/model';
import { readSnapshot } from './helpers';

const ATL_NO = 'evt_639f74e87ff25310c542';
const board = propBoard(readSnapshot<EventResearchDoc>(`explorer/events/${ATL_NO}.json`), readSnapshot<EventDetailDoc>(`event_detail/${ATL_NO}.json`));
const d = (row: PropRow): DiscoveryRow => ({ row, eventId: ATL_NO, kickoff: '2026-10-06T00:15:00Z', game: 'ATL @ NO' });

describe('groupByPlayer', () => {
  const groups = groupByPlayer(board.rows);
  it('puts every market of a player under one group, no row lost or duplicated', () => {
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(board.rows.length);
    expect(new Set(groups.map((g) => g.playerId)).size).toBe(groups.length);
    for (const g of groups) expect(g.rows.every((r) => r.playerId === g.playerId)).toBe(true);
  });
  it('orders a player’s markets yards first, touchdowns last, and groups by the most interesting prop', () => {
    const bijan = groups.find((g) => g.name === 'Bijan Robinson')!;
    const stats = bijan.rows.map((r) => r.def.stat);
    expect(stats.indexOf('rushing_yards')).toBeLessThan(stats.indexOf('touchdowns'));
    expect(bijan.rungs).toBe(bijan.rows.reduce((n, r) => n + r.ladder.length, 0));
    for (let i = 1; i < groups.length; i++) expect(groups[i - 1].lead.interest).toBeGreaterThanOrEqual(groups[i].lead.interest);
  });
});

describe('matchupSentence', () => {
  const base = board.rows.find((r) => r.matchup)!;
  const withTier = (tier: string, rank: number) => ({ ...base, matchup: { ...base.matchup!, rank: { ...base.matchup!.rank, tier: tier as never, rank, of: 32, directional: true } } });
  it('says tough for a strong opposing unit, from the player’s side', () => {
    const s = matchupSentence(withTier('elite', 2))!;
    expect(s.word).toBe('tough');
    expect(s.text).toContain('#2 of 32');
    expect(s.text).toContain('tough draw');
  });
  it('says favorable for a weak one and neutral in the middle', () => {
    expect(matchupSentence(withTier('poor', 31))!.word).toBe('favorable');
    expect(matchupSentence(withTier('average', 16))!.word).toBe('neutral');
  });
  it('returns nothing when no rank is published', () => {
    expect(matchupSentence({ ...base, matchup: null })).toBeNull();
  });
});

function g(p: Partial<GameLogRow> & { car?: number; ryds?: number; tgt?: number; rec?: number; ts?: number | null; air?: number | null; snap?: number | null }): GameLogRow {
  return {
    week: 1, game_id: Math.random().toString(36), season_type: 'REG', date: null, team: 'A', opp: 'B', home: true, score: null,
    snaps: p.snap == null ? null : { off: 40, pct: p.snap }, passing: p.passing ?? null,
    rushing: { car: p.car ?? 0, yds: p.ryds ?? 0, td: 0, long: null },
    receiving: { tgt: p.tgt ?? 0, rec: p.rec ?? 0, yds: 0, td: 0, long: null, target_share: p.ts ?? null, air_share: p.air ?? null },
  };
}

describe('supportMetrics', () => {
  it('reads a receiver’s usage from published fields: shares stay percentages, counts are per game', () => {
    const m = supportMetrics([g({ snap: 0.8, tgt: 8, rec: 6, ts: 0.25, air: 0.3 }), g({ snap: 0.9, tgt: 4, rec: 2, ts: 0.15, air: 0.2 })], 'receiving', 'WR');
    const by = Object.fromEntries(m.map((x) => [x.key, x.value]));
    expect(by.snap).toBe('85%');
    expect(by.tgt).toBe('6/g');
    expect(by.ts).toBe('20%');
    expect(by.air).toBe('25%');
    expect(by.catch).toBe('67%');
    expect(by.car).toBeUndefined();
  });
  it('reads a back’s carries and yards per carry as stated arithmetic', () => {
    const m = supportMetrics([g({ car: 20, ryds: 90 }), g({ car: 10, ryds: 30 })], 'rushing', 'RB');
    const ypc = m.find((x) => x.key === 'ypc')!;
    expect(ypc.value).toBe('4');
    expect(ypc.basis).toBe('120 yards on 30 carries');
    expect(m.find((x) => x.key === 'car')!.value).toBe('15/g');
  });
  it('omits a measure the games do not carry, rather than showing a zero', () => {
    const m = supportMetrics([g({ tgt: 3, rec: 2 })], 'receiving', 'TE');
    expect(m.find((x) => x.key === 'snap')).toBeUndefined();
    expect(m.find((x) => x.key === 'ts')).toBeUndefined();
    expect(supportMetrics([], 'receiving', 'WR')).toEqual([]);
  });
});

describe('slate ranking', () => {
  const priced = board.rows.filter((r) => r.main && r.projection != null && r.separation != null);
  it('ranks by |projection − line| in middle-50% widths, touchdowns apart, and never ranks a role disagreement', () => {
    const fake = { ...priced[0], id: 'x|y', family: 'rushing' as const, line: 224.5, projection: 9, separation: -50, range: { typical: [2, 15] as [number, number], full: [0, 30] as [number, number], median: 8 } };
    expect(roleDisagreement(fake)).toBe(true);
    const { ranked, setAside } = rankByGap([...priced, fake].map(d));
    expect(setAside.map((x) => x.row.id)).toContain('x|y');
    expect(ranked.some((x) => x.row.id === 'x|y')).toBe(false);
    expect(ranked.every((x) => x.row.family !== 'touchdowns')).toBe(true);
    for (let i = 1; i < ranked.length; i++) expect(Math.abs(ranked[i - 1].row.separation!)).toBeGreaterThanOrEqual(Math.abs(ranked[i].row.separation!));
    const td = rankByGap(priced.map(d), { touchdowns: true }).ranked;
    expect(td.every((x) => x.row.family === 'touchdowns')).toBe(true);
  });
  it('a line inside the simulated range is not a role disagreement', () => {
    expect(roleDisagreement({ line: 10, range: { typical: [5, 15], full: [0, 30], median: 10 } })).toBe(false);
    expect(roleDisagreement({ line: 10, range: null })).toBe(false);
  });
  it('history ranks the most one-sided sample first and sinks small samples', () => {
    const rows = priced.slice(0, 4).map(d);
    const out = rankByHistory([
      { d: rows[0], h: { over: 6, under: 4, n: 10 } },
      { d: rows[1], h: { over: 1, under: 9, n: 10 } },
      { d: rows[2], h: { over: 3, under: 0, n: 3 } },
      { d: rows[3], h: { over: 8, under: 2, n: 10 } },
    ]);
    expect(out.map((x) => x.d)).toEqual([rows[1], rows[3], rows[0], rows[2]]);
  });
  it('historySide words the dominant side and pushes', () => {
    expect(historySide({ over: 2, under: 8, n: 10, push: 0, line: 54.5 }).text).toBe('8 of 10 under 54.5');
    expect(historySide({ over: 4, under: 4, n: 10, push: 2, line: 5 }).text).toBe('4 over, 4 under 5 in 10, 2 pushes');
  });
});
