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
  /** Example: "PHI -6.5", "PHI -3", or "Pick’em". */
  label: string;
}

export interface SpreadDisplayOptions {
  /** Optional snap for a displayed model/market handicap (usually 0.5). */
  roundTo?: number;
  /** Decimal places when rendering; trailing zeros are never shown. */
  decimals?: number;
}

/** U+2212 MINUS SIGN: the glyph every SIFT spread uses (screen readers say "minus"; never a hyphen or en dash). */
export const MINUS = '\u2212';
/** The one tie/zero-margin label used everywhere. */
export const PICKEM = 'Pick’em';
const shown = (n: number, decimals: number) => Number(n.toFixed(decimals)).toString();
function display(team: string | null, points: number, decimals: number): TeamSpreadNotation {
  return { team, points, label: team ? `${team} ${MINUS}${shown(points, decimals)}` : PICKEM };
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

/**
 * A team-specific contract/handicap line that is already named for its team, e.g. a Kalshi
 * "PHI wins by more than 6.5" contract => "PHI -6.5". The sign is the favourite-side convention;
 * pass the absolute strike. Returns null for a missing/invalid line rather than inventing one.
 */
export function teamFavouriteLine(team: string | null | undefined, points: number | null | undefined, options: SpreadDisplayOptions = {}): string | null {
  if (!team || !team.trim() || points == null || !Number.isFinite(points)) return null;
  const decimals = options.decimals ?? 1;
  const p = magnitude(points, options.roundTo);
  return Number(p.toFixed(decimals)) === 0 ? PICKEM : `${team} ${MINUS}${shown(p, decimals)}`;
}

/**
 * Evaluation helper: a sportsbook HOME handicap expressed in home-minus-away margin units
 * (HOME -6.5 => +6.5 expected home margin). Use when comparing a market line with a model
 * margin or a final margin; never feed the result back into spreadFromHomeHandicap.
 */
export function homeMarginFromHomeHandicap(homeHandicap: number | null | undefined): number | null {
  return homeHandicap == null || !Number.isFinite(homeHandicap) ? null : -homeHandicap;
}
