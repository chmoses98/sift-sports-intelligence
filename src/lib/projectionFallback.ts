// THE ESTABLISHED-MODEL FALLBACK — what must be true before SIFT may show the established projection in place of a promoted
// one that is temporarily missing, stale, or not yet published for the game.
//
// The fallback is explicit (an approval on the stat's row in projectionApprovals.ts) and is checked on its OWN data:
//   * freshness     the established publication's own timestamp is inside the sport's limit;
//   * availability  the publication lists the player as available (no injury designation beyond ACTIVE / PROBABLE /
//                   AVAILABLE); for MLB pitchers the publisher must project him as a starter;
//   * quality       finite, non-negative mean; a coherent interval that contains it; and, for NFL props, a market line that
//                   sits inside the simulated 5th–95th range (otherwise the market and the simulation are pricing different
//                   roles: a structural disagreement).
// If any check fails there is no number at all. It is never used when the player is out, when the promoted feed shows a
// structural defect for him (gate BLOCK, not READY, incoherent, a first game with a new team), or when what is needed to
// rule that out is unavailable. It never appears beside the promoted number: exactly one is shown.
import { MAX_AGE_H, type ProjSport } from './projections';

/** What the established publication says about one player-stat: the same fields the page would read its own number from. */
export interface LegacyCandidate {
  mean: number | null;
  /** a wide interval the mean must sit inside (NFL: simulated 5th–95th; MLB: p10–p90) */
  interval?: { lo: number; hi: number } | null;
  /** when the established publication was generated */
  generatedAt: string | null;
  /** injury designation listed for the player; null = none listed */
  designation: string | null;
  /** MLB pitchers: the publisher projects him as a starter (a *_PROJECTION status, not "not starting") */
  starter?: boolean | null;
  /** the stat's main market line; checked against `interval` when `checkLine` is set */
  line?: number | null;
  checkLine?: boolean;
}

const AVAILABLE = new Set(['ACTIVE', 'PROBABLE', 'AVAILABLE']);

/** The reasons the established projection may not be used; empty = it passes every check. */
export function legacyFallbackProblems(sport: ProjSport, family: string, c: LegacyCandidate | null | undefined, nowMs: number): string[] {
  if (!c) return ['no established projection exists for this player and stat'];
  const out: string[] = [];
  // quality
  if (c.mean == null || !Number.isFinite(c.mean) || c.mean < 0) out.push('its projection is missing or not a valid number');
  else if (c.interval) {
    const { lo, hi } = c.interval;
    const slack = Math.max(1, 0.1 * Math.abs(hi));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) out.push('its range is inverted');
    else if (c.mean < lo - slack || c.mean > hi + slack) out.push('its projection sits outside its own range');
    else if (c.checkLine && c.line != null && (c.line < lo || c.line > hi)) out.push('the market line sits outside its range: the market and the simulation are pricing different roles');
  } else {
    out.push('it publishes no range to check the projection against');
  }
  // freshness
  const t = c.generatedAt ? Date.parse(c.generatedAt) : NaN;
  const age = Number.isFinite(t) ? (nowMs - t) / 3.6e6 : null;
  if (age == null) out.push('its publication time is unknown');
  else if (age > MAX_AGE_H[sport]) out.push(`it was published ${Math.round(age)}h ago, older than the ${MAX_AGE_H[sport]}h freshness limit`);
  else if (age < -1) out.push('its publication time is in the future');
  // availability
  if (c.designation != null && !AVAILABLE.has(c.designation.toUpperCase())) out.push(`the player is listed ${c.designation.toLowerCase().replace(/_/g, ' ')}`);
  if (c.starter === false) out.push('it does not project him as a starter');
  void family;
  return out;
}
