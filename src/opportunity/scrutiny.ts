// EXTREME-GAP SCRUTINY — a large model-versus-market disagreement is a reason to check, never a reason to trust.
// Most often it means the model is wrong (tennis and soccer settled records show exactly that), the participant or
// side is mislabelled, the event has started, or the quote is stale. Sift flags any gap of EXTREME_GAP or more and
// lists the checks it can make from published fields; it never upgrades a row because its gap is large.
import type { Opportunity } from './types';

/** Probability points (0..1) at or beyond which a model–market gap is called extreme. */
export const EXTREME_GAP = 0.25;

export interface Check { label: string; ok: boolean | null; note: string }

export interface Scrutiny {
  gap: number;
  checks: Check[];
  /** One line for cards. */
  line: string;
}

export function scrutiny(o: Opportunity): Scrutiny | null {
  const { fair, ask } = o.price;
  if (fair == null || ask == null) return null;
  const gap = fair - ask;
  if (Math.abs(gap) < EXTREME_GAP) return null;
  const checks: Check[] = [
    { label: 'Contract identity', ok: o.orientation === 'VERIFIED' ? true : o.orientation === 'MISMATCH' ? false : null, note: o.orientation === 'VERIFIED' ? 'Ticker side matches the publication’s side' : o.orientation === 'MISMATCH' ? 'Ticker side does not match' : 'Could not be verified from the ticker' },
    { label: 'Not started', ok: o.phase === 'PREGAME' ? true : o.phase === 'NO_START' ? null : false, note: o.phase === 'PREGAME' ? 'Start time is in the future' : o.phase === 'NO_START' ? 'No usable start time' : 'The event has started or ended' },
    { label: 'Quote fresh', ok: o.price.state === 'CURRENT', note: o.price.state === 'CURRENT' ? 'A current executable quote' : `Price state: ${o.price.state.toLowerCase().replace(/_/g, ' ')}` },
    { label: 'Model record', ok: o.confidence.calibration === 'VALIDATED' ? true : o.confidence.calibration === 'MARKET_BEATS_MODEL' ? false : null, note: o.confidence.calibration === 'MARKET_BEATS_MODEL' ? 'The market beats this model on its own settled record' : o.confidence.calibration === 'VALIDATED' ? 'Validated by its publication' : 'Research only, not validated' },
  ];
  const failed = checks.filter((c) => c.ok === false).map((c) => c.label.toLowerCase());
  const line = `Extreme gap: the model is ${Math.round(Math.abs(gap) * 100)} points ${gap > 0 ? 'above' : 'below'} the ask. ${failed.length ? `Failed checks: ${failed.join(', ')}.` : 'Checks pass, but a gap this size is more often the model’s error than the market’s.'}`;
  return { gap, checks, line };
}
