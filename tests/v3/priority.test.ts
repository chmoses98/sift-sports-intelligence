import { describe, expect, it } from 'vitest';
import {
  closenessOf, conferenceMatchup, liveScore, orderFinal, orderLive, orderUpcoming, progressOf, settleTier, TIER_BAND, upcomingTier, WEIGHTS, type FollowsLike,
} from '../../src/v3/model/priority';
import type { V3Game, V3Team } from '../../src/v3/model/types';

type Over = Omit<Partial<V3Game>, 'away' | 'home'> & { away?: Partial<V3Team>; home?: Partial<V3Team> };
const none: FollowsLike = { teams: [], games: [] };
const team = (id: string, sport: string, o: Partial<V3Team> = {}): V3Team => ({ id, slug: sport.toLowerCase(), sport, name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'], ...o });
function game(sport: string, a: string, h: string, o: Over = {}): V3Game {
  const { away, home, ...rest } = o;
  return {
    key: `${sport.toLowerCase()}:${a}_${h}`, slug: sport.toLowerCase(), sport, eventId: `${a}_${h}`, league: sport, phase: 'pregame', startMs: Date.parse('2026-10-31T17:00:00Z'),
    away: team(a, sport, away), home: team(h, sport, home), score: null, lines: [], signals: 0, provenance: 'publication', ...rest,
  };
}
const live = (sport: string, a: string, h: string, sa: number, sh: number, clock: string, o: Over = {}) =>
  game(sport, a, h, { phase: 'live', score: { away: sa, home: sh, clock, source: 'score-feed', asOf: null }, ...o });
const keys = (l: V3Game[]) => l.map((g) => g.key);

describe('the per-sport clock model (progressOf)', () => {
  it('football: quarters of 15 minutes', () => {
    expect(progressOf('NFL', 'Q1 15:00')).toBe(0);
    expect(progressOf('NFL', 'Q2 15:00')).toBe(0.25);
    expect(progressOf('CFB', 'Q3 6:24')).toBeCloseTo((2 + (900 - 384) / 900) / 4, 5);
    expect(progressOf('CFB', 'Q4 0:30')).toBeGreaterThan(0.99);
    expect(progressOf('NFL', 'Halftime')).toBe(0.5);
    expect(progressOf('NFL', 'OT 5:00')).toBe(1);
    expect(progressOf('CFB', '2nd 4:11')).toBeCloseTo((1 + (900 - 251) / 900) / 4, 5);
  });
  it('basketball: NBA quarters of 12, college halves of 20', () => {
    expect(progressOf('NBA', 'Q4 6:24')).toBeCloseTo((3 + (720 - 384) / 720) / 4, 5);
    expect(progressOf('NBA', 'Q2 0:00')).toBe(0.5);
    expect(progressOf('CBB', 'H2 10:00')).toBe(0.75);
    expect(progressOf('CBB', '1st Half')).toBe(0.25);
    expect(progressOf('CBB', 'Halftime')).toBe(0.5);
  });
  it('hockey: three periods; baseball: innings; soccer: the minute', () => {
    expect(progressOf('NHL', 'P2 4:17')).toBeCloseTo((1 + (1200 - 257) / 1200) / 3, 5);
    expect(progressOf('NHL', 'P3 20:00')).toBeCloseTo(2 / 3, 5);
    expect(progressOf('NHL', 'SO')).toBe(1);
    expect(progressOf('MLB', 'Top 1st')).toBe(0);
    expect(progressOf('MLB', 'Bot 7th')).toBeCloseTo(6.5 / 9, 5);
    expect(progressOf('MLB', 'Top 9th')).toBeCloseTo(8 / 9, 5);
    expect(progressOf('MLB', 'Bot 11th')).toBe(1);
    expect(progressOf('SOCCER', "67'")).toBeCloseTo(67 / 90, 5);
    expect(progressOf('SOCCER', "90+3'")).toBe(1);
    expect(progressOf('SOCCER', 'HT')).toBe(0.5);
  });
  it('an unreadable or missing clock, and tennis, have no progress (never treated as late)', () => {
    expect(progressOf('NFL', null)).toBeNull();
    expect(progressOf('NFL', '')).toBeNull();
    expect(progressOf('NFL', 'In play')).toBeNull();
    expect(progressOf('NBA', 'whatever')).toBeNull();
    expect(progressOf('TENNIS', 'Set 3')).toBeNull();
    expect(progressOf('CURLING', 'Q4 1:00')).toBeNull();
  });
});

describe('closeness is the sport\'s own idea of a one-score game', () => {
  it('ties are 1, a blowout is 0, and the scale differs per sport', () => {
    expect(closenessOf('NFL', { away: 17, home: 17 })).toBe(1);
    expect(closenessOf('NFL', { away: 40, home: 10 })).toBe(0);
    expect(closenessOf('NHL', { away: 2, home: 1 })).toBeCloseTo(2 / 3, 5);
    expect(closenessOf('NBA', { away: 100, home: 98 })).toBeGreaterThan(closenessOf('NFL', { away: 24, home: 20 })! * 0.8);
    expect(closenessOf('SOCCER', { away: 0, home: 2 })).toBe(0);
    expect(closenessOf('NFL', null)).toBeNull();
    expect(closenessOf('TENNIS', { away: 1, home: 0 })).toBeNull();
  });
});

describe('live score', () => {
  it('close AND late is worth more than close or late alone', () => {
    const closeEarly = liveScore(live('NFL', 'A', 'B', 14, 14, 'Q1 10:00'), none).score;
    const blowoutLate = liveScore(live('NFL', 'C', 'D', 41, 7, 'Q4 2:00'), none).score;
    const closeLate = liveScore(live('NFL', 'E', 'F', 20, 17, 'Q4 2:00'), none).score;
    expect(closeLate).toBeGreaterThan(closeEarly + WEIGHTS.late);
    expect(closeLate).toBeGreaterThan(blowoutLate + WEIGHTS.close);
    // The combined reason exists and is the largest single term.
    const why = liveScore(live('NFL', 'E', 'F', 20, 17, 'Q4 2:00'), none).reasons;
    expect(why.find((r) => r.why === 'close and late')!.points).toBe(Math.max(...why.map((r) => r.points)));
  });
  it('a followed team outranks every unfollowed game, however good the other game is', () => {
    const thriller = live('NFL', 'A', 'B', 20, 20, 'Q4 0:30', { away: { rank: 1 }, home: { rank: 2 } });
    const followed = live('NFL', 'C', 'D', 35, 3, 'Q1 5:00');
    const f = { teams: ['nfl:C'], games: [] };
    expect(liveScore(followed, f).score).toBeGreaterThan(liveScore(thriller, f).score);
    expect(keys(orderLive([thriller, followed], f).ordered)).toEqual([followed.key, thriller.key]);
    expect(keys(orderLive([thriller, followed], none).ordered)).toEqual([thriller.key, followed.key]);
  });
  it('a followed GAME (the star) counts like a followed team', () => {
    const g = live('NBA', 'A', 'B', 50, 50, 'Q1 5:00');
    expect(liveScore(g, { teams: [], games: [g.key] }).score).toBeGreaterThanOrEqual(WEIGHTS.follow);
  });
  it('rankings add only when the source stated a top-25 rank; rivalry and postseason only when stated', () => {
    const base = live('CFB', 'A', 'B', 10, 10, 'Q2 5:00');
    const rankedOne = live('CFB', 'A', 'B', 10, 10, 'Q2 5:00', { away: { rank: 3 } });
    const both = live('CFB', 'A', 'B', 10, 10, 'Q2 5:00', { away: { rank: 3 }, home: { rank: 9 } });
    const unranked26 = live('CFB', 'A', 'B', 10, 10, 'Q2 5:00', { away: { rank: 26 } });
    expect(liveScore(rankedOne, none).score).toBeGreaterThan(liveScore(base, none).score);
    expect(liveScore(both, none).score).toBeGreaterThan(liveScore(rankedOne, none).score);
    expect(liveScore(unranked26, none).score).toBe(liveScore(base, none).score);
    expect(liveScore({ ...base, significance: { rivalry: true } }, none).score).toBeCloseTo(liveScore(base, none).score + WEIGHTS.rivalry, 6);
    expect(liveScore({ ...base, significance: { postseason: true } }, none).score).toBeCloseTo(liveScore(base, none).score + WEIGHTS.postseason, 6);
    expect(liveScore({ ...base, significance: null }, none).score).toBe(liveScore(base, none).score);
  });
  it('a live game with no score or no readable clock scores no closeness and no lateness (nothing is invented)', () => {
    expect(liveScore(game('NFL', 'A', 'B', { phase: 'live' }), none).score).toBe(0);
    const noClock = liveScore(live('NFL', 'A', 'B', 7, 7, 'In play'), none);
    expect(noClock.reasons.map((r) => r.why)).toEqual(['close']);
  });
  it('is deterministic: the same inputs give the same score and order', () => {
    const l = [live('NHL', 'A', 'B', 2, 2, 'P3 3:00'), live('NBA', 'C', 'D', 90, 88, 'Q4 1:00'), live('MLB', 'E', 'F', 3, 3, 'Bot 9th'), live('SOCCER', 'G', 'H', 1, 1, "85'")];
    expect(keys(orderLive(l, none).ordered)).toEqual(keys(orderLive([...l].reverse(), none).ordered));
  });
});

describe('hysteresis: the order does not jump on a live refresh', () => {
  it('settleTier keeps the previous tier while the score is within the margin of its band, and only then', () => {
    expect(settleTier(60)).toBe(Math.floor(60 / TIER_BAND));
    const t = Math.floor(60 / TIER_BAND);
    expect(settleTier(t * TIER_BAND - 2, t)).toBe(t);          // dipped just below the band: stays
    expect(settleTier((t + 1) * TIER_BAND + 3, t)).toBe(t);    // crept just above: stays
    expect(settleTier((t + 1) * TIER_BAND + 20, t)).toBe(t + 1); // clearly above: moves
    expect(settleTier(t * TIER_BAND - 20, t)).toBe(t - 1);
  });
  it('small score deltas inside a tier never reorder; the remembered order wins', () => {
    // Early in the game: closeness only (no lateness), so a one-point margin change is a few score points, well inside one tier.
    const mk = (id: string, other: string, away: number, home: number) => live('NBA', id, other, away, home, 'Q2 5:00');
    const first = orderLive([mk('A', 'B', 60, 60), mk('C', 'D', 60, 61)], none);
    expect(first.ordered.map((g) => g.eventId)).toEqual(['A_B', 'C_D']);
    // Now C is the tied game and A trails by a point: the fresh order would put C first, but the tier did not change.
    const a2 = mk('A', 'B', 60, 61), c2 = mk('C', 'D', 60, 60);
    expect(orderLive([a2, c2], none).ordered.map((g) => g.eventId)).toEqual(['C_D', 'A_B']);
    expect(orderLive([c2, a2], none, first.memory).ordered.map((g) => g.eventId)).toEqual(['A_B', 'C_D']);
  });
  it('a tier change reorders: a game that turns close and late rises past the others', () => {
    const a = live('NFL', 'A', 'B', 28, 7, 'Q3 10:00');
    const b = live('NFL', 'C', 'D', 21, 14, 'Q2 10:00');
    const c = live('NFL', 'E', 'F', 24, 3, 'Q3 2:00');
    const first = orderLive([a, b, c], none);
    const c2 = live('NFL', 'E', 'F', 24, 23, 'Q4 1:10');
    const second = orderLive([a, b, c2], none, first.memory);
    expect(second.ordered[0].key).toBe(c2.key);
  });
  it('games new to the list slot in by score without disturbing the order of the games already shown', () => {
    const a = live('NFL', 'A', 'B', 20, 17, 'Q4 5:00');
    const b = live('NFL', 'C', 'D', 20, 17, 'Q4 4:50');
    const first = orderLive([a, b], none);
    const n = live('NFL', 'E', 'F', 20, 17, 'Q4 4:00');
    const second = orderLive([n, b, a], none, first.memory);
    const rest = keys(second.ordered).filter((k) => k !== n.key);
    expect(rest).toEqual(keys(first.ordered));
  });
  it('a game that left the list is forgotten, and a stable tiebreak (start, then key) orders equal games', () => {
    const early = live('NBA', 'B', 'X', 50, 50, 'Q1 5:00', { startMs: 1_000 });
    const late = live('NBA', 'A', 'Y', 50, 50, 'Q1 5:00', { startMs: 2_000 });
    const same = live('NBA', 'C', 'Z', 50, 50, 'Q1 5:00', { startMs: 2_000 });
    expect(keys(orderLive([same, late, early], none).ordered)).toEqual([early.key, late.key, same.key]);
    const first = orderLive([early, late], none);
    expect(Object.keys(orderLive([late], none, first.memory).memory.tier)).toEqual([late.key]);
  });
  it('the memory is a pure value: ordering twice from the same memory gives the same answer', () => {
    const l = [live('NFL', 'A', 'B', 20, 17, 'Q4 5:00'), live('NFL', 'C', 'D', 10, 7, 'Q2 5:00'), live('NFL', 'E', 'F', 3, 30, 'Q3 5:00')];
    const m = orderLive(l, none).memory;
    expect(keys(orderLive([...l].reverse(), none, m).ordered)).toEqual(keys(orderLive(l, none, m).ordered));
  });
});

describe('upcoming and final order', () => {
  const conf = (c: string) => ({ conference: c });
  it('tiers: followed, ranked-vs-ranked, any ranked, conference matchup, the rest', () => {
    const rest = game('CFB', 'A', 'B');
    const confG = game('CFB', 'C', 'D', { away: conf('SEC'), home: conf('SEC') });
    const oneRanked = game('CFB', 'E', 'F', { away: { rank: 20 } });
    const rvr = game('CFB', 'G', 'H', { away: { rank: 12 }, home: { rank: 18 } });
    const fol = game('CFB', 'I', 'J');
    const f = { teams: ['cfb:I'], games: [] };
    expect([rest, confG, oneRanked, rvr, fol].map((g) => upcomingTier(g, f))).toEqual([4, 3, 2, 1, 0]);
    expect(keys(orderUpcoming([rest, confG, oneRanked, rvr, fol], f))).toEqual([fol, rvr, oneRanked, confG, rest].map((g) => g.key));
  });
  it('inside the ranked tiers the better rank is first; inside the rest it is time, then key', () => {
    const r5 = game('CFB', 'A', 'B', { away: { rank: 5 }, home: { rank: 20 } });
    const r2 = game('CFB', 'C', 'D', { away: { rank: 2 }, home: { rank: 24 } });
    expect(keys(orderUpcoming([r5, r2], none))).toEqual([r2.key, r5.key]);
    const t2 = game('NBA', 'A', 'B', { startMs: 2000 });
    const t1 = game('NBA', 'C', 'D', { startMs: 1000 });
    expect(keys(orderUpcoming([t2, t1], none))).toEqual([t1.key, t2.key]);
  });
  it('a conference matchup needs both conferences known and equal (never inferred)', () => {
    expect(conferenceMatchup(game('CFB', 'A', 'B', { away: conf('ACC'), home: conf('ACC') }))).toBe(true);
    expect(conferenceMatchup(game('CFB', 'A', 'B', { away: conf('ACC'), home: conf('SEC') }))).toBe(false);
    expect(conferenceMatchup(game('CFB', 'A', 'B', { away: conf('ACC') }))).toBe(false);
    expect(conferenceMatchup(game('CFB', 'A', 'B'))).toBe(false);
  });
  it('finals: followed first, then ranked, then the most recent', () => {
    const old = game('NBA', 'A', 'B', { phase: 'final', startMs: 1000 });
    const recent = game('NBA', 'C', 'D', { phase: 'final', startMs: 3000 });
    const fol = game('NBA', 'E', 'F', { phase: 'final', startMs: 500 });
    expect(keys(orderFinal([old, recent, fol], { teams: ['nba:E'], games: [] }))).toEqual([fol.key, recent.key, old.key]);
  });
});
