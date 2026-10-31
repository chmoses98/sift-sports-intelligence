import type { V3Game } from '../model/types';
import type { Follows } from '../state/prefs';
import { followsGame as followsTeamOf } from './priority';
import { dayKey } from './time';

const phaseRank = (g: V3Game) => (g.phase === 'live' ? 0 : g.phase === 'pregame' ? 1 : g.phase === 'other' ? 2 : 3);

/** A favourite game: starred itself, or involving a followed team. Favourites are pinned first and never change the selected game. */
export const isFavorite = (g: V3Game, f: Pick<Follows, 'teams' | 'games'>) => followsTeamOf(g, f);

/**
 * The games a switcher offers for the current one: same sport, same local day (the Saturday card), favourites first, then in play,
 * then by kickoff, then finals. The current game is always present. Falls back to the whole sport when the day has only itself.
 */
export function switcherGames(all: V3Game[], current: V3Game, f: Pick<Follows, 'teams' | 'games'>): V3Game[] {
  let list = all.filter((g) => g.slug === current.slug && dayKey(g.startMs) === dayKey(current.startMs));
  if (list.length < 2) list = all.filter((g) => g.slug === current.slug);
  if (!list.some((g) => g.key === current.key)) list = [current, ...list];
  return [...list].sort((a, b) => Number(isFavorite(b, f)) - Number(isFavorite(a, f)) || phaseRank(a) - phaseRank(b) || a.startMs - b.startMs || a.key.localeCompare(b.key));
}
