// The live-score prototype: provider parsing, strict identity matching, the score clock and the outage chain.
// Fixtures are SYNTHETIC (tests/fixtures/live-scores/README.md): they exercise code, not any provider's real behaviour.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalizeGame, eventRefFromBoardItem, matchGameToEvent, pairGames, TeamDirectory, teamKey } from '../../src/live/scores/identity';
import { scoreFreshness, scoreView } from '../../src/live/scores/freshness';
import { espnProvider, parseEspnScoreboard } from '../../src/live/scores/providers/espn';
import { parseOddsScores } from '../../src/live/scores/providers/oddsapi';
import { LiveScoreService } from '../../src/live/scores/service';
import { ScoreProviderError, type LiveGame, type LiveScoreProvider, type SiftEventRef } from '../../src/live/scores/types';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'live-scores', n), 'utf-8'));
const FETCHED = '2026-10-18T19:02:30.000Z';
const T0 = Date.parse(FETCHED);

const NFL_DIR = new TeamDirectory('NFL', [
  { abbr: 'IND', name: 'Indianapolis Colts' }, { abbr: 'BAL', name: 'Baltimore Ravens' }, { abbr: 'WAS', name: 'Washington Commanders' },
  { abbr: 'NYJ', name: 'New York Jets' }, { abbr: 'BUF', name: 'Buffalo Bills' }, { abbr: 'NE', name: 'New England Patriots' },
  { abbr: 'ATL', name: 'Atlanta Falcons' }, { abbr: 'CLE', name: 'Cleveland Browns' }, { abbr: 'DEN', name: 'Denver Broncos' },
]);
const espnNfl = () => parseEspnScoreboard('NFL', fx('espn-nfl.synthetic.json'), FETCHED).map((g) => canonicalizeGame(g, NFL_DIR));

describe('ESPN parsing', () => {
  it('reads a live game: score, clock, period, situation, provenance', () => {
    const g = espnNfl().find((x) => x.provenance.providerGameId === '900001')!;
    expect(g).toMatchObject({
      phase: 'LIVE', score: { home: 14, away: 17 }, startUtc: '2026-10-18T17:00:00.000Z',
      clock: { period: 3, display: '4:32', seconds: 272, direction: 'down', running: null },
      situation: { downDistance: '3rd & 7', possessionTeam: 'NFL:BAL', lastPlay: 'Incomplete pass to the right.' },
      provenance: { provider: 'espn', fetchedAt: FETCHED, providerUpdatedAt: null },
    });
    expect(g.home.key).toBe('NFL:IND');
  });

  it('a scheduled game has no score and no clock, even though ESPN says "0" and 0:00', () => {
    const g = espnNfl().find((x) => x.provenance.providerGameId === '900002')!;
    expect(g).toMatchObject({ phase: 'SCHEDULED', score: null, clock: null, situation: null });
    expect(g.home.key).toBe('NFL:WAS'); // ESPN's WSH -> the publication's WAS
  });

  it('reads a final; an unrecognised status is UNKNOWN, never LIVE; a game with no scores is null-scored', () => {
    const by = (id: string) => espnNfl().find((x) => x.provenance.providerGameId === id)!;
    expect(by('900003')).toMatchObject({ phase: 'FINAL', score: { home: 24, away: 21 }, clock: null });
    expect(by('900004')).toMatchObject({ phase: 'UNKNOWN', score: null });
  });

  it('skips a malformed row (one team) instead of repairing it, and rejects a body with no events', () => {
    expect(espnNfl().map((g) => g.provenance.providerGameId)).not.toContain('900005');
    expect(() => parseEspnScoreboard('NFL', { nope: 1 }, FETCHED)).toThrow(ScoreProviderError);
  });

  it('baseball has no clock: ESPN\'s 0:00 is dropped, the inning and runners are kept', () => {
    const g = parseEspnScoreboard('MLB', fx('espn-mlb-doubleheader.synthetic.json'), FETCHED)[1];
    expect(g.clock).toMatchObject({ period: 7, periodLabel: 'Top 7th', display: null, seconds: null, direction: null });
    expect(g.situation).toMatchObject({ outs: 2, bases: [true, false, true] });
  });
});

describe('Odds API parsing (a feed with no clock)', () => {
  const games = parseOddsScores('NFL', fx('oddsapi-nfl.synthetic.json'), FETCHED).map((g) => canonicalizeGame(g, NFL_DIR));
  it('carries the provider time, no clock, no situation, and a null score before kickoff', () => {
    expect(games[0]).toMatchObject({ phase: 'LIVE', score: { home: 14, away: 17 }, clock: null, situation: null, provenance: { providerUpdatedAt: '2026-10-18T19:02:11Z' } });
    expect(games[1]).toMatchObject({ phase: 'SCHEDULED', score: null });
  });
  it('resolves full names to the publication\'s keys, so two providers agree on the same game', () => {
    const e = espnNfl().find((x) => x.provenance.providerGameId === '900001')!;
    expect([games[0].home.key, games[0].away.key]).toEqual([e.home.key, e.away.key]);
  });
});

