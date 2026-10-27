// Which score a v3 screen may print. The reads are built with the app's OWN identity layer and freshness clock (pairGames, scoreView): only
// the provider's game is a test input. Verified = matched by identity evidence (or the publication's result); delayed = verified, in play,
// older than 60 s, no older than 5 min; anything else is never shown and nothing is fabricated.
import { describe, expect, it } from 'vitest';
import { TeamDirectory, canonicalizeGame, pairGames } from '../../src/live/scores/identity';
import { scoreView } from '../../src/live/scores/freshness';
import type { ScoreRead } from '../../src/live/scores/store';
import type { GamePhase, LiveGame } from '../../src/live/scores/types';
import { observedFromGames } from '../../src/v4/scoreState';
import { DELAYED_AFTER_MS, UNRELIABLE_AFTER_MS, verifyScore } from '../../src/v3/data/scoreVerify';

const START = '2026-10-27T00:15:00Z';
const NOW = Date.parse('2026-10-27T01:00:00Z');
const published = { eventId: 'evt_dal_phi', startUtc: START, home: { display_name: 'Philadelphia Eagles', short_name: 'PHI' }, away: { display_name: 'Dallas Cowboys', short_name: 'DAL' } };
const events = observedFromGames('NFL', [published]);

const game = (o: Partial<LiveGame> = {}, ageS = 10, teams: { home?: [string, string]; away?: [string, string] } = {}): LiveGame => ({
  schema: 'sift.live_game/1', sport: 'NFL', league: 'NFL', startUtc: START,
  home: { key: '', name: teams.home?.[0] ?? 'Philadelphia Eagles', abbr: teams.home?.[1] ?? 'PHI', providerTeamId: null },
  away: { key: '', name: teams.away?.[0] ?? 'Dallas Cowboys', abbr: teams.away?.[1] ?? 'DAL', providerTeamId: null },
  phase: 'LIVE', rawStatus: 'in', score: { home: 17, away: 14 },
  clock: { period: 3, periodLabel: '3rd Quarter', display: '4:32', seconds: 272, direction: 'down', running: true }, situation: null,
  provenance: { provider: 'sportscore', providerGameId: 'g1', providerUpdatedAt: new Date(NOW - ageS * 1000).toISOString(), fetchedAt: new Date(NOW - ageS * 1000).toISOString(), attribution: 'Powered by SportScore' },
  ...o,
});

/** The read the score store would hold: pair through the app's identity layer, view through the app's freshness clock. */
function read(g: LiveGame | null, o: { providerDown?: boolean } = {}): ScoreRead {
  if (!g) return { game: null, match: null, source: null, view: scoreView(null, NOW) };
  const dir = new TeamDirectory('NFL', events.flatMap((e) => [e.home, e.away]));
  const [pair] = pairGames(events.map((e) => e.ref), [canonicalizeGame(g, dir)]);
  return pair.game
    ? { game: pair.game, match: pair.result, source: 'sportscore', view: scoreView(pair.game, NOW, { providerDown: o.providerDown }) }
    : { game: null, match: pair.result, source: null, view: scoreView(null, NOW) };
}

describe('verified score', () => {
  it('a fresh in-play score matched to the event is shown, not delayed', () => {
    expect(verifyScore(read(game({}, 10)))).toEqual({ show: true, away: 14, home: 17, clock: 'Q3 4:32', over: false, delayed: false });
  });
  it('a final is a fact: shown at any age, never delayed', () => {
    for (const ageS of [5, 400, 86_400]) expect(verifyScore(read(game({ phase: 'FINAL', clock: null }, ageS)))).toMatchObject({ show: true, over: true, delayed: false, clock: 'Final', away: 14, home: 17 });
  });
  it('no read, an unmatched game, a game of another pair of teams, and a read with no game are never shown', () => {
    expect(verifyScore(null)).toEqual({ show: false, reason: 'no-read' });
    expect(verifyScore(read(null))).toMatchObject({ show: false, reason: 'unmatched' });
    const other = read(game({}, 10, { home: ['Green Bay Packers', 'GB'], away: ['Chicago Bears', 'CHI'] }));
    expect(other.game).toBeNull();
    expect(verifyScore(other)).toMatchObject({ show: false, reason: 'unmatched' });
  });
  it('a game that is not under way has no score to show, whatever the feed lists', () => {
    for (const phase of ['SCHEDULED', 'POSTPONED', 'CANCELLED'] as GamePhase[]) expect(verifyScore(read(game({ phase, score: { home: 0, away: 0 } }, 10))).show).toBe(false);
  });
  it('a phase the feed did not understand is not verified', () => {
    expect(verifyScore(read(game({ phase: 'UNKNOWN' }, 10)))).toEqual({ show: false, reason: 'unknown-phase' });
  });
  it('no score from the provider means none here (no 0-0 is invented)', () => {
    expect(verifyScore(read(game({ score: null }, 10)))).toEqual({ show: false, reason: 'no-score' });
  });
  it('implausible numbers are not verified', () => {
    for (const score of [{ home: -1, away: 3 }, { home: 2.5, away: 3 }, { home: NaN, away: 3 }]) expect(verifyScore(read(game({ score }, 10))).show).toBe(false);
  });
});

describe('delayed and unreliable (separate from quote freshness)', () => {
  it('the thresholds are the feed\'s own: live under 60 s, delayed to 5 min, unreliable beyond', () => {
    expect(DELAYED_AFTER_MS).toBe(60_000);
    expect(UNRELIABLE_AFTER_MS).toBe(300_000);
  });
  it.each([
    [59, true, false], [60, true, true], [120, true, true], [299, true, true], [300, true, true], [301, false, false], [3600, false, false],
  ])('an in-play score observed %i s ago: shown=%s delayed=%s', (ageS, shown, delayed) => {
    const v = verifyScore(read(game({}, ageS)));
    expect(v.show).toBe(shown);
    if (v.show) expect(v.delayed).toBe(delayed);
    else expect(v).toMatchObject({ reason: 'unreliable' });
  });
  it('a feed outage turns even a recent score into "last known": not shown', () => {
    expect(verifyScore(read(game({}, 5), { providerDown: true }))).toEqual({ show: false, reason: 'unreliable' });
  });
  it('a score with no trustworthy timestamp is not shown', () => {
    const g = game({}, 10);
    g.provenance = { ...g.provenance, providerUpdatedAt: null, fetchedAt: 'not a time' };
    expect(verifyScore(read(g)).show).toBe(false);
  });
  it('the delayed score keeps the numbers and the clock, and carries no age', () => {
    const v = verifyScore(read(game({}, 150)));
    expect(v).toEqual({ show: true, away: 14, home: 17, clock: 'Q3 4:32', over: false, delayed: true });
    expect(JSON.stringify(v)).not.toMatch(/ago|\bage\b|\d+\s?s\b/);
  });
});
