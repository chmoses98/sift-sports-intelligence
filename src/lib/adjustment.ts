// Raw vs opponent-adjusted: what changed, and which way, for one team and one metric.
//
// The publication's raw metrics are absolute (EPA/play, a success-rate share) while the adjusted twins are
// deviations from the league mean. So the comparable change is measured on the same footing:
//     raw vs average      = raw value − raw league average   (from the raw observation's own context)
//     adjusted vs average = adjusted value                   (already a deviation from the league mean)
//     delta               = adjusted vs average − raw vs average
// Rank movement compares the two published ranks. Direction respects higher_is_better: for a metric where
// LOWER is better (most defensive ratings), a numerical increase is a WORSE rating, never "better".
// Nothing is computed when a side is missing.

export interface AdjSide {
  value: number | null;
  rank: number | null;
  size: number | null;
  /** The raw observation's league average (needed to put the raw value on the adjusted scale). */
  leagueAverage?: number | null;
}

export type AdjDirection = 'better' | 'worse' | 'same';

export interface AdjustmentComparison {
  rawVsAvg: number | null;
  adjVsAvg: number | null;
  /** Adjusted minus raw, both relative to league average; null when either side is missing. */
  delta: number | null;
  /** Positive = moved UP the ranking (a smaller rank number) after adjustment; null without both ranks. */
  rankMove: number | null;
  direction: AdjDirection | null;
  /** Adjustment moves the team toward the middle of the ranking. */
  towardAverage: boolean;
  interpretation: string | null;
}

/** A change of at most this many places, or under this share of the raw gap from average, reads as unchanged. */
export const SAME_RANKS = 1;
export const SAME_SHARE = 0.1;

export function compareAdjustment(raw: AdjSide, adj: AdjSide, higherIsBetter: boolean | null, opts: { unit?: 'offense' | 'defense' | null; team?: string | null } = {}): AdjustmentComparison {
  const rawVsAvg = raw.value != null && raw.leagueAverage != null ? raw.value - raw.leagueAverage : null;
  const adjVsAvg = adj.value;
  const delta = rawVsAvg != null && adjVsAvg != null ? adjVsAvg - rawVsAvg : null;
  const rankMove = raw.rank != null && adj.rank != null ? raw.rank - adj.rank : null;

  // Direction from the value (on the same league-average footing), respecting higher_is_better…
  let valueDir: AdjDirection | null = null;
  if (delta != null && higherIsBetter != null) {
    const scale = Math.max(Math.abs(rawVsAvg ?? 0), Math.abs(adjVsAvg ?? 0), 1e-9);
    valueDir = Math.abs(delta) < SAME_SHARE * scale ? 'same' : (delta > 0) === higherIsBetter ? 'better' : 'worse';
  }
  // …and from the published ranks. Ranks lead (they already encode the better direction), but a rank move
  // with a negligible or contrary value change is a mixed signal and reads as "barely changes".
  const rankDir: AdjDirection | null = rankMove == null ? null : Math.abs(rankMove) <= SAME_RANKS ? 'same' : rankMove > 0 ? 'better' : 'worse';
  let direction: AdjDirection | null;
  if (rankDir === 'better' || rankDir === 'worse') direction = valueDir && valueDir !== rankDir ? 'same' : rankDir;
  else direction = valueDir ?? rankDir; // rank unchanged: the value says whether the rating itself moved

  const size = adj.size ?? raw.size;
  const mid = size != null ? (size + 1) / 2 : null;
  const towardAverage = mid != null && raw.rank != null && adj.rank != null ? Math.abs(adj.rank - mid) < Math.abs(raw.rank - mid) : false;

  return { rawVsAvg, adjVsAvg, delta, rankMove, direction, towardAverage, interpretation: interpret(direction, towardAverage, opts) };
}

function interpret(direction: AdjDirection | null, towardAverage: boolean, { unit, team }: { unit?: 'offense' | 'defense' | null; team?: string | null }): string | null {
  if (!direction) return null;
  const rating = unit === 'defense' ? 'defensive rating' : unit === 'offense' ? 'offensive rating' : 'rating';
  const who = team ?? 'this team';
  if (direction === 'same') return 'Opponent adjustment barely changes the rating.';
  if (direction === 'better') {
    return towardAverage
      ? `Accounting for the opponents faced improves the ${rating} and moves ${who} closer to league average.`
      : `Accounting for the opponents faced improves the ${rating}: the raw number undersold it.`;
  }
  return towardAverage
    ? `The raw number looked stronger. Accounting for the opponents faced moves ${who} closer to league average.`
    : `The raw result looks stronger than the adjusted ${rating}; the opponents faced explain part of it.`;
}

/** Which side of the ball a metric describes, from its id ("met_nfl.def_…", "met_nfl.adj_off_…"). */
export function unitOf(metricId: string): 'offense' | 'defense' | null {
  const s = metricId.replace(/^met_nfl\./, '').replace(/^adj_/, '');
  return s.startsWith('def_') ? 'defense' : s.startsWith('off_') ? 'offense' : null;
}
