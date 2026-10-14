// Featured card lifecycle: Pregame → Live → Final on one game, the tiered CFB-first selection, a steady choice while the page
// stays open, and the rule that a game's status/score is never invented (the contract has no live score, period or clock).
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardItem } from '../src/contract/types';
import { sportByCode } from '../src/data/sports';
import { featureTier, featuredGame, featuredKey, featuredScope, gameRows, keepFeatured, type GameRow } from '../src/views/broadcast/games';
import { featuredView, finalScores } from '../src/views/broadcast/lifecycle';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });
const inTZ = (tz: string, fn: () => void) => { process.env.TZ = tz; fn(); };
const utc = (iso: string) => Date.parse(iso);

const board = (over: Partial<BoardItem> = {}): BoardItem => ({
  event_id: 'evt_a', league: 'NCAAFB', competition: null, status: 'SCHEDULED', start_time_utc: '2026-10-13T23:00:00Z', home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: 'Jacksonville State', short_name: 'JSU', participant_type: 'TEAM' }, { participant_id: 'a', display_name: 'Florida International', short_name: 'FIU', participant_type: 'TEAM' }],
  data_freshness: 'FRESH' as never, health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 10, markets_priced: 0, recommendations_count: 0, wagers_count: 0, ...over,
});
/** A game row built the way Home builds it (real lifecycle phase from the status word + start time). */
function game(id: string, sport: string, startIso: string, status = 'SCHEDULED', now = utc('2026-10-13T17:00:00Z'), over: Partial<BoardItem> = {}): GameRow {
  const bundle = { sport: sportByCode(sport)!, board: [board({ event_id: id, start_time_utc: startIso, status, ...over })], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null };
  return gameRows([bundle], [], now)[0];
}
const rows = (...r: GameRow[]) => r;

describe('one game, three states: pregame → live → final', () => {
  const kick = '2026-10-14T00:00:00Z'; // 7:00 PM CDT Oct 13
  it('pregame before kickoff, live after it, final once the publication says FINAL', () => {
    inTZ('America/Chicago', () => {
      const pre = game('g', 'CFB', kick, 'SCHEDULED', utc('2026-10-13T20:00:00Z'));
      const live = game('g', 'CFB', kick, 'LIVE', utc('2026-10-14T01:00:00Z'));
      const fin = game('g', 'CFB', kick, 'FINAL', utc('2026-10-14T04:00:00Z'));
      expect(featuredView(pre, null).state).toBe('pregame');
      expect(featuredView(live, null).state).toBe('live');
      expect(featuredView(fin, { home_score: 27, away_score: 24 }).state).toBe('final');
      // the same game stays featurable across all three, in the right tier
      expect(featureTier(pre, utc('2026-10-13T20:00:00Z'))).toBe('today');
      expect(featureTier(live, utc('2026-10-14T01:00:00Z'))).toBe('live');
      expect(featureTier(fin, utc('2026-10-14T04:00:00Z'))).toBe('recent');
    });
  });
  it('a game does not vanish at kickoff: it is still the featured game one minute later', () => {
    inTZ('America/Chicago', () => {
      const before = utc('2026-10-13T23:59:00Z'), after = utc('2026-10-14T00:01:00Z');
      expect(featuredGame(rows(game('g', 'CFB', kick, 'SCHEDULED', before)), before)!.item.event_id).toBe('g');
      const started = game('g', 'CFB', kick, 'SCHEDULED', after); // still "scheduled" in the feed, start time passed
      expect(started.phase).toBe('STARTED');
      expect(featuredGame(rows(started), after)!.item.event_id).toBe('g');
    });
  });
});

