import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leagueLabel } from '../../src/v3/ui/gamebits';
import { matchesSoccerLeague, resolveSoccerLeague, soccerLeagueName, soccerLeaguesIn } from '../../src/v3/model/soccerLeague';

// The real trimmed soccer publication and the live board of 2026-11-05 (eight leagues): one name per league, a filter by the published code.
const items = JSON.parse(readFileSync('tests/fixtures/soccer/app/latest/events.json', 'utf8')).items as { league: string; competition: string }[];
const game = (league: string, competition: string | null) => ({ sport: 'SOCCER', league: competition ?? league, item: { league, competition } }) as never;
const fixtures = items.map((e) => game(e.league, e.competition));

describe('soccer league names and filter', () => {
  it('shows the league’s own name on the card, never the bare word SOCCER', () => {
    for (const g of fixtures) expect(leagueLabel(g)).not.toMatch(/^SOCCER$/i);
    expect(leagueLabel(game('eng.premier_league', 'Premier League'))).toBe('Premier League');
    expect(leagueLabel(game('usa.mls', 'Major League Soccer'))).toBe('MLS');
    expect(leagueLabel(game('ita.serie_a', 'Serie A'))).toBe('Serie A');
    expect(leagueLabel(game('bra.serie_a', 'Brasileirão Série A'))).toBe('Brasileirão Série A');
  });

  it('keeps a bare sport word where no league is known, and other sports unchanged', () => {
    expect(leagueLabel({ sport: 'SOCCER' } as never)).toBe('SOCCER');
    expect(leagueLabel({ sport: 'NBA' } as never)).toBe('NBA');
    expect(leagueLabel({ sport: 'CBB' } as never)).toBe('NCAAB');
  });

  it('uses the publication’s competition string for a league SIFT has no short name for, then the code', () => {
    expect(soccerLeagueName(game('esp.1', 'La Liga'))).toBe('La Liga');
    expect(soccerLeagueName(game('xyz.some_league', null))).toBe('Some League');
  });

  it('lists each league once with its fixture count, biggest first, and filters by code', () => {
    const day = [...fixtures, game('eng.premier_league', 'Premier League'), game('eng.premier_league', 'Premier League')];
    const l = soccerLeaguesIn(day);
    expect(l.map((x) => x.name)).toEqual(['Premier League', 'Brasileirão Série A', 'Liga MX']);
    expect(l[0].count).toBe(3);
    expect(day.filter((g) => matchesSoccerLeague(g, 'eng.premier_league'))).toHaveLength(3);
    expect(day.filter((g) => matchesSoccerLeague(g, 'all'))).toHaveLength(day.length);
  });

  it('reduces an address or stored choice to a league the day has (anything else is All)', () => {
    expect(resolveSoccerLeague('mex.liga_mx', fixtures)).toBe('mex.liga_mx');
    expect(resolveSoccerLeague('ger.bundesliga', fixtures)).toBe('all');
    expect(resolveSoccerLeague(null, fixtures)).toBe('all');
    expect(resolveSoccerLeague('all', fixtures)).toBe('all');
  });
});
