// Rank first, number second. A league rank (with its direction stated) is what a reader can interpret;
// the raw value is shown beside it, quieter. Ranks come from the publication's observation context
// (rank 1 = best for the metric's own direction: for "allowed" metrics #1 allows the least).
import type { ObservationContext } from '../contract/types';

export type Tier = 'elite' | 'strong' | 'average' | 'weak' | 'poor';

export interface RankView {
  rank: number;
  of: number;
  /** "#3 NFL" / "#3 of 32". */
  text: string;
  /** Plain tier words that never rely on color: "Top 3", "Top 10", "Middle", "Bottom 10", "Bottom 3". */
  tierWord: string;
  tier: Tier;
  /** 1 = best in the league, 0 = worst. */
  strength: number;
  /** False for descriptive metrics (pass rate over expected, pace) where #1 is "most", not "best". */
  directional: boolean;
}

export function tierOf(rank: number, of: number): Tier {
  if (rank <= Math.max(1, Math.round(of * 0.1))) return 'elite';
  if (rank <= Math.round(of * 0.3)) return 'strong';
  if (rank > of - Math.max(1, Math.round(of * 0.1))) return 'poor';
  if (rank > of - Math.round(of * 0.3)) return 'weak';
  return 'average';
}

export function tierWord(rank: number, of: number): string {
  const t = tierOf(rank, of);
  const k = Math.max(1, Math.round(of * 0.1));
  const k3 = Math.round(of * 0.3);
  if (t === 'elite') return `Top ${k}`;
  if (t === 'strong') return `Top ${k3}`;
  if (t === 'poor') return `Bottom ${k}`;
  if (t === 'weak') return `Bottom ${k3}`;
  return 'Middle of the pack';
}

/** A rank's presentation, or null when the publication gives none. */
export function rankView(ctx: Pick<ObservationContext, 'rank' | 'universe_size' | 'higher_is_better'> | null | undefined, league = 'NFL'): RankView | null {
  if (!ctx || ctx.rank == null || !ctx.universe_size) return null;
  const { rank, universe_size: of } = ctx;
  const directional = ctx.higher_is_better !== null && ctx.higher_is_better !== undefined;
  return {
    rank, of,
    text: `#${rank} ${league}`,
    tierWord: directional ? tierWord(rank, of) : extremeWord(rank, of),
    tier: directional ? tierOf(rank, of) : 'average',
    strength: of > 1 ? (of - rank) / (of - 1) : 1,
    directional,
  };
}

/** Descriptive ranks: "Highest", "3rd-highest", "2nd-lowest". */
export function extremeWord(rank: number, of: number): string {
  const hi = rank <= of / 2;
  const k = hi ? rank : of - rank + 1;
  return k === 1 ? (hi ? 'Highest' : 'Lowest') : `${ordinalWord(k)}-${hi ? 'highest' : 'lowest'}`;
}

export function ordinalWord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Simple counting stats stay number-first: a reader already knows what 94 rushing yards means. */
export const NUMBER_FIRST_UNITS = new Set(['yards', 'points', 'touchdowns', 'attempts', 'carries', 'receptions', 'completions', 'targets']);

export function isNumberFirst(unit: string | null | undefined): boolean {
  return unit != null && NUMBER_FIRST_UNITS.has(unit);
}

/** Word for what #1 means on a metric: "#1 = best", "#1 = allows the least". */
export function rankMeaning(name: string, higherIsBetter: boolean | null | undefined): string {
  if (higherIsBetter == null) return '#1 = highest';
  if (/allow|against|allowed/i.test(name)) return higherIsBetter ? '#1 = best' : '#1 = allows the least';
  if (/turnover|sack rate allowed|interception/i.test(name) && !higherIsBetter) return '#1 = fewest';
  return '#1 = best';
}
