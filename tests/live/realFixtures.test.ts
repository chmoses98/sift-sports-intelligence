import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEspnScoreboard, espnDay, espnSoccerPath } from '../../src/live/scores/providers/espn';
import { parseSportscore, sportscorePhase } from '../../src/live/scores/providers/sportscore';
import { TeamDirectory, canonicalizeGame, matchGameToEvent } from '../../src/live/scores/identity';
import { scoreView } from '../../src/live/scores/freshness';
import { observedFromGames } from '../../src/v4/scoreState';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'live-scores', 'real', n), 'utf8'));
const AT = '2026-10-22T15:00:00.000Z';

// These are excerpts of REAL responses recorded 2026-10-22 (see tests/fixtures/live-scores/real/README.md).
describe('ESPN real scoreboard excerpts', () => {
  it('NFL: Thursday night NE at CHI is scheduled, has no score, and its start and teams are read as published', () => {
    const [g] = parseEspnScoreboard('NFL', fx('espn-nfl.json'), AT);
    expect(g).toMatchObject({ phase: 'SCHEDULED', score: null, clock: null, startUtc: '2026-10-23T00:15:00.000Z', provenance: { provider: 'espn', providerGameId: '401873010' } });
    expect(g.home.abbr).toBe('CHI'); expect(g.away.abbr).toBe('NE');
  });

  it('NBA, NHL and CFB parse to scheduled games with null scores and real abbreviations', () => {
    const nba = parseEspnScoreboard('NBA', fx('espn-nba.json'), AT);
    expect(nba.map((g) => `${g.away.abbr}@${g.home.abbr}`)).toEqual(['CLE@PHI', 'DEN@OKC']);
    expect(nba.every((g) => g.phase === 'SCHEDULED' && g.score === null)).toBe(true);
    const nhl = parseEspnScoreboard('NHL', fx('espn-nhl.json'), AT);
    expect(nhl.map((g) => `${g.away.abbr}@${g.home.abbr}`)).toEqual(['NSH@BOS', 'NYR@TOR']);
    const cfb = parseEspnScoreboard('CFB', fx('espn-cfb.json'), AT);
    expect(cfb.map((g) => `${g.away.abbr}@${g.home.abbr}`)).toEqual(['JMU@APP', 'LIB@KENN']);
  });

  it('a scheduled game is never shown as having a score or a clock, whatever ESPN prints ("0", "0:00")', () => {
    for (const [sport, f] of [['NFL', 'espn-nfl.json'], ['NBA', 'espn-nba.json'], ['NHL', 'espn-nhl.json']] as const) {
      for (const g of parseEspnScoreboard(sport, fx(f), AT)) expect(scoreView(g, Date.parse(AT)).mode).toBe('UNAVAILABLE');
    }
  });

  it('matches the published board games by abbreviation, orientation and start, and refuses a different pairing', () => {
    const [g] = parseEspnScoreboard('NFL', fx('espn-nfl.json'), AT);
    const board = [
      { eventId: 'evt_ne_chi', startUtc: '2026-10-23T00:15:00Z', home: { display_name: 'Chicago Bears', short_name: 'CHI' }, away: { display_name: 'New England Patriots', short_name: 'NE' } },
      { eventId: 'evt_other', startUtc: '2026-10-23T00:15:00Z', home: { display_name: 'Buffalo Bills', short_name: 'BUF' }, away: { display_name: 'Miami Dolphins', short_name: 'MIA' } },
    ];
    const evs = observedFromGames('NFL', board);
    const dir = new TeamDirectory('NFL', evs.flatMap((e) => [e.home, e.away]));
    const game = canonicalizeGame(g, dir);
    expect(matchGameToEvent(game, evs[0].ref)).toMatchObject({ ok: true, match: { method: 'TEAMS_AND_START', swapped: false } });
    expect(matchGameToEvent(game, evs[1].ref)).toMatchObject({ ok: false });
  });

  it('files games under the US-Eastern day ESPN uses, and maps only known soccer competitions', () => {
    expect(espnDay(Date.parse('2026-10-23T00:15:00Z'))).toBe('20261022'); // 8:15 PM EDT Thursday
    expect(espnDay(Date.parse('2026-10-22T23:00:00Z'))).toBe('20261022');
    expect(espnSoccerPath('usa.mls')).toBe('soccer/usa.1');
    expect(espnSoccerPath('eng.1')).toBe('soccer/eng.1');
    expect(espnSoccerPath('uefa.champions')).toBe('soccer/uefa.champions');
    expect(espnSoccerPath('something.else')).toBeNull();
  });
});

describe('SportScore real NBA results', () => {
  it('parses finished NBA games with scores, start and the feed time, and drops other basketball competitions', () => {
    const body = fx('sportscore-basketball.json');
    const games = parseSportscore('NBA', body, AT);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ phase: 'FINAL', score: { home: 123, away: 103 }, startUtc: '2026-10-22T00:00:00.000Z', league: 'National Basketball Association' });
    expect(games[0].home.name).toBe('Memphis Grizzlies'); expect(games[0].away.name).toBe('Utah Jazz');
    expect(games[0].provenance).toMatchObject({ provider: 'sportscore', attribution: 'Powered by SportScore' });
    expect(games[0].provenance.providerUpdatedAt).toBe('2026-10-22T14:42:25.516227+00:00'); // the feed's own time, not the fetch time
    const euro = { ...body, matches: [{ ...body.matches[0], competition: 'EuroLeague' }] };
    expect(parseSportscore('NBA', euro, AT)).toHaveLength(0);
  });

  it('finals show as final with no age, and the same game matches the published board by team names and start', () => {
    const [g] = parseSportscore('NBA', fx('sportscore-basketball.json'), AT);
    expect(scoreView(g, Date.parse(AT) + 3 * 3600_000).mode).toBe('FINAL');
    const board = [{ eventId: 'evt_mem_uta', startUtc: '2026-10-22T00:00:00Z', home: { display_name: 'Memphis Grizzlies', short_name: 'MEM' }, away: { display_name: 'Utah Jazz', short_name: 'UTA' } }];
    const [ev] = observedFromGames('NBA', board);
    const dir = new TeamDirectory('NBA', [ev.home, ev.away]);
    expect(matchGameToEvent(canonicalizeGame(g, dir), ev.ref)).toMatchObject({ ok: true });
  });

  it('reads status words defensively: an unknown word is UNKNOWN, never live', () => {
    expect(sportscorePhase('finished')).toBe('FINAL');
    expect(sportscorePhase('live')).toBe('LIVE');
    expect(sportscorePhase('notstarted')).toBe('SCHEDULED');
    expect(sportscorePhase('half time')).toBe('BREAK');
    expect(sportscorePhase('weird-new-status')).toBe('UNKNOWN');
    expect(sportscorePhase(undefined)).toBe('UNKNOWN');
  });
});
