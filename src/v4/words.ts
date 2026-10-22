import type { Calibration } from '../opportunity/types';
import { formatQuoteAgo } from '../live/freshness';

/** Plain words for the publication's calibration state (what its settled record shows), never a verdict on the pick. */
export function calibrationWord(c: Calibration): string {
  switch (c) {
    case 'VALIDATED': return 'Settled record published';
    case 'RESEARCH': return 'Research only';
    case 'MARKET_BEATS_MODEL': return 'Market has beaten the model';
    default: return 'No settled record';
  }
}

/** "RESEARCH_ONLY" -> "Research only": the publication's authority word, readable. */
export const authorityWord = (a: string) => { const t = a.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** A quote's age for a chip: "just now" inside a minute, else "4m ago". */
export const agoWord = (ms: number | null) => (ms != null && ms >= 0 && ms < 60_000 ? 'just now' : formatQuoteAgo(ms));
