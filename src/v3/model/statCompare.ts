// Compact team-statistics comparison for a game: each published statistic becomes one row of two mirrored rank bars (longer = better league rank),
// ordered by the size of the rank gap the publication states. Nothing is computed beyond the bar length, which is the published rank over the
// published universe; a row without both ranks still lists its values and has no bar.
import type { StatPair } from '../data/matchup';

export interface CompareRow {
  id: string;
  name: string;
  route?: string;
  away: { value: string; rank: number | null; n: number | null; pct: number | null };
  home: { value: string; rank: number | null; n: number | null; pct: number | null };
  /** The side with the clearly better rank (the gap is more than a tenth of the league), else null. */
  edge: 'away' | 'home' | null;
}

/** Rank 1 is a full bar; the last rank is the shortest. Null without a rank and a universe. */
export const rankPct = (rank: number | null, n: number | null): number | null => (rank != null && n != null && n > 1 && rank >= 1 && rank <= n ? Math.round(((n - rank) / (n - 1)) * 100) : null);

/** The plain statistic name: the publication's "Adjusted offensive EPA per dropback" stays as published; only the leading unit word is used to group. */
export type StatGroup = 'offense' | 'defense' | 'other';
export const groupOf = (name: string): StatGroup => (/defens|allowed|against/i.test(name) ? 'defense' : /offens|scor|pass|rush|explosive|turnover/i.test(name) ? 'offense' : 'other');

export function compareRows(pairs: readonly StatPair[]): CompareRow[] {
  return pairs.map((p) => {
    const a = { ...p.away, pct: rankPct(p.away.rank, p.away.n) };
    const h = { ...p.home, pct: rankPct(p.home.rank, p.home.n) };
    const edge = a.pct != null && h.pct != null && Math.abs(a.pct - h.pct) > 10 ? (a.pct > h.pct ? 'away' : 'home') : null;
    return { id: p.id, name: p.name, route: p.route, away: a, home: h, edge };
  });
}
