// Consumer decision language. One mapping from an opportunity's published status (and its calibration) to the
// three words a viewer reads: Back · Watch · No Edge. "Fade" is reserved for a publication that supports the
// opposite side with its own evidence; none does today, so Sift never shows it, and it is never a synonym for
// "do nothing". The publication's authority word and the precise reason stay one tap away (statusReason).
import type { Calibration, OpportunityStatus } from '../opportunity/types';

export type DecisionWord = 'Back' | 'Watch' | 'No Edge';
export type DecisionTone = 'back' | 'watch' | 'research' | 'noedge';

export interface Decision {
  word: DecisionWord;
  tone: DecisionTone;
  /** What kind of evidence stands behind the word, in a few plain words. */
  basis: string;
}

export function decisionOf(status: OpportunityStatus, calibration?: Calibration | null): Decision {
  if (status === 'ACTIONABLE') return { word: 'Back', tone: 'back', basis: 'Publication permits a bet at this price' };
  if (status === 'PASS') return { word: 'No Edge', tone: 'noedge', basis: 'Nothing qualifies at the current price' };
  if (calibration === 'MARKET_BEATS_MODEL') return { word: 'No Edge', tone: 'noedge', basis: 'Model disagrees, but the market has the better record' };
  if (status === 'WATCH') return { word: 'Watch', tone: 'watch', basis: 'A research signal, not a priced edge' };
  return { word: 'Watch', tone: 'research', basis: 'Research candidate · not a validated bet' };
}