const ev = (o: Partial<SiftEventRef> = {}): SiftEventRef => ({ eventId: 'evt_1', sport: 'NFL', startUtc: '2026-10-18T17:00:00Z', home: { key: 'NFL:IND', name: 'Indianapolis Colts' }, away: { key: 'NFL:BAL', name: 'Baltimore Ravens' }, ...o });
const live = () => espnNfl().find((x) => x.provenance.providerGameId === '900001')!;

describe('strict identity', () => {
  it('matches on both teams, orientation and a start inside the window', () => {
    expect(matchGameToEvent(live(), ev())).toEqual({ ok: true, match: { eventId: 'evt_1', method: 'TEAMS_AND_START', startDeltaMin: 0, swapped: false } });
  });
  it('refuses a different sport, one wrong team, a start outside the window, and an unresolved team', () => {
    expect(matchGameToEvent({ ...live(), sport: 'NBA' }, ev())).toMatchObject({ ok: false, reason: 'SPORT_MISMATCH' });
    expect(matchGameToEvent(live(), ev({ away: { key: 'NFL:CLE', name: 'Cleveland Browns' } }))).toMatchObject({ ok: false, reason: 'TEAM_UNKNOWN' });
    expect(matchGameToEvent(live(), ev({ startUtc: '2026-10-19T17:00:00Z' }))).toMatchObject({ ok: false, reason: 'NO_EVENT' });
    expect(matchGameToEvent(canonicalizeGame({ ...live(), home: { ...live().home, name: 'Indy', abbr: 'XXX' } }, NFL_DIR), ev())).toMatchObject({ ok: false, reason: 'TEAM_UNKNOWN' });
  });
  it('reversed home/away is refused unless the event is a neutral site', () => {
    const swapped = ev({ home: { key: 'NFL:BAL', name: 'Baltimore Ravens' }, away: { key: 'NFL:IND', name: 'Indianapolis Colts' } });
    expect(matchGameToEvent(live(), swapped)).toMatchObject({ ok: false, reason: 'ORIENTATION' });
    expect(matchGameToEvent(live(), { ...swapped, neutral: true })).toMatchObject({ ok: true, match: { swapped: true } });
  });
  it('a known provider id matches; the same id now describing other teams is an ID_CONFLICT, not a match', () => {
    expect(matchGameToEvent(live(), ev({ providerIds: { espn: '900001' } }))).toMatchObject({ ok: true, match: { method: 'PROVIDER_ID' } });
    expect(matchGameToEvent(live(), ev({ away: { key: 'NFL:CLE', name: 'Cleveland Browns' }, providerIds: { espn: '900001' } }))).toMatchObject({ ok: false, reason: 'ID_CONFLICT' });
    expect(matchGameToEvent(live(), ev({ providerIds: { espn: '123' } }))).toMatchObject({ ok: false, reason: 'NO_EVENT' });
  });
  it('a doubleheader pairs each game to its own event, and an event between them is refused, not guessed', () => {
    const dir = new TeamDirectory('MLB', [{ abbr: 'NYM', name: 'New York Mets' }, { abbr: 'ATL', name: 'Atlanta Braves' }]);
    const games = parseEspnScoreboard('MLB', fx('espn-mlb-doubleheader.synthetic.json'), FETCHED).map((g) => canonicalizeGame(g, dir));
    const mk = (id: string, start: string): SiftEventRef => ({ eventId: id, sport: 'MLB', startUtc: start, home: { key: 'MLB:NYM', name: 'New York Mets' }, away: { key: 'MLB:ATL', name: 'Atlanta Braves' } });
    const p = pairGames([mk('g1', '2026-09-20T17:10:00Z'), mk('g2', '2026-09-20T21:10:00Z'), mk('mid', '2026-09-20T19:10:00Z')], games);
    expect(p.map((x) => x.game?.provenance.providerGameId ?? null)).toEqual(['910001', '910002', null]);
  });
  it('two provider games for the same teams 30 minutes apart are AMBIGUOUS, and one game is never given to two events', () => {
    const a = live();
    const b: LiveGame = { ...a, startUtc: '2026-10-18T17:30:00.000Z', provenance: { ...a.provenance, providerGameId: 'dup' } };
    expect(pairGames([ev()], [a, b])[0].result).toMatchObject({ ok: false, reason: 'AMBIGUOUS' });
    const twice = pairGames([ev({ eventId: 'e1' }), ev({ eventId: 'e2' })], [a]);
    expect(twice.every((x) => x.game === null && !x.result.ok)).toBe(true);
  });
  it('builds an event ref from a publication board item through the directory', () => {
    const item = { event_id: 'evt_9', start_time_utc: '2026-10-18T17:00:00Z', home_participant: 'p1', away_participant: 'p2',
      participants: [{ participant_id: 'p1', display_name: 'Indianapolis Colts', short_name: 'IND' }, { participant_id: 'p2', display_name: 'Baltimore Ravens', short_name: 'BAL' }] };
    expect(eventRefFromBoardItem(item, 'NFL', NFL_DIR)).toMatchObject({ eventId: 'evt_9', home: { key: 'NFL:IND' }, away: { key: 'NFL:BAL' } });
    expect(eventRefFromBoardItem({ ...item, participants: [] }, 'NFL', NFL_DIR)).toBeNull();
    expect(teamKey('NFL', 'JAC')).toBe('NFL:JAX');
  });
});