describe('game status is never invented', () => {
  it('a live game has no score, period or clock in the contract: it says so and shows no numbers, even if a result is attached', () => {
    const live = game('g', 'CFB', '2026-10-13T23:00:00Z', 'LIVE', utc('2026-10-14T00:00:00Z'));
    const v = featuredView(live, { home_score: 7, away_score: 3 });
    expect(v.state).toBe('live');
    expect(v.scores).toBeNull();
    expect(v.statusLine).toBe('Live — score unavailable');
  });
  it('a started game the publication has not finalised after 4+ hours is "awaiting result", not live and not scored', () => {
    inTZ('America/Chicago', () => {
      const stale = game('g', 'CFB', '2026-10-13T23:00:00Z', 'SCHEDULED', utc('2026-10-14T04:30:00Z')); // 6 PM → 11:30 PM CDT
      expect(stale.stale).toBe(true);
      const v = featuredView(stale, { home_score: 7, away_score: 3 });
      expect(v.state).toBe('awaiting');
      expect(v.scores).toBeNull();
      expect(featureTier(stale, utc('2026-10-14T04:30:00Z'))).toBe('recent');
    });
  });
  it('final with a missing, delayed or partial result: "Final — score unavailable", never a guessed score', () => {
    const fin = game('g', 'CFB', '2026-10-13T23:00:00Z', 'FINAL', utc('2026-10-14T04:00:00Z'));
    for (const result of [undefined, null, {}, { home_score: 27 }, { away_score: 24 }, { home_score: null, away_score: null }, { home_score: '27', away_score: '24' }, { home_score: Number.NaN, away_score: 3 }]) {
      const v = featuredView(fin, result);
      expect(v.state).toBe('final');
      expect(v.scores).toBeNull();
      expect(v.statusLine).toBe('Final — score unavailable');
    }
  });
  it('final with both numbers reports the verified score and the winner (ties have none)', () => {
    const fin = game('g', 'CFB', '2026-10-13T23:00:00Z', 'FINAL', utc('2026-10-14T04:00:00Z'));
    expect(featuredView(fin, { home_score: 27, away_score: 24 }).scores).toEqual({ home: 27, away: 24, winner: 'home' });
    expect(featuredView(fin, { home_score: 20, away_score: 31 }).scores).toEqual({ home: 20, away: 31, winner: 'away' });
    expect(finalScores({ home_score: 17, away_score: 17 })!.winner).toBeNull();
    expect(finalScores({ home_score: 0, away_score: 0 })).toEqual({ home: 0, away: 0, winner: null });
  });
  it('research stays separate from the game status: after kickoff the pregame research is labelled frozen and not a graded result; a final never carries a win/loss', () => {
    const fin = game('g', 'CFB', '2026-10-13T23:00:00Z', 'FINAL', utc('2026-10-14T04:00:00Z'));
    const v = featuredView(fin, { home_score: 27, away_score: 24 });
    expect(v.researchLine).toMatch(/frozen at kickoff/);
    expect(v.researchLine).toMatch(/not a graded result/);
    expect(`${v.word} ${v.statusLine ?? ''} ${v.researchLine}`).not.toMatch(/\b(won|lost|hit|cash|win)\b/i);
    expect(featuredView(game('g', 'CFB', '2026-10-14T23:00:00Z'), null).researchLine).toBeNull();
  });
});

