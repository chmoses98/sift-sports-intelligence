// Live game detail (src/v3/data/live): the rights registry, the MLB adapter over TEST FIXTURES shaped like the real StatsAPI answers
// (tests/v3/fixtures/live: hand-written in the documented shape, NOT recordings: the build sandbox cannot reach statsapi.mlb.com), the freshness clock, the
// visibility-aware poller and the one place that decides what is printed or why it is not.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detailAgeMs, detailFreshness, situationText } from '../../src/v3/data/live/freshness';
import { feedAgrees, fetchMlbDetail, MlbError, mlbTimeStamp, parseMlbFeed, pickGamePk } from '../../src/v3/data/live/mlb';
import { startPoller } from '../../src/v3/data/live/poll';
import { chooseSource, DETAIL_SOURCES, sourceEnabled } from '../../src/v3/data/live/rights';
import type { DetailTarget, LiveDetail } from '../../src/v3/data/live/types';
import { withLiveDetail, type LiveDetailState } from '../../src/v3/data/live/useLiveDetail';
import { isMissing, liveView } from '../../src/v3/data/live/view';
import type { V3Game } from '../../src/v3/model/types';

const fx = (n: string) => JSON.parse(readFileSync(join('tests', 'v3', 'fixtures', 'live', n), 'utf8'));
const SCHED = () => fx('mlb-schedule.shape.json');
const FEED = () => fx('mlb-feed-live.shape.json');
const START = Date.parse('2026-10-31T00:08:00Z');
const T: DetailTarget = { sport: 'MLB', eventId: 'evt_1', startMs: START, away: { name: 'New York Yankees', abbr: 'NYY' }, home: { name: 'Los Angeles Dodgers', abbr: 'LAD' } };
const FETCHED = Date.parse('2026-10-31T02:03:05Z');

const team = (id: string, name: string) => ({ id, slug: 'mlb', sport: 'MLB', name, nick: name, abbr: id, logo: null, colors: ['#000', '#fff'] as [string, string] });
const game = (over: Partial<V3Game> = {}): V3Game => ({ key: 'mlb:evt_1', slug: 'mlb', sport: 'MLB', eventId: 'evt_1', league: 'MLB', phase: 'live', startMs: START, away: team('NYY', 'New York Yankees'), home: team('LAD', 'Los Angeles Dodgers'), score: null, lines: [], signals: 0, provenance: 'publication', ...over });

describe('rights registry', () => {
  it('only SportScore is cleared; MLB is blocked on rights and nothing else is registered', () => {
    expect(DETAIL_SOURCES.map((s) => [s.id, s.rights])).toEqual([['sportscore', 'cleared'], ['mlb', 'blocked-on-rights']]);
  });
  it('the default build enables the cleared source only', () => {
    expect(sourceEnabled(DETAIL_SOURCES[0], [])).toBe(true);
    expect(sourceEnabled(DETAIL_SOURCES[1], [])).toBe(false);
    expect(sourceEnabled(DETAIL_SOURCES[1], ['mlb'])).toBe(true);
  });
  it('NBA is score-only, MLB is blocked by default, NFL/CFB/NHL have no source', () => {
    const nba = chooseSource('NBA', []);
    expect(nba.kind === 'source' && nba.source.fetchesDetail).toBe(false);
    expect(nba.kind === 'source' && nba.source.capabilities.plays).toBe(false);
    expect(chooseSource('MLB', []).kind).toBe('blocked');
    for (const s of ['NFL', 'CFB', 'NHL', 'CBB', 'SOCCER']) expect(chooseSource(s, []).kind).toBe('none');
  });
  it('a build that names mlb reads it', () => {
    const c = chooseSource('MLB', ['mlb']);
    expect(c.kind === 'source' && c.source.id).toBe('mlb');
  });
});

