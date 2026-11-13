/**
 * Canonical spread-display boundary shared by every sport.
 *
 * The underlying data stays in its native convention:
 * - model/result margin = home score MINUS away score (positive = home wins)
 * - sportsbook home handicap = the points ADDED to the home score
 *   (negative = home favourite; positive = home underdog)
 *
 * Both are rendered as "FAV -N": the named team is projected to WIN
 * by N before a game, or DID WIN by N when reviewing a final.
 * Never present a raw signed model margin as a sportsbook spread.
 */
export interface TeamSpreadNotation {
  /** The winner / projected winner, not necessarily the home team. */
  team: string | null;
  /** Absolute winning margin, always nonnegative. */
  points: number;
  /** Example: "PHI -6.5", "PHI -3", or "Pick'em". */
  label: string;
}

export interface SpreadDisplayOptions {
  /** Optional snap for a displayed model/market handicap (usually 0.5). */
  roundTo?: number;
  /** Decimal places when rendering; trailing zeros are never shown. */
  decimals?: number;
}

const shown = (n: number, decimals: number) => n.toFixed(decimals).replace(/\\.?0+$/, '');
function display(team: string | null, points: number, decimals: number): TeamSpreadNotation {
  return { team, points, label: team ? `${team} -${shown(points, decimals)}` : "Pick'em" };
}
function validNames(home: string, away: string): boolean {
  return home.trim().length > 0 && away.trim().length > 0 && home !== away;
}
function magnitude(value: number, roundTo?: number): number {
  return roundTo ? Math.round(Math.abs(value) / roundTo) * roundTo : Math.abs(value);
}

/**
 * Convert a model/result margin that is HOME minus AWAY into ordinary
 * sportsbook-style notation (positive home margin => HOME -N).
 */
export function spreadFromHomeMargin(
  homeMargin: number | null | undefined,
  home: string,
  away: string,
  options: SpreadDisplayOptions = {},
): TeamSpreadNotation | null {
  if (homeMargin == null || !Number.isFinite(homeMargin) || !validNames(home, away)) return null;
  const decimals = options.decimals ?? 1;
  const points = magnitude(homeMargin, options.roundTo);
  if (Number(points.toFixed(decimals)) === 0) return display(null, 0, decimals);
  return display(homeMargin > 0 ? home : away, points, decimals);
}

/** Use the actual two score fields, not a mislabeled free-form spread. */
export function spreadFromScores(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  home: string,
  away: string,
  options: SpreadDisplayOptions = {},
): TeamSpreadNotation | null {
  if (homeScore == null || awayScore == null || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  return spreadFromHomeMargin(homeScore - awayScore, home, away, options);
}

/** Final result: "PHI -3" means Philadelphia actually won by three. */
export function spreadFromFinalScores(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  home: string,
  away: string,
): TeamSpreadNotation | null {
  return spreadFromScores(homeScore, awayScore, home, away, { decimals: 0 });
}

/**
 * Convert a sportsbook HOME handicap (opposite sign to home winning margin).
 * Example: -6.5 with PHI at home => PHI -6.5; +6.5 => opponent -6.5.
 * DO NOT pass home-minus-away model margins to this function.
 */
export function spreadFromHomeHandicap(
  homeHandicap: number | null | undefined,
  home: string,
  away: string,
  options: SpreadDisplayOptions = {},
): TeamSpreadNotation | null {
  return homeHandicap == null ? null : spreadFromHomeMargin(-homeHandicap, home, away, options);
}
