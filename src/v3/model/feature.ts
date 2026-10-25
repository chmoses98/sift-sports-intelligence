import type { Follows } from '../state/prefs';
import type { V3Game } from '../model/types';

const PREF = ['NFL', 'CFB', 'NBA', 'NHL', 'MLB', 'CBB', 'SOCCER', 'TENNIS'];
const pref = (g: V3Game) => { const i = PREF.indexOf(g.sport); return i < 0 ? 99 : i; };

export const followsTeamOf = (g: V3Game, f: Pick<Follows, 'teams' | 'games'>) =>
  f.games.includes(g.key) || f.teams.includes(`${g.slug}:${g.away.id}`) || f.teams.includes(`${g.slug}:${g.home.id}`);

/** Today's local calendar day for a clock reading. */
const dayKey = (ms: number) => { const d = new Date(ms); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };

/**
 * The one game Home features: a followed game in play, then the live game with the most published research, then a followed game
 * still to come today, then today's next game (the sport order is the product's), then the most recent final. Pure and stable so the
 * featured game does not change under a finger while the slate refreshes.
 */
export function pickFeatured(games: V3Game[], f: Pick<Follows, 'teams' | 'games'>, now: number): V3Game | null {
  const playable = games.filter((g) => g.away && g.home);
  if (!playable.length) return null;
  const by = (list: V3Game[], cmp: (a: V3Game, b: V3Game) => number) => [...list].sort((a, b) => cmp(a, b) || a.key.localeCompare(b.key))[0] ?? null;
  const live = playable.filter((g) => g.phase === 'live');
  const fl = live.filter((g) => followsTeamOf(g, f));
  if (fl.length) return by(fl, (a, b) => b.signals - a.signals);
  if (live.length) return by(live, (a, b) => b.signals - a.signals || pref(a) - pref(b));
  const today = dayKey(now);
  const soon = playable.filter((g) => g.phase === 'pregame' && g.startMs > now - 3600_000);
  const fs = soon.filter((g) => followsTeamOf(g, f));
  if (fs.length) return by(fs, (a, b) => a.startMs - b.startMs);
  const todayGames = soon.filter((g) => dayKey(g.startMs) === today);
  if (todayGames.length) return by(todayGames, (a, b) => b.signals - a.signals || pref(a) - pref(b) || a.startMs - b.startMs);
  if (soon.length) return by(soon, (a, b) => a.startMs - b.startMs || pref(a) - pref(b));
  return by(playable.filter((g) => g.phase === 'final'), (a, b) => b.startMs - a.startMs) ?? playable[0];
}

/** The quick-glance strip: followed first, then live, then upcoming by start, then finals; never the featured game. */
export function stripGames(games: V3Game[], f: Pick<Follows, 'teams' | 'games'>, featured: V3Game | null, limit = 10): V3Game[] {
  const rank = (g: V3Game) => (followsTeamOf(g, f) ? 0 : 4) + (g.phase === 'live' ? 0 : g.phase === 'pregame' ? 1 : g.phase === 'other' ? 2 : 3);
  return games.filter((g) => g.key !== featured?.key && g.phase !== 'other').sort((a, b) => rank(a) - rank(b) || a.startMs - b.startMs).slice(0, limit);
}
