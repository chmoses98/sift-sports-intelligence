import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLeagues, pickerView, type PickTeam } from '../../src/v3/model/favorites';
import { capWithGroups, followCount, followedSports, filterFollows, groupOnly, isEmptyFollows, reviveFollows, selectFollowing, whyFollowed, type FollowSet } from '../../src/v3/model/following';
import {
  COLLEGE_ALL, conferenceKey, coveredBy, groupHasGame, groupLabel, groupsInSport, groupSports, groupsOfGame, hasGroup, leagueKey, parseGroup, reviveGroups, sameGroup, toggleGroupIn,
} from '../../src/v3/model/groups';
import { followsDirect, followsGame, liveScore, orderLive, orderUpcoming, upcomingTier, WEIGHTS } from '../../src/v3/model/priority';
import { isFavorite } from '../../src/v3/model/switcher';
import type { V3Game, V3Team } from '../../src/v3/model/types';

const NOW = Date.parse('2026-10-31T16:00:00Z');
const H = 3600_000;
const team = (slug: string, id: string, conference?: string, rank?: number): V3Team => ({ id, slug, sport: slug.toUpperCase(), name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'], ...(conference ? { conference } : {}), ...(rank ? { rank } : {}) });
type Over = Partial<V3Game> & { aConf?: string; hConf?: string; aRank?: number; hRank?: number };
const game = (slug: string, a: string, h: string, o: Over = {}): V3Game => {
  const { aConf, hConf, aRank, hRank, ...rest } = o;
  return {
    key: `${slug}:${a}_${h}`, slug, sport: slug.toUpperCase(), eventId: `${a}_${h}`, league: slug, phase: 'pregame', startMs: NOW + 2 * H,
    away: team(slug, a, aConf, aRank), home: team(slug, h, hConf, hRank), score: null, lines: [], signals: 0, provenance: 'publication', ...rest,
  };
};
const scored = (away: number, home: number, clock: string): V3Game['score'] => ({ away, home, clock, source: 'score-feed', asOf: null });
const none: FollowSet = { teams: [], players: [], games: [], groups: [] };
const withGroups = (...groups: string[]): FollowSet => ({ ...none, groups });

describe('group keys', () => {
  it('parse to a kind, a sport and (for conferences) the label', () => {
    expect(parseGroup('college:all')).toMatchObject({ kind: 'college', slug: null });
    expect(parseGroup('league:NFL')).toMatchObject({ kind: 'league', slug: 'nfl', key: 'league:nfl' });
    expect(parseGroup('conf:cfb:Big Ten')).toMatchObject({ kind: 'conference', slug: 'cfb', conference: 'Big Ten' });
  });
  it('refuse what names nothing: junk, a conference of a pro league, an empty label', () => {
    for (const bad of [null, 7, '', 'league:', 'league:n f l', 'conf:nfl:East', 'conf:cfb:', 'conf:cfb', 'team:nfl:DAL', 'college:everything']) expect(parseGroup(bad)).toBeNull();
  });
  it('a conference is the same group however its label is spelled', () => {
    expect(sameGroup(conferenceKey('cfb', 'Big Ten'), 'conf:cfb:big-ten')).toBe(true);
    expect(sameGroup(conferenceKey('cfb', 'SEC'), conferenceKey('cbb', 'SEC'))).toBe(false);
    expect(sameGroup(leagueKey('nfl'), COLLEGE_ALL)).toBe(false);
  });
  it('labels read as a person would say them', () => {
    expect(groupLabel(COLLEGE_ALL)).toBe('All college sports');
    expect(groupLabel(leagueKey('cfb'))).toBe('NCAAF');
    expect(groupLabel(leagueKey('nfl'))).toBe('NFL');
    expect(groupLabel(conferenceKey('cbb', 'Big East'))).toBe('NCAAB · Big East');
  });
});

describe('revive and toggle', () => {
  it('keeps valid keys in order, drops junk and duplicates, canonicalises, never throws', () => {
    expect(reviveGroups(['league:NFL', 'league:nfl', 'x', 4, 'college:all', 'conf:cfb:SEC', 'conf:cfb:sec'])).toEqual(['league:nfl', 'college:all', 'conf:cfb:SEC']);
    for (const raw of [null, undefined, 'league:nfl', {}, 3]) expect(reviveGroups(raw)).toEqual([]);
  });
  it('toggling adds the newest first and removes by sameness', () => {
    const a = toggleGroupIn([], 'league:nfl');
    const b = toggleGroupIn(a, 'conf:cfb:SEC');
    expect(b).toEqual(['conf:cfb:SEC', 'league:nfl']);
    expect(toggleGroupIn(b, 'conf:cfb:sec')).toEqual(['league:nfl']);
    expect(toggleGroupIn(b, 'nonsense')).toEqual(b);
    expect(hasGroup(b, 'league:nfl')).toBe(true);
  });
  it('a wider group covers the narrower ones', () => {
    expect(coveredBy([COLLEGE_ALL], leagueKey('cfb'))).toBe(COLLEGE_ALL);
    expect(coveredBy([COLLEGE_ALL], conferenceKey('cbb', 'ACC'))).toBe(COLLEGE_ALL);
    expect(coveredBy([leagueKey('cfb')], conferenceKey('cfb', 'SEC'))).toBe(leagueKey('cfb'));
    expect(coveredBy([leagueKey('cfb')], conferenceKey('cbb', 'SEC'))).toBeNull();
    expect(coveredBy([COLLEGE_ALL], leagueKey('nfl'))).toBeNull();
    expect(coveredBy([COLLEGE_ALL], COLLEGE_ALL)).toBeNull();
  });
  it('sports reached by groups', () => {
    expect(groupSports([COLLEGE_ALL]).sort()).toEqual(['cbb', 'cfb']);
    expect(groupSports(['league:nfl', 'conf:cfb:SEC'])).toEqual(['nfl', 'cfb']);
    expect(groupsInSport([COLLEGE_ALL, 'league:nfl', 'conf:cfb:SEC'], 'cbb')).toEqual([COLLEGE_ALL]);
    expect(groupsInSport(['league:nfl'], null)).toEqual(['league:nfl']);
  });
});

describe('migration of the stored follows', () => {
  it('a record from before groups existed loads whole, with no groups', () => {
    const legacy = { teams: ['nfl:DAL', 'cfb:UGA'], players: ['nba:prt_1'], games: ['nfl:evt_1'] };
    expect(reviveFollows(legacy)).toEqual({ ...legacy, groups: [] });
    // an even older record without players
    expect(reviveFollows({ teams: ['nfl:DAL'], games: [] })).toEqual({ teams: ['nfl:DAL'], players: [], games: [], groups: [] });
  });
  it('the current shape round-trips and groups are cleaned', () => {
    const f = { teams: ['nfl:DAL'], players: [], games: [], groups: ['league:nfl', 'conf:cfb:SEC'] };
    expect(reviveFollows(f)).toEqual(f);
    expect(reviveFollows({ ...f, groups: ['league:nfl', 'bogus', 'league:nfl'] }).groups).toEqual(['league:nfl']);
    expect(reviveFollows({ ...f, groups: 'league:nfl' }).groups).toEqual([]);
  });
  describe('the device store', () => {
    beforeEach(() => { localStorage.clear(); vi.resetModules(); });
    it('opens a stored pre-groups record with every follow kept, then writes groups beside them', async () => {
      localStorage.setItem('sift3.follows', JSON.stringify({ teams: ['nfl:DAL', 'cfb:UGA'], players: ['nba:prt_1'], games: ['nfl:evt_1'] }));
      const prefs = await import('../../src/v3/state/prefs');
      expect(prefs.followsNow()).toEqual({ teams: ['nfl:DAL', 'cfb:UGA'], players: ['nba:prt_1'], games: ['nfl:evt_1'], groups: [] });
      expect(prefs.toggleGroup('conf:cfb:SEC')).toBe(true);
      expect(prefs.toggleGroup(COLLEGE_ALL)).toBe(true);
      expect(prefs.toggleGroup('conf:cfb:sec')).toBe(false);
      prefs.toggleFollow('teams', 'nba:BOS');
      const stored = JSON.parse(localStorage.getItem('sift3.follows')!);
      expect(stored).toEqual({ teams: ['nba:BOS', 'nfl:DAL', 'cfb:UGA'], players: ['nba:prt_1'], games: ['nfl:evt_1'], groups: [COLLEGE_ALL] });
      // and it loads again unchanged
      vi.resetModules();
      const again = await import('../../src/v3/state/prefs');
      expect(again.followsNow()).toEqual(stored);
    });
    it('an empty device starts with no follows and no groups', async () => {
      const prefs = await import('../../src/v3/state/prefs');
      expect(prefs.followsNow()).toEqual(none);
      prefs.toggleGroup('league:nfl');
      prefs.clearAllLocal();
      expect(prefs.followsNow()).toEqual(none);
    });
  });
});

describe('which games a group includes', () => {
  const sec = game('cfb', 'UGA', 'FLA', { aConf: 'SEC', hConf: 'SEC' });
  const mixed = game('cfb', 'BAMA', 'ND', { aConf: 'SEC', hConf: 'Ind' });
  const big = game('cfb', 'OSU', 'MICH', { aConf: 'Big Ten', hConf: 'Big Ten' });
  const noConf = game('cfb', 'AAA', 'BBB');
  const hoops = game('cbb', 'DUKE', 'UNC', { aConf: 'ACC', hConf: 'ACC' });
  const nfl = game('nfl', 'DAL', 'PHI');
  it('a league is every game of that sport', () => {
    expect(groupHasGame('league:nfl', nfl)).toBe(true);
    expect(groupHasGame('league:nfl', sec)).toBe(false);
    expect(groupHasGame('league:cfb', noConf)).toBe(true);
  });
  it('a conference matches when EITHER team is in it, in that sport only, and never without a stated conference', () => {
    expect(groupHasGame(conferenceKey('cfb', 'SEC'), sec)).toBe(true);
    expect(groupHasGame(conferenceKey('cfb', 'SEC'), mixed)).toBe(true);
    expect(groupHasGame(conferenceKey('cfb', 'SEC'), big)).toBe(false);
    expect(groupHasGame(conferenceKey('cfb', 'SEC'), noConf)).toBe(false);
    expect(groupHasGame(conferenceKey('cbb', 'SEC'), sec)).toBe(false);
    expect(groupHasGame(conferenceKey('cbb', 'ACC'), hoops)).toBe(true);
    expect(groupHasGame('conf:cfb:big-ten', big)).toBe(true);
  });
  it('all college sports is football and basketball, not the pros', () => {
    expect([sec, hoops, nfl].map((g) => groupHasGame(COLLEGE_ALL, g))).toEqual([true, true, false]);
  });
  it('reports the followed groups of a game, narrowest first', () => {
    expect(groupsOfGame(sec, [COLLEGE_ALL, 'league:cfb', 'conf:cfb:SEC', 'league:nfl'])).toEqual(['conf:cfb:SEC', 'league:cfb', COLLEGE_ALL]);
    expect(groupsOfGame(sec, undefined)).toEqual([]);
  });
  it('followsGame honours groups; followsDirect and the switcher favourites do not', () => {
    const f = { teams: [], games: [], groups: ['league:nfl'] };
    expect(followsGame(nfl, f)).toBe(true);
    expect(followsDirect(nfl, f)).toBe(false);
    expect(isFavorite(nfl, f)).toBe(false);
    expect(followsGame(nfl, { teams: [], games: [] })).toBe(false); // a caller that knows no groups
    expect(followsGame(nfl, { teams: ['nfl:DAL'], games: [], groups: [] })).toBe(true);
  });
});

describe('priority with group follows', () => {
  const liveCfb = (a: string, h: string, o: Over = {}) => game('cfb', a, h, { phase: 'live', score: scored(7, 7, 'Q4 2:00'), aConf: 'SEC', hConf: 'SEC', ...o });
  it('a group-only game outranks every unfollowed game and ranks below a starred one', () => {
    const thriller = game('nfl', 'X', 'Y', { phase: 'live', score: scored(20, 20, 'Q4 0:30'), significance: { rivalry: true, postseason: true }, aRank: 1, hRank: 2 });
    const viaGroup = liveCfb('UGA', 'FLA', { score: scored(0, 35, 'Q1 5:00') });
    const starred = game('nba', 'BOS', 'NYK', { phase: 'live', score: scored(10, 40, 'Q1 5:00') });
    const f = { teams: ['nba:BOS'], games: [], groups: ['conf:cfb:SEC'] };
    expect(liveScore(thriller, { teams: [], games: [] }).score).toBeLessThan(WEIGHTS.followGroup);
    expect(liveScore(viaGroup, f).score).toBeGreaterThan(liveScore(thriller, f).score);
    expect(liveScore(starred, f).score).toBeGreaterThan(liveScore(viaGroup, f).score);
    expect(liveScore(viaGroup, f).reasons.map((r) => r.why)).toContain('followed league or conference');
    expect(orderLive([thriller, viaGroup, starred], f).ordered.map((g) => g.key)).toEqual([starred.key, viaGroup.key, thriller.key]);
  });
  it('upcoming: a star first, then a group, then the ranked, in one window', () => {
    const star = game('nfl', 'DAL', 'PHI');
    const grp = game('cfb', 'UGA', 'FLA', { aConf: 'SEC', hConf: 'SEC' });
    const rvr = game('cbb', 'A', 'B', { aRank: 3, hRank: 9 });
    const rest = game('nhl', 'C', 'D');
    const f = { teams: ['nfl:DAL'], games: [], groups: ['conf:cfb:SEC'] };
    expect([star, grp, rvr, rest].map((g) => upcomingTier(g, f))).toEqual([0, 0.5, 1, 4]);
    expect(orderUpcoming([rest, rvr, grp, star], f).map((g) => g.key)).toEqual([star.key, grp.key, rvr.key, rest.key]);
  });
  it('the order seen is kept across a refresh', () => {
    const a = liveCfb('UGA', 'FLA'), b = liveCfb('BAMA', 'AUB');
    const f = { teams: [], games: [], groups: ['league:cfb'] };
    const first = orderLive([a, b], f);
    const again = orderLive([b, a], f, first.memory);
    expect(again.ordered.map((g) => g.key)).toEqual(first.ordered.map((g) => g.key));
  });
});

describe('what My SIFT and Home count and show', () => {
  it('a group counts once, however many games it brings', () => {
    expect(followCount({ teams: ['nfl:DAL'], games: ['nfl:g'], groups: ['league:nfl', COLLEGE_ALL] })).toBe(4);
    expect(isEmptyFollows(withGroups('league:nfl'))).toBe(false);
    expect(isEmptyFollows(none)).toBe(true);
  });
  it('sports followed include the sports of a group, and the filter narrows the groups with the rest', () => {
    const f: FollowSet = { ...none, teams: ['nba:BOS'], groups: [COLLEGE_ALL, 'league:nfl'] };
    expect(followedSports(f)).toEqual(['nfl', 'cfb', 'cbb', 'nba']);
    expect(filterFollows(f, 'cbb').groups).toEqual([COLLEGE_ALL]);
    expect(filterFollows(f, 'nba').groups).toEqual([]);
  });
  it('why: one reason for a group, the most specific', () => {
    const g = game('cfb', 'UGA', 'FLA', { aConf: 'SEC', hConf: 'SEC' });
    expect(whyFollowed(g, withGroups('league:cfb', 'conf:cfb:SEC', COLLEGE_ALL))).toEqual([{ kind: 'group', groupKey: 'conf:cfb:SEC' }]);
    expect(whyFollowed(g, { ...withGroups('league:cfb'), teams: ['cfb:UGA'] }).map((w) => w.kind)).toEqual(['team', 'group']);
  });

  const day = (n: number, slug = 'cfb', over: Over = {}) => Array.from({ length: n }, (_, i) => game(slug, `A${slug}${i}`, `H${slug}${i}`, { startMs: NOW + (i + 1) * 60_000, aConf: 'SEC', hConf: 'SEC', ...over }));
  it("a followed league does not bury the viewer's own teams in the live list or the upcoming list", () => {
    const own = game('nfl', 'DAL', 'PHI', { phase: 'live', startMs: NOW + 5 * H });
    const lives = day(30, 'cfb', { phase: 'live' });
    const f: FollowSet = { ...none, teams: ['nfl:DAL'], groups: ['league:cfb'] };
    const v = selectFollowing([...lives, own], f, { now: NOW });
    expect(v.live[0].g.key).toBe(own.key); // the star first although it started last
    expect(v.live).toHaveLength(13); // the star + 12 group games
    expect(v.groupLiveHidden).toBe(18);
    const up = selectFollowing([...day(40), game('nfl', 'DAL', 'NYG', { startMs: NOW + 9 * H })], f, { now: NOW });
    expect(up.upcomingCount).toBe(41);
    expect(up.upcoming.flatMap((d) => d.games).some((x) => x.g.key === 'nfl:DAL_NYG')).toBe(true);
    expect(up.upcoming.flatMap((d) => d.games).length).toBeLessThanOrEqual(16);
  });
  it('a followed league alone fills its share (never silently empty) and the cap keeps order', () => {
    const f = withGroups('league:cfb');
    const v = selectFollowing(day(40), f, { now: NOW });
    expect(v.upcoming.flatMap((d) => d.games)).toHaveLength(16);
    const list = day(20).map((g) => ({ g, why: [{ kind: 'group' as const, groupKey: 'league:cfb' }] }));
    expect(capWithGroups(list, 5).map((x) => x.g.key)).toEqual(list.slice(0, 5).map((x) => x.g.key));
    expect(groupOnly(list[0])).toBe(true);
    expect(capWithGroups([], 5)).toEqual([]);
  });
  it('a followed conference lists only conference games; a game with no stated conference is left out', () => {
    const inConf = game('cfb', 'UGA', 'FLA', { aConf: 'SEC', hConf: 'SEC' });
    const out = game('cfb', 'OSU', 'MICH', { aConf: 'Big Ten', hConf: 'Big Ten' });
    const unknown = game('cfb', 'AAA', 'BBB');
    const v = selectFollowing([inConf, out, unknown], withGroups('conf:cfb:SEC'), { now: NOW });
    expect(v.upcoming.flatMap((d) => d.games.map((x) => x.g.key))).toEqual([inConf.key]);
  });
});

describe('the favorites picker view', () => {
  const t = (slug: string, id: string, name: string, conference: string | null = null): PickTeam => ({ key: `${slug}:${id}`, slug, name, nick: name, abbr: id, conference, logo: null, colors: ['#000', '#fff'] });
  const leagues = buildLeagues([
    { slug: 'nba', teams: [t('nba', 'BOS', 'Boston Celtics'), t('nba', 'NYK', 'New York Knicks')] },
    { slug: 'cfb', teams: [t('cfb', 'UGA', 'Georgia', 'SEC'), t('cfb', 'FLA', 'Florida', 'SEC'), t('cfb', 'OSU', 'Ohio State', 'Big Ten'), t('cfb', 'UGA', 'Georgia', 'SEC')] },
    { slug: 'nfl', teams: [t('nfl', 'DAL', 'Dallas Cowboys')] },
    { slug: 'cbb', teams: [], conferences: [{ label: 'ACC', count: 18 }, { label: 'SEC', count: 16 }] },
  ], ['SEC', 'Big Ten', 'ACC']);

  it('builds leagues in the product order, teams by name once each, conferences in the fan order', () => {
    expect(leagues.map((l) => l.slug)).toEqual(['nfl', 'cfb', 'cbb', 'nba']);
    expect(leagues[1].teams.map((x) => x.name)).toEqual(['Florida', 'Georgia', 'Ohio State']);
    expect(leagues[1].conferences.map((c) => [c.label, c.count])).toEqual([['SEC', 2], ['Big Ten', 1]]);
    expect(leagues[2].conferences.map((c) => c.label)).toEqual(['SEC', 'ACC']);
    expect(leagues[0].conferences).toEqual([]); // pro leagues have no college conferences
  });
  it('All with no search: the college row and a whole-league row each, no team list', () => {
    const v = pickerView(leagues, 'all', '');
    expect(v.collegeRow).toBe(true);
    expect(v.leagues.map((l) => l.league.slug)).toEqual(['nfl', 'cfb', 'cbb', 'nba']);
    expect(v.leagues.every((l) => l.leagueRow && l.teams.length === 0 && l.conferences.length === 0)).toBe(true);
    expect(v.chooseHint).toBe(true);
  });
  it('a league: its row, its conferences (college) and its teams; the college row only for a college league', () => {
    const cfb = pickerView(leagues, 'cfb', '');
    expect(cfb.collegeRow).toBe(true);
    expect(cfb.leagues).toHaveLength(1);
    expect(cfb.leagues[0].teams).toHaveLength(3);
    expect(cfb.leagues[0].conferences.map((c) => c.label)).toEqual(['SEC', 'Big Ten']);
    const nba = pickerView(leagues, 'nba', '');
    expect(nba.collegeRow).toBe(false);
    expect(nba.leagues[0].conferences).toEqual([]);
    expect(nba.chooseHint).toBe(false);
  });
  it('the team list is capped with a count of the rest', () => {
    const many = buildLeagues([{ slug: 'nfl', teams: Array.from({ length: 70 }, (_, i) => t('nfl', `T${i}`, `Team ${String(i).padStart(2, '0')}`)) }]);
    const v = pickerView(many, 'nfl', '', 60);
    expect(v.leagues[0].teams).toHaveLength(60);
    expect(v.leagues[0].moreTeams).toBe(10);
    expect(pickerView(many, 'nfl', 'team 6', 60).leagues[0].teams.map((x) => x.name)).toContain('Team 65');
  });
  it('search matches names, abbreviations, conferences and leagues, case-insensitively', () => {
    expect(pickerView(leagues, 'all', 'georgia').leagues.map((l) => l.teams.map((x) => x.key))).toEqual([['cfb:UGA']]);
    expect(pickerView(leagues, 'all', 'DAL').leagues[0].teams[0].key).toBe('nfl:DAL');
    const sec = pickerView(leagues, 'all', 'sec');
    expect(sec.leagues.map((l) => [l.league.slug, l.conferences.map((c) => c.label), l.teams.length])).toEqual([['cfb', ['SEC'], 2], ['cbb', ['SEC'], 0]]);
    const nfl = pickerView(leagues, 'all', 'nfl');
    expect(nfl.leagues.map((l) => [l.league.slug, l.leagueRow])).toEqual([['nfl', true]]);
    expect(pickerView(leagues, 'all', 'college').collegeRow).toBe(true);
    expect(pickerView(leagues, 'nba', 'college').collegeRow).toBe(false);
  });
  it('search narrowed by a league only searches it, and says when nothing matches', () => {
    expect(pickerView(leagues, 'nba', 'georgia').empty).toBe(true);
    expect(pickerView(leagues, 'all', 'zzz')).toMatchObject({ empty: true, leagues: [], collegeRow: false });
  });
});
