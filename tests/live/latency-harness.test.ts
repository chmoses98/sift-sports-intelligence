// The latency harness (scripts/live-latency): extractors on SYNTHETIC payloads and the analyser on SYNTHETIC records.
// These prove the arithmetic and the refusal rules, not any feed's real latency (none was measured; see
// docs/LIVE_PUSH_ARCHITECTURE.md §1).
import { describe, expect, it } from 'vitest';
import { compare, quantile, toMarkdown, type ChangeRec } from '../../scripts/live-latency/analyze.mjs';
import { EXTRACTORS, abbr } from '../../scripts/live-latency/feeds.mjs';

describe('extractors (synthetic payloads)', () => {
  it('reads NHL, NBA, MLB and ESPN shapes into one cross-feed game key', () => {
    const nhl = EXTRACTORS['nhl-web'].extract({ games: [{ gameState: 'LIVE', awayTeam: { abbrev: 'TB', score: 1 }, homeTeam: { abbrev: 'BOS', score: 2 }, periodDescriptor: { number: 2 }, clock: { timeRemaining: '08:12' } }] });
    const espn = EXTRACTORS['espn-nhl'].extract({ events: [{ competitions: [{ competitors: [{ homeAway: 'home', score: '2', team: { abbreviation: 'BOS' } }, { homeAway: 'away', score: '1', team: { abbreviation: 'TBL' } }], status: { period: 2, displayClock: '8:12', type: { name: 'STATUS_IN_PROGRESS', state: 'in' } } }] }] });
    expect(nhl[0]).toMatchObject({ game: 'NHL:TBL@BOS', awayScore: 1, homeScore: 2, period: 2, live: true });
    expect(espn[0].game).toBe(nhl[0].game); // TB and TBL are one team
    const nba = EXTRACTORS['nba-cdn'].extract({ scoreboard: { games: [{ gameStatus: 2, period: 3, gameClock: 'PT04M32.00S', awayTeam: { teamTricode: 'NYK', score: 80 }, homeTeam: { teamTricode: 'BOS', score: 85 } }] } });
    expect(nba[0]).toMatchObject({ game: 'NBA:NYK@BOS', live: true, awayScore: 80 });
    const mlb = EXTRACTORS['mlb-statsapi'].extract({ dates: [{ games: [{ status: { abstractGameState: 'Live', detailedState: 'In Progress' }, teams: { away: { team: { abbreviation: 'ATL' }, score: 1 }, home: { team: { abbreviation: 'NYM' }, score: 0 } }, linescore: { currentInning: 6, inningHalf: 'Top' } }] }] });
    expect(mlb[0]).toMatchObject({ game: 'MLB:ATL@NYM', period: 6, live: true });
    expect(abbr('NBA', 'GS')).toBe('GSW');
  });
  it('skips rows it cannot read and tolerates a body of the wrong shape', () => {
    expect(EXTRACTORS['nhl-web'].extract({ games: [{ awayTeam: {}, homeTeam: {} }] })).toEqual([]);
    expect(EXTRACTORS['espn-nfl'].extract(null)).toEqual([]);
    expect(EXTRACTORS['nba-cdn'].extract({ nope: 1 })).toEqual([]);
  });
});

const ch = (src: string, game: string, seenAt: number, prevPollAt: number): ChangeRec => ({ type: 'change', kind: 'score', src, game, seenAt, prevPollAt });
const G = 'NHL:NYR@BOS';

describe('analyser (synthetic records)', () => {
  // Three goals. Feed A sees each at +0.5 s after the previous poll's midpoint; B is 6 s later; Real's phone tap is 2 s after A.
  const records = [
    ...[10_000, 50_000, 90_000].map((t) => ch('A', G, t + 1000, t - 1000)),
    ...[10_000, 50_000, 90_000].map((t) => ch('B', G, t + 7000, t + 5000)),
  ];
  const marks = [12_000, 52_000, 92_000].map((at) => ({ kind: 'real' as const, game: G, at }));

  it('reports delays against the fastest source, with the polling window as uncertainty', () => {
    const r = compare(records, marks);
    expect(r.stats.A).toMatchObject({ n: 3, medianMs: 0 });
    expect(r.stats.B).toMatchObject({ n: 3, medianMs: 6000, medianUncertaintyMs: 2000 });
    expect(r.stats.real.medianMs).toBe(2000);
    expect(r.stats.real.medianUncertaintyMs).toBe(1700); // 0.7 s human + 1.0 s reference half-window
  });

  it('measures against truth marks when given, and a named source on request', () => {
    const truth = [10_000, 50_000, 90_000].map((at) => ({ kind: 'truth' as const, game: G, at }));
    expect(compare(records, [...marks, ...truth], { ref: 'truth' }).stats.real.medianMs).toBe(2000);
    expect(compare(records, [], { ref: 'B' }).stats.A.medianMs).toBe(-6000);
  });

  it('excludes a game whose counts disagree instead of forcing a pairing', () => {
    const r = compare([...records, ch('B', 'NBA:NYK@BOS', 5000, 3000)], marks.slice(0, 2));
    expect(r.unpaired.some((u) => u.game === G && u.src === 'real' && u.got === 2 && u.expected === 3)).toBe(true);
    expect(r.stats.real).toBeUndefined();
  });

  it('ignores status changes, and renders a table with the uncertainty column', () => {
    const r = compare([...records, { ...ch('A', G, 99_000, 98_000), kind: 'status' as const }], marks);
    expect(r.stats.A.n).toBe(3);
    expect(toMarkdown(r)).toContain('| B | 3 | 6.0s |');
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
});
