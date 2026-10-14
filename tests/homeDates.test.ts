// Regression: on Tuesday Oct 13 the homepage counted and featured games by 24-hour arithmetic / a 36-hour window, so
// Wednesday Oct 14's Kennesaw State at Missouri State (2026-10-14T23:30Z) headed "Today on SIFT". Dates are now local
// calendar days; a later-day feature is labelled "upcoming". Timezones are switched per test (Node honours TZ at runtime).
import { afterEach, describe, expect, it } from 'vitest';
import { featuredGame, featuredScope, inDay, inLater, type GameRow } from '../src/views/broadcast/games';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });
const inTZ = (tz: string, fn: () => void) => { process.env.TZ = tz; fn(); };
const utc = (iso: string) => Date.parse(iso);

function row(id: string, sport: string, startIso: string, over: Partial<GameRow> = {}): GameRow {
  const p = (n: string) => ({ participant_id: n, display_name: n, short_name: n });
  return {
    sport, slug: sport.toLowerCase(), label: id, phase: 'PREGAME', stale: false, startMs: utc(startIso), candidates: 0, best: null, opps: [],
    away: p(`${id}-a`), home: p(`${id}-h`),
    item: { event_id: id, start_time_utc: startIso, markets_available: 0, participants: [] },
    ...over,
  } as unknown as GameRow;
}

describe('local calendar days', () => {
  it('Oct 13 vs Oct 14: Kennesaw State at Missouri State (Oct 14 23:30Z) is tomorrow, never today, in every US timezone', () => {
    const now = utc('2026-10-13T16:56:55Z'); // the feed snapshot the owner saw
    const kenn = utc('2026-10-14T23:30:00Z');
    for (const tz of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']) {
      inTZ(tz, () => {
        expect(inDay(kenn, now, 'today')).toBe(false);
        expect(inDay(kenn, now, 'tomorrow')).toBe(true);
        expect(inLater(kenn, now)).toBe(false);
      });
    }
  });

  it('a game after local midnight is tomorrow even when its UTC date is still today, and the reverse', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-13T20:00:00Z'); // 3:00 PM CDT Oct 13
      expect(inDay(utc('2026-10-14T00:20:00Z'), now, 'today')).toBe(true);     // 7:20 PM CDT Oct 13, UTC date Oct 14
      expect(inDay(utc('2026-10-14T04:59:00Z'), now, 'today')).toBe(true);     // 11:59 PM CDT
      expect(inDay(utc('2026-10-14T05:00:00Z'), now, 'today')).toBe(false);    // 12:00 AM CDT Oct 14
      expect(inDay(utc('2026-10-14T05:00:00Z'), now, 'tomorrow')).toBe(true);
      expect(inDay(utc('2026-10-13T04:59:00Z'), now, 'today')).toBe(false);    // 11:59 PM CDT Oct 12
    });
  });

  it('live and finished games of today stay in today; yesterday evening does not carry over after midnight', () => {
    inTZ('America/New_York', () => {
      const now = utc('2026-10-13T04:30:00Z'); // 12:30 AM EDT Oct 13
      expect(inDay(utc('2026-10-13T00:30:00Z'), now, 'today')).toBe(false);    // 8:30 PM EDT Oct 12, started 4h ago
      expect(inDay(utc('2026-10-13T04:00:00Z'), now, 'today')).toBe(true);     // 12:00 AM EDT, live
      const later = utc('2026-10-13T20:00:00Z');
      expect(inDay(utc('2026-10-13T14:00:00Z'), later, 'today')).toBe(true);   // finished earlier today
    });
  });

  it('survives the fall-back day (25 hours): Nov 1 2026, New York', () => {
    inTZ('America/New_York', () => {
      const now = utc('2026-11-01T12:00:00Z'); // 7 AM EST Nov 1
      expect(inDay(utc('2026-11-02T04:30:00Z'), now, 'today')).toBe(true);     // 11:30 PM EST Nov 1 (a +24h boundary would call this tomorrow)
      expect(inDay(utc('2026-11-02T05:00:00Z'), now, 'tomorrow')).toBe(true);  // midnight Nov 2
      expect(inDay(utc('2026-11-01T04:30:00Z'), now, 'today')).toBe(true);     // 12:30 AM EDT Nov 1
    });
  });

  it('survives the spring-forward day (23 hours): Mar 14 2027, New York', () => {
    inTZ('America/New_York', () => {
      const now = utc('2027-03-14T15:00:00Z'); // 11 AM EDT Mar 14
      expect(inDay(utc('2027-03-15T03:30:00Z'), now, 'today')).toBe(true);     // 11:30 PM EDT Mar 14
      expect(inDay(utc('2027-03-15T04:30:00Z'), now, 'today')).toBe(false);    // 12:30 AM EDT Mar 15 (a +24h boundary would call this today)
      expect(inDay(utc('2027-03-15T04:30:00Z'), now, 'tomorrow')).toBe(true);
    });
  });

  it('later = after tomorrow, through six days on', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-13T17:00:00Z');
      expect(inLater(utc('2026-10-15T18:00:00Z'), now)).toBe(true);
      expect(inLater(utc('2026-10-19T18:00:00Z'), now)).toBe(true);   // Oct 19 = today + 6
      expect(inLater(utc('2026-10-20T18:00:00Z'), now)).toBe(false);
      expect(inDay(utc('2026-10-20T18:00:00Z'), now, 'week')).toBe(false);
      expect(inDay(Number.NaN, now, 'today')).toBe(false);
    });
  });
});

