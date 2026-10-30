import { describe, expect, it } from 'vitest';
import { filterFollows, followedSports, groupByDay, keyId, keySlug, meanOf, recentRows, reviveFollows, selectFollowing, suggestTeams, validSport, whyFollowed, type FollowSet } from '../../src/v3/model/following';
import { dayKey } from '../../src/v3/model/time';
import type { V3Game, V3Team } from '../../src/v3/model/types';

const NOW = Date.parse('2026-10-30T16:00:00Z');
const H = 3600_000;
const team = (slug: string, id: string): V3Team => ({ id, slug, sport: slug.toUpperCase(), name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'] });
const game = (slug: string, a: string, h: string, o: Partial<V3Game> = {}): V3Game => ({
  key: `${slug}:${a}_${h}`, slug, sport: slug.toUpperCase(), eventId: `${a}_${h}`, league: slug, phase: 'pregame', startMs: NOW + 2 * H,
  away: team(slug, a), home: team(slug, h), score: null, lines: [], signals: 0, provenance: 'publication', ...o,
});
const none: FollowSet = { teams: [], players: [], games: [] };

describe('reviveFollows (migration of stored follows)', () => {
  it('fills a missing players list, drops junk and duplicates, keeps order', () => {
    expect(reviveFollows({ teams: ['nfl:DAL', 'nfl:DAL', 7, '', ' nba:BOS '], games: ['nfl:evt_1'] })).toEqual({ teams: ['nfl:DAL', 'nba:BOS'], players: [], games: ['nfl:evt_1'] });
  });
  it('survives anything storage might hold', () => {
    for (const raw of [null, undefined, 3, 'x', [], { teams: 'nfl:DAL', players: {}, games: null }]) expect(reviveFollows(raw)).toEqual(none);
  });
  it('keeps the current shape unchanged', () => {
    const f = { teams: ['cfb:UGA'], players: ['nba:prt_1'], games: ['cfb:g1'] };
    expect(reviveFollows(f)).toEqual(f);
  });
});

describe('sports and the filter', () => {
  const f: FollowSet = { teams: ['nba:BOS', 'cfb:UGA'], players: ['nfl:prt_1'], games: ['tennis:m1'] };
  it('lists only followed sports, in product order', () => {
    expect(followedSports(f)).toEqual(['nfl', 'cfb', 'nba', 'tennis']);
    expect(followedSports(none)).toEqual([]);
  });
  it('an unfollowed or unknown sport in the address means all sports', () => {
    expect(validSport('nba', f)).toBe('nba');
    expect(validSport('mlb', f)).toBeNull();
    expect(validSport(null, f)).toBeNull();
    expect(validSport('nba', none)).toBeNull();
  });
  it('filtering narrows the follows and never adds one', () => {
    expect(filterFollows(f, 'nba')).toEqual({ teams: ['nba:BOS'], players: [], games: [] });
    expect(filterFollows(f, null)).toBe(f);
  });
  it('keys split into sport and id (ids may contain colons)', () => {
    expect(keySlug('nba:prt_1')).toBe('nba');
    expect(keyId('soccer:a:b')).toBe('a:b');
  });
});

describe('why a game is followed', () => {
  const g = game('nba', 'BOS', 'NYK');
  it('a starred game, a followed team or a followed player on one of the teams', () => {
    expect(whyFollowed(g, { ...none, games: [g.key] })).toEqual([{ kind: 'game' }]);
    expect(whyFollowed(g, { ...none, teams: ['nba:NYK'] })).toEqual([{ kind: 'team', teamKey: 'nba:NYK' }]);
    expect(whyFollowed(g, { ...none, players: ['nba:p1'] }, { 'nba:p1': 'nba:BOS' })).toEqual([{ kind: 'player', playerKey: 'nba:p1' }]);
  });
  it('a player of unknown team, or of another team, adds nothing; a team of another sport does not match', () => {
    expect(whyFollowed(g, { ...none, players: ['nba:p1', 'nba:p2'] }, { 'nba:p2': 'nba:LAL' })).toEqual([]);
    expect(whyFollowed(g, { ...none, teams: ['nfl:BOS'] })).toEqual([]);
  });
});

describe('selectFollowing', () => {
  const live1 = game('nba', 'BOS', 'NYK', { phase: 'live', startMs: NOW - H, score: { away: 50, home: 48, clock: 'Q3', source: 'score-feed', asOf: null } });
  const live2 = game('nfl', 'DAL', 'PHI', { phase: 'live', startMs: NOW - 2 * H });
  const liveOther = game('nfl', 'GB', 'CHI', { phase: 'live' });
  const soon = game('nba', 'LAL', 'BOS', { startMs: NOW + H });
  const tomorrow = game('nfl', 'DAL', 'NYG', { startMs: NOW + 26 * H });
  const later = game('cfb', 'UGA', 'FLA', { startMs: NOW + 5 * 24 * H });
  const fin1 = game('nba', 'MIA', 'BOS', { phase: 'final', startMs: NOW - 20 * H, score: { away: 90, home: 99, clock: 'Final', source: 'publication', asOf: null } });
  const fin2 = game('nfl', 'DAL', 'WAS', { phase: 'final', startMs: NOW - 70 * H });
  const pend = game('nba', 'BOS', 'DEN', { phase: 'other', startMs: NOW - 4 * H });
  const slate = [fin2, tomorrow, liveOther, live1, later, soon, fin1, live2, pend];
  const f: FollowSet = { teams: ['nba:BOS', 'nfl:DAL'], players: [], games: [later.key] };

  it('reads every followed sport together by default', () => {
    const v = selectFollowing(slate, f, { now: NOW });
    expect(v.live.map((x) => x.g.key)).toEqual([live2.key, live1.key]);
    expect(v.live.some((x) => x.g.key === liveOther.key)).toBe(false);
    expect(v.finals.map((x) => x.g.key)).toEqual([fin1.key, fin2.key]);
    expect(v.pending.map((x) => x.g.key)).toEqual([pend.key]);
    expect(v.upcomingCount).toBe(3);
  });
  it('upcoming is time-ordered and grouped by local day', () => {
    const v = selectFollowing(slate, f, { now: NOW });
    expect(v.upcoming.flatMap((d) => d.games.map((x) => x.g.key))).toEqual([soon.key, tomorrow.key, later.key]);
    expect(v.upcoming.map((d) => d.day)).toEqual([dayKey(soon.startMs), dayKey(tomorrow.startMs), dayKey(later.startMs)]);
    expect(v.upcoming[0].word).toBe(dayKey(soon.startMs) === dayKey(NOW) ? 'Today' : v.upcoming[0].word);
  });
  it('the sport filter is purely a filter', () => {
    const v = selectFollowing(slate, f, { now: NOW, sport: 'nba' });
    expect(v.live.map((x) => x.g.key)).toEqual([live1.key]);
    expect(v.finals.map((x) => x.g.key)).toEqual([fin1.key]);
    expect(v.upcoming.flatMap((d) => d.games.map((x) => x.g.key))).toEqual([soon.key]);
  });
  it('a followed player brings his team games into live', () => {
    const v = selectFollowing(slate, { ...none, players: ['nfl:p9'] }, { now: NOW, playerTeams: { 'nfl:p9': 'nfl:GB' } });
    expect(v.live.map((x) => x.g.key)).toEqual([liveOther.key]);
    expect(v.live[0].why).toEqual([{ kind: 'player', playerKey: 'nfl:p9' }]);
  });
  it('lists followed games that are not on the slate', () => {
    expect(selectFollowing(slate, { ...none, games: ['nfl:gone', later.key] }, { now: NOW }).missingGames).toEqual(['nfl:gone']);
  });
  it('is stable: a score change or input order does not move a card', () => {
    const a = selectFollowing(slate, f, { now: NOW });
    const rescored = slate.map((g) => (g.key === live1.key ? { ...g, score: { away: 2, home: 90, clock: 'Q4', source: 'score-feed' as const, asOf: null } } : g));
    const b = selectFollowing([...rescored].reverse(), f, { now: NOW });
    expect(b.live.map((x) => x.g.key)).toEqual(a.live.map((x) => x.g.key));
    expect(b.upcoming.map((d) => d.games.map((x) => x.g.key))).toEqual(a.upcoming.map((d) => d.games.map((x) => x.g.key)));
  });
  it('a starred game outranks a team game within live', () => {
    const v = selectFollowing(slate, { ...f, games: [live1.key] }, { now: NOW });
    expect(v.live[0].g.key).toBe(live1.key);
  });
  it('nothing followed means nothing selected', () => {
    const v = selectFollowing(slate, none, { now: NOW });
    expect([v.live, v.pending, v.upcoming, v.finals].every((l) => l.length === 0)).toBe(true);
  });
  it('caps upcoming and still reports how many there are', () => {
    const many = Array.from({ length: 30 }, (_, i) => game('nba', 'BOS', `T${i}`, { startMs: NOW + (i + 1) * H }));
    const v = selectFollowing(many, { ...none, teams: ['nba:BOS'] }, { now: NOW, upcomingLimit: 5 });
    expect(v.upcoming.flatMap((d) => d.games).length).toBe(5);
    expect(v.upcomingCount).toBe(30);
  });
});

describe('groupByDay', () => {
  it('a game with no start time goes in its own group', () => {
    const g = game('nba', 'A', 'B', { startMs: Number.NaN });
    const out = groupByDay([{ g, why: [{ kind: 'game' }] }], '2026-10-30');
    expect(out[0].word).toBe('Time to be announced');
  });
});

describe('suggestTeams (empty state)', () => {
  it('spreads across sports, one entry per team, deterministic', () => {
    const slate = [game('nfl', 'DAL', 'PHI'), game('nba', 'BOS', 'NYK'), game('mlb', 'LAD', 'SD'), game('nba', 'LAL', 'DEN', { startMs: NOW + 9 * H })];
    const s = suggestTeams(slate, 4);
    expect(s.map((t) => `${t.slug}:${t.id}`)).toEqual(['nfl:PHI', 'nba:NYK', 'mlb:SD', 'nfl:DAL']);
    expect(suggestTeams(slate, 4)).toEqual(s);
    expect(suggestTeams([], 4)).toEqual([]);
  });
});

describe('player rows', () => {
  it('recentRows returns the latest first and meanOf ignores missing values', () => {
    expect(recentRows([{ date: '2026-10-01' }, { date: '2026-10-20' }, { date: '2026-10-10' }], 2).map((r) => r.date)).toEqual(['2026-10-20', '2026-10-10']);
    expect(meanOf([10, null, 20, undefined])).toBe(15);
    expect(meanOf([null])).toBeNull();
    expect(meanOf([])).toBeNull();
  });
});