describe('selection: CFB first, in a fixed priority', () => {
  const T = '2026-10-13T17:00:00Z';
  it('1 live CFB beats an upcoming CFB game today and a live NFL game', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-13T20:00:00Z');
      const live = game('cfb-live', 'CFB', '2026-10-13T19:00:00Z', 'LIVE', now);
      const soon = game('cfb-soon', 'CFB', '2026-10-14T01:00:00Z', 'SCHEDULED', now);
      const nfl = game('nfl-live', 'NFL', '2026-10-13T19:00:00Z', 'LIVE', now);
      expect(featuredGame(rows(soon, nfl, live), now)!.item.event_id).toBe('cfb-live');
    });
  });
  it('2 an upcoming CFB game today beats a CFB game completed today', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-14T00:30:00Z'); // 7:30 PM CDT
      const done = game('cfb-done', 'CFB', '2026-10-13T17:00:00Z', 'FINAL', now);
      const late = game('cfb-late', 'CFB', '2026-10-14T03:00:00Z', 'SCHEDULED', now); // 10 PM CDT
      expect(featuredGame(rows(done, late), now)!.item.event_id).toBe('cfb-late');
    });
  });
  it('3 a CFB game completed today beats the next CFB game on a later day (which is then not shown as today’s)', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-14T04:00:00Z'); // 11 PM CDT Oct 13
      const done = game('cfb-done', 'CFB', '2026-10-14T00:00:00Z', 'FINAL', now);
      const wed = game('cfb-wed', 'CFB', '2026-10-14T23:30:00Z', 'SCHEDULED', now);
      const pick = featuredGame(rows(wed, done), now)!;
      expect(pick.item.event_id).toBe('cfb-done');
      expect(featuredScope(pick, now)).toBe('today');
      expect(featuredScope(featuredGame(rows(wed), now)!, now)).toBe('upcoming');
    });
  });
  it('4 with no CFB game today the next CFB day is chosen; 5 other sports only when no suitable CFB game exists', () => {
    inTZ('America/Chicago', () => {
      const now = utc(T);
      const wed = game('cfb-wed', 'CFB', '2026-10-14T23:30:00Z', 'SCHEDULED', now);
      const nhl = game('nhl-today', 'NHL', '2026-10-14T00:00:00Z', 'SCHEDULED', now);
      expect(featuredGame(rows(nhl, wed), now)!.item.event_id).toBe('cfb-wed');
      expect(featuredGame(rows(nhl), now)!.item.event_id).toBe('nhl-today');
      const oldCfb = game('cfb-yday', 'CFB', '2026-10-12T20:00:00Z', 'FINAL', now); // yesterday's final is not suitable
      expect(featuredGame(rows(oldCfb, nhl), now)!.item.event_id).toBe('nhl-today');
    });
  });
  it('several CFB games: earliest upcoming today; most recently started when all are completed; earliest day when all are later', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-13T17:00:00Z');
      expect(featuredGame(rows(game('b', 'CFB', '2026-10-14T01:30:00Z', 'SCHEDULED', now), game('a', 'CFB', '2026-10-14T00:00:00Z', 'SCHEDULED', now)), now)!.item.event_id).toBe('a');
      const late = utc('2026-10-14T04:30:00Z');
      expect(featuredGame(rows(game('early', 'CFB', '2026-10-13T17:00:00Z', 'FINAL', late), game('later', 'CFB', '2026-10-13T23:00:00Z', 'FINAL', late)), late)!.item.event_id).toBe('later');
      expect(featuredGame(rows(game('sat', 'CFB', '2026-10-17T17:00:00Z', 'SCHEDULED', now), game('wed', 'CFB', '2026-10-14T23:30:00Z', 'SCHEDULED', now)), now)!.item.event_id).toBe('wed');
    });
  });
  it('cancelled, postponed and suspended games are never featured', () => {
    inTZ('America/Chicago', () => {
      const now = utc(T);
      for (const st of ['CANCELLED', 'POSTPONED', 'SUSPENDED']) expect(featuredGame(rows(game('x', 'CFB', '2026-10-14T01:00:00Z', st, now)), now)).toBeNull();
    });
  });
});