describe('MLB feed parser (fixture shaped like the live feed)', () => {
  const d = (): LiveDetail => parseMlbFeed(FEED(), FETCHED);
  it('maps phase, score, period and the provider time', () => {
    const x = d();
    expect(x.phase).toBe('live');
    expect(x.score).toEqual({ away: 3, home: 2 });
    expect(x.period).toEqual({ label: 'Top 7th', clock: null });
    expect(x.providerAt).toBe(Date.parse('2026-10-31T02:03:01Z'));
    expect(x.source.id).toBe('mlb');
  });
  it('reads the baseball situation only from stated fields', () => {
    const s = d().situation;
    expect(s).toEqual({ kind: 'baseball', half: 'top', inning: 7, outs: 1, balls: 2, strikes: 1, bases: [true, false, true] });
    expect(situationText(s)).toBe('1 out, 2-1 count, runners on 1st and 3rd');
  });
  it('lists real plays newest first, skips a play still in progress, and marks the scoring side by the half-inning', () => {
    const p = d().plays!;
    expect(p).toHaveLength(5);
    expect(p[0].text).toMatch(/Batter Four singles/);
    expect(p[0]).toMatchObject({ scoring: 'away', periodLabel: 'Top 7th', score: { away: 3, home: 2 } });
    expect(p.find((x) => /homers/.test(x.text))).toMatchObject({ scoring: 'home', periodLabel: 'Bot 2nd' });
    expect(p.find((x) => /strikes out/.test(x.text))!.scoring).toBeNull();
    expect(p.some((x) => /at the plate/.test(x.text))).toBe(false);
  });
  it('builds box-score leaders from reported stats only, ranked (ties by name), and omits zero lines', () => {
    const L = d().leaders!;
    const awayBat = L.find((x) => x.side === 'away' && x.title === 'Batting')!;
    expect(awayBat.rows.map((r) => r.name)).toEqual(['Test Batter Two', 'Test Batter Four', 'Test Batter Three']);
    expect(awayBat.rows[0].line).toBe('2-for-3, 1 RBI, 1 BB');
    const homeBat = L.find((x) => x.side === 'home' && x.title === 'Batting')!;
    expect(homeBat.rows).toEqual([{ name: 'Test Hitter Nine', line: '2-for-3, HR, 2 RBI' }]);
    expect(L.find((x) => x.side === 'away' && x.title === 'Pitching')!.rows[0]).toEqual({ name: 'Test Starter Away', line: '6.0 IP, 7 K, 2 ER' });
  });
  it('a between-innings state is a break with no situation; a final has the score and no period', () => {
    const b = FEED(); b.liveData.linescore.inningState = 'Middle';
    const x = parseMlbFeed(b, FETCHED);
    expect(x.phase).toBe('break'); expect(x.period.label).toBe('Mid 7th'); expect(x.situation).toBeNull();
    const f = FEED(); f.gameData.status = { abstractGameState: 'Final', detailedState: 'Final' };
    const y = parseMlbFeed(f, FETCHED);
    expect(y.phase).toBe('final'); expect(y.score).toEqual({ away: 3, home: 2 }); expect(y.period.label).toBeNull();
  });
  it('a game that has not started has no score, and a delay is "other"', () => {
    const p = FEED(); p.gameData.status = { abstractGameState: 'Preview', detailedState: 'Scheduled' }; p.liveData.linescore.teams = { away: {}, home: {} };
    expect(parseMlbFeed(p, FETCHED)).toMatchObject({ phase: 'other', score: null, situation: null });
    const dl = FEED(); dl.gameData.status = { abstractGameState: 'Live', detailedState: 'Delayed: Rain' };
    expect(parseMlbFeed(dl, FETCHED).phase).toBe('other');
  });
  it('a feed with no plays or box score says null (not carried), a feed with an empty play list says []', () => {
    const a = FEED(); delete a.liveData.plays; delete a.liveData.boxscore;
    expect(parseMlbFeed(a, FETCHED)).toMatchObject({ plays: null, leaders: null });
    const b = FEED(); b.liveData.plays.allPlays = [];
    expect(parseMlbFeed(b, FETCHED).plays).toEqual([]);
  });
  it('rejects a document that is not a live feed, and parses the timestamp format only', () => {
    expect(() => parseMlbFeed({ nope: 1 }, FETCHED)).toThrow(MlbError);
    expect(mlbTimeStamp('20261031_020301')).toBe(Date.parse('2026-10-31T02:03:01Z'));
    expect(mlbTimeStamp('2026-10-31')).toBeNull();
  });
});