describe('score freshness and display mode', () => {
  const at = (sec: number) => T0 + sec * 1000;
  it('LIVE under 60 s, DELAYED to 5:00 inclusive, STALE after; never younger from a client retry', () => {
    const g = live();
    expect(scoreFreshness(g, at(59))).toBe('LIVE');
    expect(scoreFreshness(g, at(60))).toBe('DELAYED');
    expect(scoreFreshness(g, at(300))).toBe('DELAYED');
    expect(scoreFreshness(g, at(301))).toBe('STALE');
  });
  it('measures from the provider\'s own time when it has one, and distrusts one far in the future', () => {
    const g = { ...live(), provenance: { ...live().provenance, providerUpdatedAt: '2026-10-18T19:00:00Z' } }; // 150 s before fetch
    expect(scoreFreshness(g, T0)).toBe('DELAYED');
    const future = { ...live(), provenance: { ...live().provenance, providerUpdatedAt: '2026-10-18T22:00:00Z' } };
    expect(scoreFreshness(future, at(301))).toBe('STALE'); // falls back to the fetch time
  });
  it('a final does not age; a scheduled game has nothing live to age; a live game with no timestamp is UNKNOWN', () => {
    const fin = espnNfl().find((x) => x.provenance.providerGameId === '900003')!;
    expect(scoreFreshness(fin, at(86_400))).toBe('FINAL');
    expect(scoreFreshness(espnNfl().find((x) => x.provenance.providerGameId === '900002')!, at(5))).toBe('PREGAME');
    expect(scoreFreshness({ ...live(), provenance: { ...live().provenance, fetchedAt: 'garbage' } }, at(5))).toBe('UNKNOWN');
  });
  it('picks the display mode: live, delayed, last-known on outage, final, publication final, unavailable', () => {
    expect(scoreView(live(), at(10))).toMatchObject({ mode: 'LIVE', label: 'LIVE · 10s' });
    expect(scoreView(live(), at(120))).toMatchObject({ mode: 'DELAYED', label: 'Updated 2m ago' });
    expect(scoreView(live(), at(10), { providerDown: true })).toMatchObject({ mode: 'LAST_KNOWN' });
    expect(scoreView(live(), at(900))).toMatchObject({ mode: 'LAST_KNOWN', label: 'Last update 15m ago · provider unavailable' });
    expect(scoreView(espnNfl().find((x) => x.provenance.providerGameId === '900003')!, at(9999))).toMatchObject({ mode: 'FINAL', label: 'Final' });
    expect(scoreView(null, at(1), { publicationFinal: true })).toMatchObject({ mode: 'PUBLICATION_FINAL', game: null });
    expect(scoreView(null, at(1))).toMatchObject({ mode: 'UNAVAILABLE', label: 'Live — score unavailable' });
    expect(scoreView({ ...live(), provenance: { ...live().provenance, fetchedAt: 'garbage' } }, at(1)).game).toBeNull();
  });
});

