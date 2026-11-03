import { describe, expect, it } from 'vitest';
import type { Market } from '../../src/contract/types';
import { clears, evidenceFor, parseGameMarkets, profileCurrent, rungK, rungWords, type Result } from '../../src/v3/model/gameMarkets';
import fx from './fixtures/nfl-chisea-game-markets.json';

// REAL NFL contracts (see the fixture's `_fixture` field), parsed as the app parses them.
const markets = fx.markets as unknown as Market[];
const g = { awayId: fx.awayId, homeId: fx.homeId, awayName: 'Bears', homeName: 'Seahawks' };
const groups = parseGameMarkets(markets, g);
const by = (k: string) => groups.find((x) => x.key === k)!;

describe('parseGameMarkets on a real NFL game', () => {
  it('finds every family a viewer expects, full game first', () => {
    const keys = groups.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['moneyline:FULL', 'spread:FULL:away', 'spread:FULL:home', 'total:FULL:', 'team_total:FULL:away', 'team_total:FULL:home', 'total:1H:', 'period_winner:1H']));
    expect(groups[0].full).toBe(true);
    expect(groups.findIndex((x) => !x.full)).toBeGreaterThan(groups.findIndex((x) => x.full && x.kind === 'team_total'));
  });
  it('counts the published ladders without dropping or inventing rungs', () => {
    expect(by('total:FULL:').rungs.length).toBe(19);
    expect(by('team_total:FULL:away').rungs.length + by('team_total:FULL:home').rungs.length).toBe(27);
    expect(by('spread:FULL:away').rungs.length + by('spread:FULL:home').rungs.length).toBe(25);
    for (const grp of groups.filter((x) => x.rungs.length)) expect(grp.rungs.map((r) => r.k)).toEqual([...grp.rungs.map((r) => r.k)].sort((a, b) => a - b));
  });
  it('reads rung semantics: >= k is k, > 9.5 is 10', () => {
    expect(rungK({ threshold: 26, extensions: { operator: '>=' } } as unknown as Market)).toBe(26);
    expect(rungK({ threshold: 9.5, extensions: { operator: '>' } } as unknown as Market)).toBe(10);
    expect(by('spread:FULL:away').rungs[0].k).toBeGreaterThan(0);
  });
  it('lists the moneyline as one contract per side, with real prices', () => {
    const ml = by('moneyline:FULL');
    expect(ml.singles.map((s) => s.side).sort()).toEqual(['away', 'home']);
    for (const s of ml.singles) expect(s.askCents).toBeGreaterThan(0);
  });
  it('features the rung nearest even money, and titles are in words', () => {
    const t = by('total:FULL:');
    const f = t.rungs.find((r) => r.k === t.featured)!;
    for (const r of t.rungs) expect(Math.abs((f.askCents ?? 50) - 50)).toBeLessThanOrEqual(Math.abs((r.askCents ?? 50) - 50));
    expect(t.title).toBe('Game total');
    expect(by('team_total:FULL:away').title).toBe('Bears team total');
    expect(by('total:1H:').title).toBe('1st half game total');
  });
  it('withholds markets that are not positively open', () => {
    const closed = markets.map((m) => ({ ...m, market_status: 'CLOSED' })) as Market[];
    expect(parseGameMarkets(closed, g)).toEqual([]);
  });
});

describe('evidence', () => {
  const res = (pts: [number, number][]): Result[] => pts.map(([f, a], i) => ({ for: f, against: a, outcome: f > a ? 'W' : f < a ? 'L' : 'T', date: `2026-10-${20 - i}`, opp: 'X' }));
  const away = res([[30, 24], [17, 20], [21, 14], [10, 27]]);
  const home = res([[24, 20], [31, 10], [13, 16]]);
  it('totals use both teams’ game totals; team totals the team’s points; spreads the margin', () => {
    const t = evidenceFor(by('total:FULL:'), away, home)!;
    expect(t.state === 'ready' && t.series.map((s) => s.values.length)).toEqual([4, 3]);
    expect(t.state === 'ready' && t.series[0].values.at(-1)).toBe(54);   // newest game last: 30 + 24
    const tt = evidenceFor(by('team_total:FULL:home'), away, home)!;
    expect(tt.state === 'ready' && tt.series[0].values).toEqual([13, 31, 24]);
    const sp = evidenceFor(by('spread:FULL:away'), away, home)!;
    expect(sp.state === 'ready' && sp.series[0].values).toEqual([-17, 7, -3, 6]);
  });
  it('says plainly when no per-period history exists, instead of borrowing full-game numbers', () => {
    const e = evidenceFor(by('total:1H:'), away, home);
    expect(e.state).toBe('none');
    expect(e.state === 'none' && e.reason).toMatch(/half-by-half scoring history/);
  });
  it('counts clears at the selected rung (>= k; margin >= k; wins for the moneyline)', () => {
    expect(clears('total', [54, 37, 35, 37], 37)).toEqual({ hit: 3, n: 4 });
    expect(clears('spread', [-17, 7, -3, 6], 7)).toEqual({ hit: 1, n: 4 });
    expect(clears('moneyline', [6, -3, 0], 0)).toEqual({ hit: 1, n: 3 });
  });
  it('no games yet is stated, not charted', () => {
    expect(evidenceFor(by('total:FULL:'), [], []).state).toBe('none');
  });
  it('words a rung', () => {
    expect(rungWords(by('team_total:FULL:away'), 18, 'Bears')).toBe('Bears scores 18 or more');
    expect(rungWords(by('spread:FULL:home'), 8, 'Seahawks')).toBe('Seahawks wins by 8 or more');
  });
});

describe('profileCurrent: stale statistics are never charted as recent games', () => {
  const now = Date.parse('2026-11-02T17:00:00Z');
  it('accepts this season, recently published (football year or NBA season label)', () => {
    expect(profileCurrent({ season: '2026', asOf: '2026-11-02T02:26:24Z' }, now).ok).toBe(true);
    expect(profileCurrent({ season: '2026-27', asOf: '2026-11-02T01:00:00Z' }, now).ok).toBe(true);
  });
  it('rejects last season’s NBA profile and says what it is', () => {
    const r = profileCurrent({ season: '2025-26', asOf: '2026-06-14T00:30:00Z' }, now);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/2025-26, as of 2026-06-14, not this season/);
  });
  it('rejects a current-season profile that has stopped updating, and a missing one', () => {
    expect(profileCurrent({ season: '2026', asOf: '2026-10-01T00:00:00Z' }, now).ok).toBe(false);
    expect(profileCurrent(null, now).ok).toBe(false);
  });
});
