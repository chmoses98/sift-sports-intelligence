// Which games belong to a team profile's season, and which are still to be played; the CBB identity (logo and colours by contract code);
// and the NBA player log's coverage. All over REAL published documents trimmed into tests/v3/fixtures (see each `_fixture` field).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityProfileDoc } from '../../src/contract/types';
import { completedGames } from '../../src/lib/gamedata';
import { heroTeam } from '../../src/lib/hero/input';
import { cbbColors, cbbLogo, cbbTeamByCode } from '../../src/lib/cbbTeams';
import { teamColors, teamLogo } from '../../src/lib/teams';
import { boxObs } from '../../src/v3/data/usePlayer';
import { readBoxLog } from '../../src/history/boxLog';
import { logGap, LOG_GAP_DAYS, LOG_GAP_DAYS_FOOTBALL } from '../../src/v3/model/playerResearch';
import { scheduledGames, seasonStartIso } from '../../src/v3/model/teamSeason';
import acu from './fixtures/cbb/team-ACU.json';
import dan from './fixtures/nba/player-DAN.json';

const ROOT = join(__dirname, '..', '..');
const doc = acu as unknown as EntityProfileDoc;

describe('seasonStartIso: a season label is not a date', () => {
  it('basketball and hockey labels start in July, football labels in June, anything else filters nothing', () => {
    expect(seasonStartIso('2026-27')).toBe('2026-07-01');
    expect(seasonStartIso('2025-26')).toBe('2025-07-01');
    expect(seasonStartIso('2026')).toBe('2026-06-01');
    expect(seasonStartIso(null)).toBe('');
    expect(seasonStartIso('spring')).toBe('');
  });
  it('keeps every game of the season the profile names (the old cut "2026-27-06-01" sorted above all of November 2026 and dropped them)', () => {
    const done = completedGames(doc);
    expect(done.length).toBeGreaterThan(0);
    expect(done.every((g) => g.date >= '2026-27-06-01')).toBe(false);          // the bug: the label used as a date removes this real game
    expect(done.every((g) => g.date >= seasonStartIso(doc.season))).toBe(true); // the fix keeps it
    for (const g of [{ date: '2025-10-22T00:00:00Z' }, { date: '2026-03-01T00:00:00Z' }]) expect(g.date >= seasonStartIso('2025-26')).toBe(true);
    expect('2025-06-15T00:00:00Z' >= seasonStartIso('2025-26')).toBe(false);    // last season's playoffs stay out
  });
});

describe('scheduledGames: the team’s own calendar', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const sched = scheduledGames(doc, now);
  it('lists the games without a result that start from now on, soonest first, each with its opponent and side', () => {
    expect(sched.length).toBe(27);
    expect(sched[0].startUtc >= '2026-11-05').toBe(true);
    expect(sched.map((g) => g.startUtc)).toEqual([...sched.map((g) => g.startUtc)].sort());
    expect(sched.every((g) => g.eventId && g.oppId && g.oppName)).toBe(true);
    expect(sched.some((g) => g.home) && sched.some((g) => !g.home)).toBe(true);
  });
  it('never lists a played game, and drops a game once its start has passed', () => {
    const played = (doc as unknown as { games: { event_id: string; result: unknown }[] }).games.find((g) => g.result)!;
    expect(sched.some((g) => g.eventId === played.event_id)).toBe(false);
    expect(scheduledGames(doc, Date.parse('2027-01-01T00:00:00Z')).every((g) => g.startUtc >= '2027-01-01')).toBe(true);
    expect(scheduledGames(null, now)).toEqual([]);
  });
});