describe('local midnight and timezones', () => {
  it('a final that ended before local midnight is today’s until midnight and nobody’s after it', () => {
    inTZ('America/Chicago', () => {
      const start = '2026-10-14T00:30:00Z'; // 7:30 PM CDT Oct 13
      const beforeMidnight = utc('2026-10-14T04:30:00Z'), afterMidnight = utc('2026-10-14T05:30:00Z');
      expect(featureTier(game('g', 'CFB', start, 'FINAL', beforeMidnight), beforeMidnight)).toBe('recent');
      expect(featureTier(game('g', 'CFB', start, 'FINAL', afterMidnight), afterMidnight)).toBeNull();
    });
  });
  it('a game that kicked off before midnight and is still live after it stays live (live is live)', () => {
    inTZ('America/Chicago', () => {
      const now = utc('2026-10-14T05:30:00Z'); // 12:30 AM CDT Oct 14
      expect(featureTier(game('g', 'CFB', '2026-10-14T03:30:00Z', 'LIVE', now), now)).toBe('live');
    });
  });
  it('the same instant is "today" for one viewer and "upcoming" for another', () => {
    const now = utc('2026-10-14T01:00:00Z');
    const g = game('g', 'CFB', '2026-10-14T03:00:00Z', 'SCHEDULED', now);
    inTZ('America/Chicago', () => expect(featureTier(g, now)).toBe('today'));   // 8 PM → 10 PM Oct 13
    inTZ('Asia/Tokyo', () => expect(featureTier(g, now)).toBe('today'));        // 10 AM → noon Oct 14
    inTZ('Pacific/Kiritimati', () => expect(featureTier(g, now)).toBe('today'));
    const wed = game('w', 'CFB', '2026-10-15T03:00:00Z', 'SCHEDULED', now);
    inTZ('America/Chicago', () => expect(featureTier(wed, now)).toBe('upcoming'));
  });
  it('daylight-saving fall-back day (25 h): a late game is still today', () => {
    inTZ('America/New_York', () => {
      const now = utc('2026-11-01T12:00:00Z');
      expect(featureTier(game('g', 'CFB', '2026-11-02T04:30:00Z', 'SCHEDULED', now), now)).toBe('today'); // 11:30 PM EST Nov 1
      expect(featureTier(game('h', 'CFB', '2026-11-02T05:30:00Z', 'SCHEDULED', now), now)).toBe('upcoming');
    });
  });
});

describe('steady while the page is open', () => {
  it('keeps the featured game when a better (live) CFB game appears, and follows the same game through its states', () => {
    inTZ('America/Chicago', () => {
      const t0 = utc('2026-10-13T20:00:00Z');
      const a0 = game('a', 'CFB', '2026-10-14T01:00:00Z', 'SCHEDULED', t0);
      const first = keepFeatured(null, rows(a0), t0)!;
      expect(first.item.event_id).toBe('a');
      // a different CFB game goes live: not a reason to switch
      const t1 = utc('2026-10-14T00:30:00Z');
      const b1 = game('b', 'CFB', '2026-10-14T00:00:00Z', 'LIVE', t1);
      const a1 = game('a', 'CFB', '2026-10-14T01:00:00Z', 'SCHEDULED', t1);
      expect(featuredGame(rows(a1, b1), t1)!.item.event_id).toBe('b');                      // a fresh visit would pick the live game…
      expect(keepFeatured(featuredKey(first), rows(a1, b1), t1)!.item.event_id).toBe('a');   // …an open page does not move
      // the kept game goes live and then final: still there
      const t2 = utc('2026-10-14T02:00:00Z');
      expect(keepFeatured('cfb:a', rows(game('a', 'CFB', '2026-10-14T01:00:00Z', 'LIVE', t2)), t2)!.phase).toBe('STARTED');
      const t3 = utc('2026-10-14T04:30:00Z');
      expect(keepFeatured('cfb:a', rows(game('a', 'CFB', '2026-10-14T01:00:00Z', 'FINAL', t3)), t3)!.phase).toBe('FINAL');
    });
  });
  it('chooses again when the kept game can no longer be featured (yesterday’s final after midnight, a postponement)', () => {
    inTZ('America/Chicago', () => {
      const t = utc('2026-10-14T05:30:00Z'); // after local midnight
      const yday = game('a', 'CFB', '2026-10-14T00:30:00Z', 'FINAL', t);
      const next = game('n', 'CFB', '2026-10-14T23:30:00Z', 'SCHEDULED', t);
      expect(keepFeatured('cfb:a', rows(yday, next), t)!.item.event_id).toBe('n');
      const pp = game('a', 'CFB', '2026-10-14T23:00:00Z', 'POSTPONED', t);
      expect(keepFeatured('cfb:a', rows(pp, next), t)!.item.event_id).toBe('n');
      expect(keepFeatured('cfb:gone', rows(next), t)!.item.event_id).toBe('n');
    });
  });
});