describe('LiveScoreService chain', () => {
  const clock = { t: T0 };
  const now = () => clock.t;
  const stub = (id: string, minIntervalMs: number, fn: () => Promise<LiveGame[]>, sports: LiveScoreProvider['sports'] = ['NFL']): LiveScoreProvider => ({
    id, label: id, minIntervalMs, sports, async fetchScoreboard() { return { provider: id, games: await fn(), fetchedAt: FETCHED }; },
  });

  it('falls back from a 429 to the next provider, records why, and is DEGRADED', async () => {
    const svc = new LiveScoreService({ now, providers: [
      stub('a', 15_000, async () => { throw new ScoreProviderError('rate_limited', 'a 429', 429, 60_000); }),
      stub('b', 30_000, async () => [live()]),
    ] });
    const s = await svc.refresh('NFL');
    expect(s).toMatchObject({ status: 'DEGRADED', answeredBy: 'b', fallback: [{ provider: 'a', kind: 'rate_limited' }] });
    expect(s.games).toHaveLength(1);
  });

  it('every provider failing keeps the last-known-good with its real age and reports OUTAGE', async () => {
    let down = false;
    const svc = new LiveScoreService({ now, providers: [stub('a', 1_000, async () => { if (down) throw new ScoreProviderError('http', 'HTTP 503', 503); return [live()]; })] });
    expect((await svc.refresh('NFL')).status).toBe('OK');
    down = true;
    clock.t = T0 + 20_000;
    const s = await svc.refresh('NFL');
    expect(s.status).toBe('OUTAGE');
    expect(s.games[0].provenance.fetchedAt).toBe(FETCHED); // not re-stamped
    expect(scoreView(s.games[0], clock.t, { providerDown: s.status === 'OUTAGE' }).mode).toBe('LAST_KNOWN');
    expect(s.nextAllowedAt).toBeGreaterThanOrEqual(clock.t + 15_000);
  });

  it('never polls faster than the provider\'s minimum interval', async () => {
    clock.t = T0;
    let calls = 0;
    const svc = new LiveScoreService({ now, providers: [stub('a', 15_000, async () => { calls++; return [live()]; })] });
    await svc.refresh('NFL'); clock.t = T0 + 5_000; await svc.refresh('NFL');
    expect(calls).toBe(1);
    clock.t = T0 + 15_000; await svc.refresh('NFL');
    expect(calls).toBe(2);
  });

  it('a sport no provider covers is skipped as DISABLED, and a kill-switched provider is not called', async () => {
    clock.t = T0;
    let calls = 0;
    const p = stub('a', 1_000, async () => { calls++; return [live()]; });
    const svc = new LiveScoreService({ now, providers: [p], disabled: () => new Set(['a']) });
    expect((await svc.refresh('NFL')).status).toBe('DISABLED');
    expect((await svc.refresh('TENNIS')).status).toBe('DISABLED');
    expect(calls).toBe(0);
  });

  it('holds a FINAL that flips back to live for one refresh, believes it if it repeats, and flags a score decrease', async () => {
    clock.t = T0;
    const fin = espnNfl().find((x) => x.provenance.providerGameId === '900003')!;
    const flipped: LiveGame = { ...fin, phase: 'LIVE', score: { home: 24, away: 21 } };
    let seq: LiveGame[] = [fin];
    const svc = new LiveScoreService({ now, providers: [stub('espn', 1_000, async () => seq)] });
    await svc.refresh('NFL');
    seq = [flipped]; clock.t += 2_000;
    let s = await svc.refresh('NFL');
    expect(s.games[0].phase).toBe('FINAL');
    expect(s.anomalies[0].kind).toBe('FINAL_REGRESSION_HELD');
    clock.t += 2_000;
    s = await svc.refresh('NFL');
    expect(s.games[0].phase).toBe('LIVE');
    seq = [{ ...flipped, score: { home: 21, away: 21 } }]; clock.t += 2_000;
    s = await svc.refresh('NFL');
    expect(s.anomalies.map((a) => a.kind)).toContain('SCORE_DECREASED');
  });
});

describe('espnProvider (fetch seam)', () => {
  const body = JSON.stringify(fx('espn-nfl.synthetic.json'));
  it('parses a 200, maps 429 to rate_limited with Retry-After, and a non-JSON 200 to schema', async () => {
    const ok = espnProvider({ now: () => T0, fetchImpl: (async () => new Response(body)) as typeof fetch, paths: { NFL: ['football/nfl'] } });
    expect((await ok.fetchScoreboard('NFL')).games.length).toBe(4);
    const lim = espnProvider({ fetchImpl: (async () => new Response('', { status: 429, headers: { 'retry-after': '12' } })) as typeof fetch, paths: { NFL: ['football/nfl'] } });
    await expect(lim.fetchScoreboard('NFL')).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 12_000 });
    const bad = espnProvider({ fetchImpl: (async () => new Response('<html>')) as typeof fetch, paths: { NFL: ['football/nfl'] } });
    await expect(bad.fetchScoreboard('NFL')).rejects.toMatchObject({ kind: 'schema' });
    await expect(ok.fetchScoreboard('TENNIS')).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('provider-aware live window', () => {
  it('a 2-minute feed may widen "LIVE" to its own cadence, and only when asked', () => {
    const g = live();
    expect(scoreView(g, T0 + 100_000).mode).toBe('DELAYED');
    expect(scoreView(g, T0 + 100_000, { liveBeforeMs: 150_000 }).mode).toBe('LIVE');
  });
});