describe('CBB identity by contract code', () => {
  const table = JSON.parse(readFileSync(join(ROOT, 'src/lib/cbb-teams.json'), 'utf8')).teams as Record<string, { a: string; e: number; l?: number; c?: string | null }>;
  it('resolves the committed logo file for every team that has one (the v3 cards showed an abbreviation tile for all of them)', () => {
    const rows = Object.values(table).filter((t) => t.l);
    expect(rows.length).toBeGreaterThan(300);
    for (const t of rows) {
      const url = teamLogo('CBB', t.a);
      expect(url, `${t.a} logo`).toMatch(/teams\/cbb\/\d+\.webp$/);
      expect(existsSync(join(ROOT, 'public', url!.replace(/^.*?(teams\/cbb\/)/, '$1'))), `${t.a} file ${url}`).toBe(true);
    }
  });
  it('an abbreviation names one school, and an unknown code has no logo and keeps the neutral colours', () => {
    const codes = Object.values(table).map((t) => t.a);
    expect(new Set(codes).size).toBe(codes.length);
    expect(teamLogo('CBB', 'NOT-A-TEAM')).toBeNull();
    expect(teamLogo('CBB', null)).toBeNull();
    expect(cbbTeamByCode('NOT-A-TEAM')).toBeNull();
    expect(teamColors('CBB', 'NOT-A-TEAM')).toEqual(['#1d2d52', '#3f5079']);
  });
  it('reads the school colours the table states, and the hero identity of a board team carries the logo', () => {
    const t = Object.values(table).find((x) => x.l && x.c)!;
    expect(cbbColors(t.a)![0]).toBe(t.c);
    expect(teamColors('CBB', t.a)[0]).toBe(t.c);
    const h = heroTeam('CBB', 'LIB', 'Liberty Flames');                          // codes from the live board, 5 Nov 2026
    expect(h?.logo).toBe(cbbLogo('LIB'));
    expect(h?.logo).toBeTruthy();
    expect(heroTeam('CBB', 'HPU', 'High Point Panthers')?.logo).toBeTruthy();
  });
  it('the other sports’ resolution is untouched', () => {
    expect(teamLogo('NBA', 'ATL')).toMatch(/teams\/nba\/ATL\.webp$/);
    expect(teamLogo('NFL', 'KC')).toMatch(/teams\/nfl\/KC\.webp$/);
  });
});

describe('the NBA player log says where it ends', () => {
  const rows = boxObs(readBoxLog((dan as unknown as { extensions: { game_log: unknown } }).extensions.game_log)!, [{ key: 'pts', label: 'Points', short: 'PTS' }]);
  it('decodes the real published log, newest game 30 April 2026 (2025-26)', () => {
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.at(-1)!.date).toBe('2026-04-30');
    expect(rows.at(-1)!.season).toBe('2025-26');
  });
  it('reports the gap for a log that stops months before today, with its last date and season', () => {
    const g = logGap(rows, Date.parse('2026-11-05T15:00:00Z'));
    expect(g).toEqual({ through: '2026-04-30', season: '2025-26', days: 189 });
  });
  it('is silent while the log reaches the recent past, at the boundary and in the offseason of a log with a current game', () => {
    expect(logGap(rows, Date.parse('2026-04-30T12:00:00Z') + LOG_GAP_DAYS * 86_400_000)).toBeNull();
    expect(logGap(rows, Date.parse('2026-04-30T12:00:00Z') + (LOG_GAP_DAYS + 1) * 86_400_000)).not.toBeNull();
    expect(logGap([...rows, { date: '2026-11-03', season: '2026-27' }], Date.parse('2026-11-05T15:00:00Z'))).toBeNull();
  });
  it('gives football its own, longer allowance (weekly games, byes, a history layer a game behind)', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(logGap([{ date: '2026-10-04', season: '2026' }], now)).not.toBeNull();
    expect(logGap([{ date: '2026-10-04', season: '2026' }], now, LOG_GAP_DAYS_FOOTBALL)).toBeNull();
  });
  it('says nothing about a log with no dated game', () => {
    expect(logGap([], Date.now())).toBeNull();
    expect(logGap([{ date: '', season: null }], Date.now())).toBeNull();
  });
});

describe('preseason games stay out of the player windows', () => {
  const st = [{ key: 'pts', label: 'Points', short: 'PTS' }];
  const row = (date: string, season_type: string | null, pts: number) => ({ date_et: date, event_id: `e${date}`, season: '2026-27', season_type, opp: 'BOS', home: true, played: true, min: 30, pts });
  it('drops preseason, keeps regular season, playoffs and rows with no type', () => {
    const o = boxObs([row('2026-10-10', 'preseason', 40), row('2026-10-22', 'regular', 20), row('2026-10-24', null, 18), row('2026-04-20', 'playoffs', 25)], st);
    expect(o.map((r) => r.v.pts).sort()).toEqual([18, 20, 25]);
  });
  it('a player with only preseason rows has no windows rather than exhibition ones', () => {
    expect(boxObs([row('2026-10-10', 'preseason', 40)], st)).toEqual([]);
  });
});
