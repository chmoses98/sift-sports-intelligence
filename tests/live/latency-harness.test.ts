// The latency harness (scripts/live-latency): extractors, the run policy and the analyser, on SYNTHETIC data. These prove
// the arithmetic and the refusal rules, not any feed's real latency (none was measured; docs/LIVE_VENDOR_EVALUATION.md §6).
import { describe, expect, it } from 'vitest';
import { alignTaps, buildChains, cleanMarks, compare, quantile, toMarkdown, type Mark, type Rec } from '../../scripts/live-latency/analyze.mjs';
import { EXTRACTORS, abbr } from '../../scripts/live-latency/feeds.mjs';
import { afterResponse, planRun } from '../../scripts/live-latency/policy.mjs';

describe('extractors (synthetic payloads)', () => {
  it('reads NHL, NBA, MLB and ESPN shapes into one cross-feed game key', () => {
    const nhl = EXTRACTORS['nhl-web'].extract({ games: [{ gameState: 'LIVE', awayTeam: { abbrev: 'TB', score: 1 }, homeTeam: { abbrev: 'BOS', score: 2 }, periodDescriptor: { number: 2 }, clock: { timeRemaining: '08:12' } }] });
    const espn = EXTRACTORS['espn-nhl'].extract({ events: [{ competitions: [{ competitors: [{ homeAway: 'home', score: '2', team: { abbreviation: 'BOS' } }, { homeAway: 'away', score: '1', team: { abbreviation: 'TBL' } }], status: { period: 2, displayClock: '8:12', type: { name: 'STATUS_IN_PROGRESS', state: 'in' } } }] }] });
    expect(nhl[0]).toMatchObject({ game: 'NHL:TBL@BOS', awayScore: 1, homeScore: 2, period: 2, live: true });
    expect(espn[0].game).toBe(nhl[0].game);
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

describe('run policy: provider conditions are enforced before any request', () => {
  it('refuses a no-licence feed without --ack-unlicensed, and a reported-prohibited feed without its own ack', () => {
    expect(planRun(['nhl-web'], EXTRACTORS, {}).ok).toBe(false);
    expect(planRun(['nhl-web'], EXTRACTORS, { ackUnlicensed: true }).ok).toBe(true);
    const espn = planRun(['espn-nba'], EXTRACTORS, { ackUnlicensed: true });
    expect(espn.ok).toBe(false);
    expect(espn.errors[0]).toContain('--ack-prohibited espn-nba');
    expect(planRun(['espn-nba'], EXTRACTORS, { ackProhibited: ['espn-nba'] }).ok).toBe(true);
  });
  it('never goes under a feed\'s floor, whatever interval is asked for, and caps the run length', () => {
    const p = planRun(['nhl-web', 'espn-nhl'], EXTRACTORS, { interval: 500, ackUnlicensed: true, ackProhibited: ['espn-nhl'], minutes: 60 });
    expect(p.feeds.map((f) => [f.id, f.intervalMs, f.clamped])).toEqual([['nhl-web', 5000, true], ['espn-nhl', 15000, true]]);
    expect(p.totalRequests).toBe(720 + 240);
    expect(planRun(['nhl-web'], EXTRACTORS, { ackUnlicensed: true, minutes: 600 }).ok).toBe(false);
    expect(planRun(['nope'], EXTRACTORS, {}).errors[0]).toContain('unknown feed');
  });
  it('stops a feed on 403/429 (no retry), backs off on 5xx', () => {
    expect([afterResponse(429), afterResponse(403), afterResponse(503), afterResponse(200)]).toEqual(['STOP', 'STOP', 'BACKOFF', 'OK']);
  });
});

const G = 'NHL:NYR@BOS';
const base = (src: string, score: string, seenAt: number): Rec => ({ type: 'baseline', src, game: G, score, seenAt });
const ch = (src: string, score: string, seenAt: number, prevPollAt: number): Rec => ({ type: 'change', kind: 'score', src, game: G, score, seenAt, prevPollAt });
const tap = (kind: 'real' | 'truth', team: 'away' | 'home', at: number): Mark => ({ kind, game: G, team, at });

// Progression 0-0 → 1-0 (away) → 1-1 (home) → 2-1 (away) → 3-1 (away). Times in ms.
// A sees each step at T+1 s (polled 2 s apart); B is 6 s later; B never shows 2-1 (it polled across it: 1-1 → 3-1).
const T = [10_000, 50_000, 90_000, 130_000];
const records: Rec[] = [
  base('A', '0-0', 0), base('B', '0-0', 0),
  ch('A', '1-0', T[0] + 1000, T[0] - 1000), ch('A', '1-1', T[1] + 1000, T[1] - 1000), ch('A', '2-1', T[2] + 1000, T[2] - 1000), ch('A', '3-1', T[3] + 1000, T[3] - 1000),
  ch('B', '1-0', T[0] + 7000, T[0] + 5000), ch('B', '1-1', T[1] + 7000, T[1] + 5000), ch('B', '3-1', T[3] + 7000, T[3] + 5000),
];

describe('identity-based analysis (synthetic records)', () => {
  it('matches feeds by resulting score, so B\'s skipped step is MISSED, not mis-paired with the next change', () => {
    const r = compare(records, []);
    expect(r.delays.filter((d) => d.src === 'B').map((d) => d.key)).toEqual(['1-0', '1-1', '3-1']);
    expect(r.stats.B).toMatchObject({ n: 3, medianMs: 6000, medianUncertaintyMs: 2000 });
    expect(r.coverage.B).toMatchObject({ steps: 5, observed: 4, missed: 1, missedRate: 0.2 });
    expect(r.coverage.A.missed).toBe(0);
    const steps = buildChains(records).get(G)!;
    expect(steps.map((s) => s.team)).toEqual([null, 'away', 'home', 'away', 'away']);
  });

  it('aligns Real taps by team and time, survives a missed tap, and reports the unmatched step', () => {
    // Real taps are 3 s after the true instant (= A's window midpoint); the operator missed the 2-1 away goal.
    const marks = [tap('real', 'away', T[0] + 3000), tap('real', 'home', T[1] + 3000), tap('real', 'away', T[3] + 3000)];
    const r = compare(records, marks);
    expect(r.stats.real).toMatchObject({ n: 3, medianMs: 3000 });
    expect(r.unmatched.steps).toEqual([{ game: G, kind: 'real', key: '2-1', team: 'away' }]);
    expect(r.coverage.real).toMatchObject({ steps: 4, observed: 3, missed: 1 });
  });

  it('marks a pair low-confidence when another same-team step is almost as near, and keeps it out of the headline', () => {
    const dense: Rec[] = [base('A', '0-0', 0), ch('A', '1-0', 11_000, 9_000), ch('A', '2-0', 25_000, 23_000)];
    const { pairs } = alignTaps([{ team: 'away', at: 18_000 }], buildChains(dense).get(G)!);
    expect(pairs[0].confidence).toBe('low');
    const r = compare(dense, [tap('real', 'away', 18_000)]);
    expect(r.stats.real).toBeUndefined();
    expect(r.statsLowConfidence.real.n).toBe(1);
  });

  it('leaves a tap with no step in the window unmatched, and flags a far-off pairing instead of hiding it', () => {
    const r = compare(records, [tap('real', 'home', 300_000)]);
    expect(r.unmatched.taps.map((x) => x.at)).toEqual([300_000]);
    expect(r.stats.real).toBeUndefined();
    const far = compare(records, [tap('real', 'home', T[0] + 3000)]); // 37 s before the only home step: inside the window, implausible
    expect(far.warnings.some((w) => w.includes('differ by more than 30s'))).toBe(true);
  });

  it('measures against truth taps for absolute delay, and carries the human reaction error', () => {
    const truth = T.map((t) => tap('truth', t === T[2] ? 'away' : t === T[1] ? 'home' : 'away', t));
    const r = compare(records, truth, { ref: 'truth' });
    expect(r.stats.A).toMatchObject({ n: 4, medianMs: 0 }); // A's window is centred on the truth tap
    expect(r.stats.A.medianUncertaintyMs).toBe(1000 + 700);
  });

  it('applies undo, drops double-taps, ignores status changes, and warns on thin samples and a bad clock', () => {
    const m = cleanMarks([tap('real', 'away', 1000), tap('real', 'away', 1500), { kind: 'undo', of: 'real', game: G, at: 2000 } as Mark, tap('real', 'home', 5000)]);
    expect(m.map((x) => [x.team, x.at])).toEqual([['home', 5000]]);
    const r = compare([...records, { type: 'change', kind: 'status', src: 'A', game: G, score: '9-9', seenAt: 1, prevPollAt: 0 }], []);
    expect(r.stats.A.n).toBe(4);
    expect(r.warnings.some((w) => w.includes('only 3 paired'))).toBe(true);
    const clock = compare([...records, ...Array.from({ length: 6 }, (_, i) => ({ type: 'poll', src: 'A', at: 100_000 + i * 5000, rttMs: 100, httpDate: new Date(110_000 + i * 5000).toUTCString(), age: null }))], []);
    expect(clock.warnings.some((w) => w.includes('clock'))).toBe(true);
  });

  it('renders coverage, low-confidence and clock sections', () => {
    const md = toMarkdown(compare(records, [tap('real', 'away', T[0] + 3000)]));
    expect(md).toContain('| B | 3 | 6.0s |');
    expect(md).toContain('missed rate');
    expect(md).toContain('Clock check');
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
});