describe('matching a SIFT game to one MLB game', () => {
  it('both teams, same orientation, start within an hour: exactly one', () => {
    expect(pickGamePk(SCHED(), T)).toBe(900001);
  });
  it('swapped orientation, a different start, an unknown club or two candidates match nothing', () => {
    expect(pickGamePk(SCHED(), { ...T, away: T.home, home: T.away })).toBeNull();
    expect(pickGamePk(SCHED(), { ...T, startMs: START + 3 * 3600_000 })).toBeNull();
    expect(pickGamePk(SCHED(), { ...T, home: { name: 'Nowhere Nine', abbr: 'NWN' } })).toBeNull();
    const dup = SCHED(); dup.dates[0].games.push({ ...dup.dates[0].games[0], gamePk: 900009 });
    expect(pickGamePk(dup, T)).toBeNull();
  });
  it('the feed itself must agree with the pairing', () => {
    expect(feedAgrees(FEED(), T)).toBe(true);
    const o = FEED(); o.gameData.teams.home.name = 'Boston Red Sox';
    expect(feedAgrees(o, T)).toBe(false);
  });
});

describe('fetchMlbDetail', () => {
  const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  it('asks the schedule once, then only the feed; the timestamp is the fetch time', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (u: string) => { calls.push(u); return answer(u.includes('/schedule') ? SCHED() : FEED()); }) as unknown as typeof fetch;
    const pkCache = new Map<string, number>();
    const a = await fetchMlbDetail(T, { fetchImpl, now: () => FETCHED, pkCache });
    await fetchMlbDetail(T, { fetchImpl, now: () => FETCHED, pkCache });
    expect(a.fetchedAt).toBe(FETCHED);
    expect(calls.filter((c) => c.includes('/schedule'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/game/900001/feed/live'))).toHaveLength(2);
    expect(calls.every((c) => c.startsWith('https://statsapi.mlb.com/api/'))).toBe(true);
  });
  it('no matching game is "no-match", a bad status is "http", and a feed for another pairing is dropped and re-asked', async () => {
    const none = (async () => answer({ dates: [] })) as unknown as typeof fetch;
    await expect(fetchMlbDetail(T, { fetchImpl: none })).rejects.toMatchObject({ kind: 'no-match' });
    const bad = (async () => answer({}, 503)) as unknown as typeof fetch;
    await expect(fetchMlbDetail(T, { fetchImpl: bad })).rejects.toMatchObject({ kind: 'http' });
    const other = FEED(); other.gameData.teams.away.name = 'Boston Red Sox';
    const pkCache = new Map<string, number>();
    const mixed = (async (u: string) => answer(u.includes('/schedule') ? SCHED() : other)) as unknown as typeof fetch;
    await expect(fetchMlbDetail(T, { fetchImpl: mixed, pkCache })).rejects.toMatchObject({ kind: 'no-match' });
    expect(pkCache.size).toBe(0);
  });
  it('a network failure is "network"', async () => {
    const down = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    await expect(fetchMlbDetail(T, { fetchImpl: down })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('freshness', () => {
  const at = (fetchedAt: number, providerAt: number | null = null, phase: LiveDetail['phase'] = 'live') => ({ fetchedAt, providerAt, phase });
  it('live under a minute, delayed up to five, stale beyond; a final never ages', () => {
    const t0 = 1_000_000_000_000;
    expect(detailFreshness(at(t0), t0 + 59_000)).toBe('live');
    expect(detailFreshness(at(t0), t0 + 60_000)).toBe('delayed');
    expect(detailFreshness(at(t0), t0 + 300_000)).toBe('delayed');
    expect(detailFreshness(at(t0), t0 + 300_001)).toBe('withheld');
    expect(detailFreshness(at(t0, null, 'final'), t0 + 3600_000)).toBe('live');
  });
  it('age runs from the provider time when it has one, and a future provider time is not trusted', () => {
    const t0 = 1_000_000_000_000;
    expect(detailAgeMs(at(t0, t0 - 90_000), t0)).toBe(90_000);
    expect(detailFreshness(at(t0, t0 - 90_000), t0)).toBe('delayed');
    expect(detailAgeMs(at(t0, t0 + 3600_000), t0 + 10_000)).toBe(10_000);
  });
  it('situation text for football and hockey carries only what is stated', () => {
    expect(situationText({ kind: 'football', possession: 'home', downDistance: '3rd & 7', yardLine: 'LAD 42' })).toBe('3rd & 7 · LAD 42');
    expect(situationText({ kind: 'football', possession: null, downDistance: null, yardLine: null })).toBeNull();
    expect(situationText({ kind: 'hockey', powerPlay: { side: 'away', remaining: '1:12' } })).toBe('Power play, 1:12 left');
    expect(situationText({ kind: 'hockey', powerPlay: null })).toBeNull();
    expect(situationText({ kind: 'baseball', half: 'top', inning: 1, outs: 0, balls: null, strikes: null, bases: [false, false, false] })).toBe('0 outs, bases empty');
    expect(situationText(null)).toBeNull();
  });
});

describe('visibility-aware poller', () => {
  let hidden = false;
  let now = 0;
  const setHidden = (h: boolean) => { hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
  beforeEach(() => { vi.useFakeTimers(); hidden = false; now = 0; });
  afterEach(() => { vi.useRealTimers(); });
  const make = (fetchImpl: (s: AbortSignal) => Promise<number>) => {
    const data: number[] = []; const errs: unknown[] = [];
    const stop = startPoller<number>({ intervalMs: 20_000, fetch: fetchImpl, onData: (v) => data.push(v), onError: (e) => errs.push(e), now: () => now, isHidden: () => hidden });
    return { data, errs, stop };
  };
  const tick = async (ms: number) => { now += ms; await vi.advanceTimersByTimeAsync(ms); };

  it('asks now, then every interval, and stops when told', async () => {
    let n = 0;
    const p = make(async () => ++n);
    await tick(0);
    expect(p.data).toEqual([1]);
    await tick(20_000); await tick(20_000);
    expect(p.data).toEqual([1, 2, 3]);
    p.stop();
    await tick(60_000);
    expect(p.data).toHaveLength(3);
  });
  it('asks nothing while hidden; coming back with an old answer asks at once', async () => {
    let n = 0;
    const p = make(async () => ++n);
    await tick(0);
    setHidden(true);
    await tick(120_000);
    expect(p.data).toEqual([1]);
    setHidden(false);
    await tick(0);
    expect(p.data).toEqual([1, 2]);
    p.stop();
  });
  it('coming back with a recent answer waits out the rest of the interval', async () => {
    let n = 0;
    const p = make(async () => ++n);
    await tick(0);
    await tick(5_000);
    setHidden(true); setHidden(false);
    await tick(0);
    expect(p.data).toEqual([1]);
    await tick(15_000);
    expect(p.data).toEqual([1, 2]);
    p.stop();
  });
  it('a hidden page does not start polling at all, and shows up polling when it becomes visible', async () => {
    hidden = true;
    let n = 0;
    const p = make(async () => ++n);
    await tick(60_000);
    expect(n).toBe(0);
    setHidden(false);
    await tick(0);
    expect(p.data).toEqual([1]);
    p.stop();
  });
  it('backs off after failures (interval x 2^n) and resets on success', async () => {
    let n = 0;
    const p = make(async () => { n += 1; if (n <= 2) throw new Error('down'); return n; });
    await tick(0);
    expect(p.errs).toHaveLength(1);
    await tick(20_000); expect(p.errs).toHaveLength(1); // the next ask is at 40 s
    await tick(20_000); expect(p.errs).toHaveLength(2);
    await tick(79_000); expect(p.data).toHaveLength(0); // the next ask is at 80 s
    await tick(1_000); expect(p.data).toEqual([3]);
    await tick(20_000); expect(p.data).toEqual([3, 4]); // back to the plain interval
    p.stop();
  });
  it('an aborted request (the page went hidden) is not reported as a failure', async () => {
    const p = make((s) => new Promise<number>((_, rej) => s.addEventListener('abort', () => rej(new Error('aborted')))));
    await tick(0);
    setHidden(true);
    await tick(0);
    expect(p.errs).toHaveLength(0);
    p.stop();
  });
});

const detailOf = (over: Partial<LiveDetail> = {}): LiveDetail => ({ ...parseMlbFeed(FEED(), FETCHED), ...over });
const ready = (d: LiveDetail | null, freshness: 'live' | 'delayed' | 'withheld' | null = 'live', error: unknown = null): LiveDetailState => ({ kind: 'ready', source: DETAIL_SOURCES[1], detail: d, freshness, error, retry: () => {} });

describe('what the live block prints', () => {
  it('a ready MLB feed gives score, period, situation, plays and leaders', () => {
    const v = liveView(game({ score: { away: 3, home: 2, clock: 'Top 7th', source: 'score-feed', asOf: null } }), ready(detailOf()));
    expect(v.mode).toBe('live');
    expect(v.score).toEqual({ away: 3, home: 2 });
    expect(v.period).toBe('Top 7th');
    expect(isMissing(v.clock) && v.clock.missing).toBe('Baseball has no game clock.');
    expect(isMissing(v.situation)).toBe(false);
    expect(isMissing(v.plays) || v.plays.length).toBe(5);
    expect(isMissing(v.leaders)).toBe(false);
  });
  it('NBA (score-only): the score is the slate\'s, everything else says the feed publishes score and period only', () => {
    const g = game({ sport: 'NBA', slug: 'nba', score: { away: 61, home: 58, clock: '3rd quarter', source: 'score-feed', asOf: null } });
    const v = liveView(g, { kind: 'score-only', source: DETAIL_SOURCES[0] });
    expect(v.score).toEqual({ away: 61, home: 58 });
    expect(v.period).toBe('3rd quarter');
    expect(isMissing(v.clock) && v.clock.missing).toBe('Not published by the feed.');
    for (const f of [v.situation, v.plays, v.leaders]) expect(isMissing(f) && f.missing).toMatch(/publishes the score and period only/);
    expect(v.source).toEqual({ label: 'SportScore', attribution: 'Powered by SportScore' });
  });
  it('NFL/CFB/NHL: no live feed, said plainly, with no score invented', () => {
    for (const sport of ['NFL', 'CFB', 'NHL']) {
      const v = liveView(game({ sport, slug: sport.toLowerCase() }), { kind: 'none' });
      expect(isMissing(v.score)).toBe(true);
      expect(isMissing(v.plays) && v.plays.missing).toMatch(/no live feed whose published terms permit this use/);
      expect(v.source).toBeNull();
    }
    expect(isMissing(liveView(game({ sport: 'NFL' }), { kind: 'none' }).situation) && true).toBe(true);
  });
  it('a blocked source is named and never presented as a result', () => {
    const v = liveView(game(), { kind: 'blocked', source: DETAIL_SOURCES[1] });
    expect(isMissing(v.plays) && v.plays.missing).toMatch(/MLB StatsAPI, which is not connected: its terms are not cleared/);
  });
  it('no answer yet: a failure or a non-match is said as such, never as an empty result', () => {
    const down = liveView(game(), ready(null, null, new Error('x')));
    expect(isMissing(down.plays) && down.plays.missing).toMatch(/did not answer. Trying again/);
    const nm = liveView(game(), ready(null, null, new MlbError('no-match', 'x')));
    expect(isMissing(nm.plays) && nm.plays.missing).toMatch(/no single game matching/);
  });
  it('stale detail is withheld everywhere, delayed detail is marked, and a failed refresh is flagged', () => {
    const stale = liveView(game({ score: { away: 3, home: 2, clock: 'Top 7th', source: 'score-feed', asOf: null } }), ready(detailOf(), 'withheld'));
    expect(stale.mode).toBe('withheld');
    for (const f of [stale.score, stale.period, stale.clock, stale.situation, stale.plays, stale.leaders]) expect(isMissing(f)).toBe(true);
    expect(liveView(game(), ready(detailOf(), 'delayed')).freshness).toBe('delayed');
    expect(liveView(game(), ready(detailOf(), 'live', new Error('x'))).refreshFailed).toBe(true);
  });
});

describe('the hero over a live detail', () => {
  it('fills a missing score and situation from a fresh answer, labelled as a score-feed score', () => {
    const out = withLiveDetail(game(), ready(detailOf()));
    expect(out.score).toMatchObject({ away: 3, home: 2, clock: 'Top 7th', source: 'score-feed', delayed: false });
    expect(out.situation?.text).toBe('1 out, 2-1 count, runners on 1st and 3rd');
  });
  it('marks a delayed answer, never prints a stale one, and leaves a verified slate score alone', () => {
    expect(withLiveDetail(game(), ready(detailOf(), 'delayed')).score?.delayed).toBe(true);
    expect(withLiveDetail(game(), ready(detailOf(), 'withheld')).score).toBeNull();
    const own = game({ score: { away: 9, home: 8, clock: 'Bot 8th', source: 'score-feed', asOf: null } });
    expect(withLiveDetail(own, ready(detailOf())).score).toMatchObject({ away: 9, home: 8 });
  });
  it('does nothing for a score-only, blocked, loading or missing answer, or a game that is not in play', () => {
    const g = game();
    expect(withLiveDetail(g, { kind: 'none' })).toBe(g);
    expect(withLiveDetail(g, { kind: 'blocked', source: DETAIL_SOURCES[1] })).toBe(g);
    expect(withLiveDetail(g, ready(null, null, new Error('x')))).toBe(g);
    const pre = game({ phase: 'pregame' });
    expect(withLiveDetail(pre, ready(detailOf()))).toBe(pre);
  });
});
