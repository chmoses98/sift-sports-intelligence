// Soccer league names and the league filter. The publication names each fixture's league twice: a code ("eng.premier_league") and a
// competition string ("Premier League"). Every surface shows ONE name per league, from the table below where the code is known and from the
// publication's own competition string otherwise (a league never gets an invented name; an unnamed code is humanised from the code itself).
// Nothing here fetches.
import type { V3Game } from './types';

type Fixture = Partial<Pick<V3Game, 'league' | 'item'>>;

/** The league names SIFT shows, by publication code. Short enough for a card chip; the competition string stays the fallback for any other code. */
const NAMES: Record<string, string> = {
  'eng.premier_league': 'Premier League',
  'usa.mls': 'MLS',
  'ger.bundesliga': 'Bundesliga',
  'ita.serie_a': 'Serie A',
  'fra.ligue_1': 'Ligue 1',
  'mex.liga_mx': 'Liga MX',
  'arg.primera': 'Liga Profesional (ARG)',
  'bra.serie_a': 'Brasileirão Série A',
};

const humanise = (code: string) => code.split('.').slice(-1)[0].split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export interface SoccerLeague { code: string; name: string }

/** The league a soccer game belongs to: its published code (the filter token) and the one name it is shown under. */
export function soccerLeagueOf(g: Fixture): SoccerLeague {
  const code = (g.item?.league ?? '').trim();
  const comp = (g.item?.competition ?? g.league ?? '').trim();
  if (code) return { code, name: NAMES[code] ?? (comp && comp !== code ? comp : humanise(code)) };
  return { code: comp.toLowerCase() || 'other', name: comp || 'Soccer' };
}

export const soccerLeagueName = (g: Fixture): string => soccerLeagueOf(g).name;

/** The leagues present in these games: the biggest first, then by name. */
export function soccerLeaguesIn(games: readonly V3Game[]): (SoccerLeague & { count: number })[] {
  const by = new Map<string, SoccerLeague & { count: number }>();
  for (const g of games) { const l = soccerLeagueOf(g); const cur = by.get(l.code); if (cur) cur.count++; else by.set(l.code, { ...l, count: 1 }); }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The filter an address or a stored preference asks for, reduced to a league these games have (anything else is "all"). */
export const resolveSoccerLeague = (asked: string | null | undefined, games: readonly V3Game[]): string =>
  asked && asked !== 'all' && soccerLeaguesIn(games).some((l) => l.code === asked) ? asked : 'all';

export const matchesSoccerLeague = (g: Fixture, filter: string): boolean => filter === 'all' || soccerLeagueOf(g).code === filter;