describe('featured game: a later-day game is never presented as today’s', () => {
  const now = utc('2026-10-13T16:56:55Z'); // Tuesday 11:56 AM CDT

  it('Oct 13: no CFB today → the Oct 14 CFB game is the feature, scoped "upcoming" (not today)', () => {
    inTZ('America/Chicago', () => {
      const kenn = row('kenn-at-mosu', 'CFB', '2026-10-14T23:30:00Z');
      const nhlTonight = row('nhl-tonight', 'NHL', '2026-10-14T00:00:00Z');      // 7 PM CDT Oct 13, a different sport
      const pick = featuredGame([nhlTonight, kenn], now)!;
      expect(pick.item.event_id).toBe('kenn-at-mosu');
      expect(featuredScope(pick, now)).toBe('upcoming');
      expect(inDay(pick.startMs, now, 'today')).toBe(false);
    });
  });

  it('a CFB game today beats an earlier-listed or richer game of another sport and is scoped "today"', () => {
    inTZ('America/Chicago', () => {
      const cfbTonight = row('cfb-tonight', 'CFB', '2026-10-14T01:00:00Z');       // 8 PM CDT Oct 13
      const cfbTomorrow = row('cfb-wed', 'CFB', '2026-10-14T23:30:00Z');
      const nfl = row('nfl-today', 'NFL', '2026-10-13T23:00:00Z', { candidates: 3 });
      const pick = featuredGame([cfbTomorrow, nfl, cfbTonight], now)!;
      expect(pick.item.event_id).toBe('cfb-tonight');
      expect(featuredScope(pick, now)).toBe('today');
    });
  });

  it('the 36-hour window is gone: a game 30 hours out is not "soon", it is upcoming', () => {
    inTZ('America/Chicago', () => {
      const pick = featuredGame([row('cfb-wed', 'CFB', '2026-10-14T23:30:00Z')], now)!;
      expect(featuredScope(pick, now)).toBe('upcoming');
    });
  });

  it('with no CFB anywhere, today’s game of another sport comes first, then the next day with games', () => {
    inTZ('America/Chicago', () => {
      const today = row('nhl-today', 'NHL', '2026-10-14T00:00:00Z');
      const nextDay = row('nba-next', 'NBA', '2026-10-15T00:00:00Z');
      expect(featuredGame([nextDay, today], now)!.item.event_id).toBe('nhl-today');
      expect(featuredGame([nextDay], now)!.item.event_id).toBe('nba-next');
    });
  });

  it('returns null when nothing can be featured: yesterday’s final and a game with no teams do not qualify', () => {
    inTZ('America/Chicago', () => {
      expect(featuredGame([row('done', 'CFB', '2026-10-12T20:00:00Z', { phase: 'FINAL' }), row('noteams', 'CFB', '2026-10-14T23:30:00Z', { home: undefined })], now)).toBeNull();
    });
  });
});
