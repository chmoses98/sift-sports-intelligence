// The model's spread, derived only from the model's own two projected scores (never invented, never rounded into a price):
// the projected margin of the team ahead, to the half point as sportsbooks and Kalshi spread contracts are written. No projection, no spread.

export interface ModelSpread {
  /** The projected leader's abbreviation, or null when the projected scores are level to the half point. */
  leader: string | null;
  /** Points by which the leader is projected to win, rounded to the nearest half point (0 when level). */
  margin: number;
  /** "DAL −4.5", or "Pick'em" when level. */
  label: string;
}

export function modelSpread(awayScore: number | null | undefined, homeScore: number | null | undefined, awayAbbr: string, homeAbbr: string): ModelSpread | null {
  if (awayScore == null || homeScore == null || !Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;
  const diff = homeScore - awayScore;
  const margin = Math.round(Math.abs(diff) * 2) / 2;
  if (margin === 0) return { leader: null, margin: 0, label: "Pick'em" };
  const leader = diff > 0 ? homeAbbr : awayAbbr;
  return { leader, margin, label: `${leader} −${margin.toFixed(1)}` };
}
