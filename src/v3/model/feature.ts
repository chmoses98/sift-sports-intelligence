import type { Follows } from '../state/prefs';
import type { V3Game } from '../model/types';

const PREF = ['NFL', 'CFB', 'NBA', 'NHL', 'MLB', 'CBB', 'SOCCER', 'TENNIS'];
const pref = (g: V3Game) => { const i = PREF.indexOf(g.sport); return i < 0 ? 99 : i; };

export const followsTeamOf = (g: V3Game, f: Pick<Follows, 'teams' | 'games'>) =>
  f.games.includes(g.key) || f.teams.includes(`${g.slug}:${g.away.id}`) || f.teams.includes(`${g.slug}:${g.home.id}`);


const hasIdentity = (g: V3Game) => !!(g.away.logo && g.home.logo);
const scored = (g: V3Game) => g.score != null;

/** Lower is better. A game in play with no score is a placeholder, so a scored game or a coming kickoff outranks it. */
function tier(g: V3Game, f: Pick<Follows, 'teams' | 'games'>, now: number): number {
  const fol = followsTeamOf(g, f);
  const soon = g.phase === 'pregame' && g.startMs > now - 3600_000;
  let t: number;
  if (g.phase === 'live' && scored(g)) t = fol ? 0 : 1;
  else if (fol && (soon || g.phase === 'live')) t = 2;
  else if (soon && g.startMs - now < 24 * 3600_000) t = 3;
  else if (g.phase === 'live') t = 4;
  else if (soon) t = 5;
  else if (g.phase === 'final') t = 6;
  else t = 7;
  return t + (hasIdentity(g) ? 0 : 10);
}

/**
 * The one game Home features: a followed game in play with a score, any game in play with a score, a followed game still to come,
 * today's next game (the sport order is the product's), a game in play without a score, a later game, then the latest final.
 * Pure and stable so the featured game does not change under a finger while the slate refreshes.
 */
export function pickFeatured(games: V3Game[], f: Pick<Follows, 'teams' | 'games'>, now: number): V3Game | null {
  // The first game under the ordering below, found in one pass with each game's tier computed once (the ordering is total: the key breaks every tie).
  let top: V3Game | null = null;
  let topTier = 0;
  const before = (a: V3Game, ta: number, b: V3Game, tb: number) => (ta - tb || pref(a) - pref(b) || b.signals - a.signals
    || (a.phase === 'final' ? b.startMs - a.startMs : a.startMs - b.startMs) || a.key.localeCompare(b.key)) < 0;
  for (const g of games) {
    if (!g.away || !g.home) continue;
    const t = tier(g, f, now);
    if (!top || before(g, t, top, topTier)) { top = g; topTier = t; }
  }
  return top;
}

/** The quick-glance strip: followed first, then live, then upcoming by start, then finals; never the featured game. */
export function stripGames(games: V3Game[], f: Pick<Follows, 'teams' | 'games'>, featured: V3Game | null, limit = 10): V3Game[] {
  const rank = (g: V3Game) => (followsTeamOf(g, f) ? 0 : 8) + (hasIdentity(g) ? 0 : 20) + (g.phase === 'live' ? (scored(g) ? 0 : 2) : g.phase === 'pregame' ? 1 : 3);
  const ranked = games.filter((g) => g.key !== featured?.key && g.phase !== 'other').map((g) => ({ g, r: rank(g) }));
  return ranked.sort((a, b) => a.r - b.r || a.g.startMs - b.g.startMs).slice(0, limit).map((x) => x.g);
}
