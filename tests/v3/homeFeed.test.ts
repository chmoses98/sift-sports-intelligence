import { describe, expect, it } from 'vitest';
import { cfbConferenceLabel, conferencesIn, confToken, matchesConference, resolveFilter, unifyLabel } from '../../src/v3/model/conference';
import { buildSchedule, defaultSport, dayStrip, gamesOnDay, jumpTargets, pickSport, sportChips } from '../../src/v3/model/homeFeed';
import { dayKey, zonedMs } from '../../src/v3/model/time';
import type { V3Game, V3Team } from '../../src/v3/model/types';

type Over = Omit<Partial<V3Game>, 'away' | 'home'> & { away?: Partial<V3Team>; home?: Partial<V3Team> };
const none = { teams: [], games: [] };
const DAY = '2026-10-31';
const team = (id: string, sport: string, o: Partial<V3Team> = {}): V3Team => ({ id, slug: sport.toLowerCase(), sport, name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'], ...o });
function game(sport: string, a: string, h: string, o: Over = {}): V3Game {
  const { away, home, ...rest } = o;
  return { key: `${sport.toLowerCase()}:${a}_${h}`, slug: sport.toLowerCase(), sport, eventId: `${a}_${h}`, league: sport, phase: 'pregame', startMs: zonedMs(DAY, 13, 0), away: team(a, sport, away), home: team(h, sport, home), score: null, lines: [], signals: 0, provenance: 'publication', ...rest };
}
const live = (sport: string, a: string, h: string, sa: number, sh: number, clock: string, o: Over = {}) => game(sport, a, h, { phase: 'live', score: { away: sa, home: sh, clock, source: 'score-feed', asOf: null }, ...o });

describe('sports and the default sport', () => {
  const slate = [game('NFL', 'A', 'B'), game('NBA', 'C', 'D'), live('CFB', 'E', 'F', 7, 3, 'Q1 5:00'), game('TENNIS', 'G', 'H'), game('MLB', 'I', 'J', { startMs: zonedMs('2026-11-01', 19, 0) })];
  it('lists only sports that have games, in product order, with the live count', () => {
    const chips = sportChips(gamesOnDay(slate, DAY, DAY));
    expect(chips.map((c) => c.slug)).toEqual(['nfl', 'nba', 'cfb', 'tennis']);
    expect(chips.find((c) => c.slug === 'cfb')).toMatchObject({ label: 'NCAAF', live: 1, count: 1 });
  });
  it('defaults to the first sport with live games, else the first with games; tennis only when nothing else is on', () => {
    const chips = sportChips(gamesOnDay(slate, DAY, DAY));
    expect(defaultSport(chips)).toBe('cfb');
    expect(defaultSport(sportChips([game('NFL', 'A', 'B'), game('NBA', 'C', 'D')]))).toBe('nfl');
    expect(defaultSport(sportChips([game('TENNIS', 'G', 'H')]))).toBe('tennis');
    expect(defaultSport(sportChips([game('TENNIS', 'G', 'H'), game('NBA', 'C', 'D')]))).toBe('nba');
    expect(defaultSport([])).toBeNull();
  });
  it('the address wins, then this device\'s last sport (only if it has games that day), then the default', () => {
    const chips = sportChips(gamesOnDay(slate, DAY, DAY));
    expect(pickSport('nba', 'nfl', chips)).toBe('nba');
    expect(pickSport('mlb', null, chips)).toBe('mlb');            // asked for, though empty that day: the empty state says so
    expect(pickSport(null, 'nfl', chips)).toBe('nfl');
    expect(pickSport(null, 'mlb', chips)).toBe('cfb');            // stored sport has no games today
    expect(pickSport('bogus', 'bogus', chips)).toBe('cfb');
    expect(pickSport(null, null, [])).toBeNull();
  });
  it('a game still in play after midnight belongs to today, not to the day it started', () => {
    const lateNight = live('NHL', 'A', 'B', 1, 1, 'P3 2:00', { startMs: zonedMs('2026-10-30', 22, 0) });
    expect(gamesOnDay([lateNight], '2026-10-31', '2026-10-31')).toHaveLength(1);
    expect(gamesOnDay([lateNight], '2026-10-30', '2026-10-31')).toHaveLength(1); // its own day too
    expect(gamesOnDay([lateNight], '2026-11-01', '2026-10-31')).toHaveLength(0);
  });
  it('the day strip is three back and ten forward, and always includes the selected day', () => {
    const d = dayStrip(DAY, DAY);
    expect(d).toHaveLength(14);
    expect(d[3]).toBe(DAY);
    expect(dayStrip(DAY, '2026-12-25')).toContain('2026-12-25');
  });
});

describe('the time-grouped schedule', () => {
  it('Live first (priority order), then each kickoff window in time order, then Awaiting result, then Final', () => {
    const slate = [
      game('CFB', 'A', 'B', { startMs: zonedMs(DAY, 16, 30) }), game('CFB', 'C', 'D', { startMs: zonedMs(DAY, 12, 0) }), game('CFB', 'E', 'F', { startMs: zonedMs(DAY, 12, 0) }),
      live('CFB', 'G', 'H', 20, 17, 'Q4 2:00'), live('CFB', 'I', 'J', 41, 3, 'Q4 2:00'),
      game('CFB', 'K', 'L', { phase: 'final', startMs: zonedMs(DAY, 9, 0) }), game('CFB', 'M', 'N', { phase: 'other', startMs: zonedMs(DAY, 11, 0) }),
    ];
    const { sections } = buildSchedule(slate, none);
    expect(sections.map((s) => s.kind)).toEqual(['live', 'time', 'time', 'awaiting', 'final']);
    expect(sections[0].games.map((g) => g.eventId)).toEqual(['G_H', 'I_J']); // the one-score game in the fourth quarter first
    expect(sections[1].games).toHaveLength(2);                                  // both noon games share one window
    expect(sections[1].title).not.toBe(sections[2].title);
    expect(sections[3].title).toBe('Awaiting result');
    expect(sections[4].title).toBe('Final');
  });
  it('inside a window: followed, then ranked vs ranked, then ranked, then conference matchups, then the rest', () => {
    const rest = game('CFB', 'A', 'B');
    const conf = game('CFB', 'C', 'D', { away: { conference: 'SEC' }, home: { conference: 'SEC' } });
    const ranked = game('CFB', 'E', 'F', { home: { rank: 11 } });
    const rvr = game('CFB', 'G', 'H', { away: { rank: 4 }, home: { rank: 19 } });
    const fol = game('CFB', 'I', 'J');
    const { sections } = buildSchedule([rest, conf, ranked, rvr, fol], { teams: ['cfb:I'], games: [] });
    expect(sections).toHaveLength(1);
    expect(sections[0].games.map((g) => g.eventId)).toEqual(['I_J', 'G_H', 'E_F', 'C_D', 'A_B']);
  });
  it('empty sections are omitted and the live order uses the memory it is given', () => {
    expect(buildSchedule([], none).sections).toEqual([]);
    const l = [live('NBA', 'A', 'B', 50, 50, 'Q2 5:00'), live('NBA', 'C', 'D', 50, 51, 'Q2 5:00')];
    const first = buildSchedule(l, none);
    const swapped = [live('NBA', 'A', 'B', 50, 51, 'Q2 5:00'), live('NBA', 'C', 'D', 50, 50, 'Q2 5:00')];
    expect(buildSchedule(swapped, none, first.memory).sections[0].games.map((g) => g.eventId)).toEqual(['A_B', 'C_D']);
  });
  it('the jump row offers Live, Upcoming and Final with counts, only for what exists', () => {
    const { sections } = buildSchedule([live('NBA', 'A', 'B', 1, 1, 'Q1 1:00'), game('NBA', 'C', 'D'), game('NBA', 'E', 'F', { startMs: zonedMs(DAY, 20, 0) }), game('NBA', 'G', 'H', { phase: 'final' })], none);
    expect(jumpTargets(sections).map((j) => [j.label, j.count])).toEqual([['Live', 1], ['Upcoming', 2], ['Final', 1]]);
    expect(jumpTargets(buildSchedule([game('NBA', 'C', 'D')], none).sections).map((j) => j.label)).toEqual(['Upcoming']);
  });
  it('kickoff windows are the viewer\'s local day', () => {
    const g = game('NBA', 'A', 'B', { startMs: zonedMs(DAY, 19, 30) });
    expect(dayKey(g.startMs)).toBe(DAY);
  });
});

describe('college conference filters', () => {
  const sec = (a: string, h: string, o: Over = {}) => game('CFB', a, h, { away: { conference: 'SEC' }, home: { conference: 'SEC' }, ...o });
  const slate = [sec('A', 'B'), game('CFB', 'C', 'D', { away: { conference: 'Big Ten' }, home: { conference: 'Big Ten' } }), game('CFB', 'E', 'F', { away: { conference: 'ACC', rank: 7 }, home: { conference: 'SEC' } }), game('CFB', 'G', 'H')];
  it('lists the conferences present, big conferences first, then the rest alphabetically', () => {
    expect(conferencesIn(slate)).toEqual(['SEC', 'Big Ten', 'ACC']);
    expect(conferencesIn([game('CFB', 'A', 'B', { away: { conference: 'Southland' }, home: { conference: 'Big Sky' } }), sec('C', 'D')])).toEqual(['SEC', 'Big Sky', 'Southland']);
  });
  it('a conference matches when either team is in it; Top 25 needs a stated rank; teams with no conference only match All', () => {
    expect(slate.filter((g) => matchesConference(g, 'sec')).map((g) => g.eventId)).toEqual(['A_B', 'E_F']);
    expect(slate.filter((g) => matchesConference(g, 'big-ten')).map((g) => g.eventId)).toEqual(['C_D']);
    expect(slate.filter((g) => matchesConference(g, 'top25')).map((g) => g.eventId)).toEqual(['E_F']);
    expect(slate.filter((g) => matchesConference(g, 'all'))).toHaveLength(4);
    expect(matchesConference(slate[3], 'sec')).toBe(false);
  });
  it('rank 26 or higher is not top 25', () => {
    expect(matchesConference(game('CFB', 'A', 'B', { home: { rank: 26 } }), 'top25')).toBe(false);
    expect(matchesConference(game('CFB', 'A', 'B', { home: { rank: 25 } }), 'top25')).toBe(true);
  });
  it('a filter the day cannot show falls back to All (an old link, a stored choice)', () => {
    expect(resolveFilter('sec', slate)).toBe('sec');
    expect(resolveFilter('pac-12', slate)).toBe('all');
    expect(resolveFilter('top25', slate)).toBe('top25');
    expect(resolveFilter('top25', [slate[0]])).toBe('all');
    expect(resolveFilter(null, slate)).toBe('all');
    expect(resolveFilter('bogus', slate)).toBe('all');
  });
  it('labels: the publication\'s keys read as fans write them; one name across football and basketball', () => {
    expect(cfbConferenceLabel('BIG-TEN')).toBe('Big Ten');
    expect(cfbConferenceLabel('MID-AMERICAN')).toBe('MAC');
    expect(cfbConferenceLabel('PAC-12')).toBe('Pac-12');
    expect(cfbConferenceLabel('SOME-NEW-LEAGUE')).toBe('Some New League');
    expect(unifyLabel('American')).toBe('AAC');
    expect(confToken('Big Ten')).toBe('big-ten');
    expect(confToken('Pac-12')).toBe('pac-12');
  });
});
