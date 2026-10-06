// What Matters: one ordered list of the game's most consequential findings. Matchup edges carry their own
// score (strength gap × area weight); context notes carry an importance on the same scale (context.ts); a
// scheme tendency is descriptive, so at most one appears, at a fixed modest weight. Pure, so the ordering is
// unit-testable.
import type { ContextNote } from './context';
import type { MatchupInsight } from './matchups';
import type { SchemeInsight } from './scheme';

export type MattersItem =
  | { kind: 'matchup'; item: MatchupInsight; importance: number }
  | { kind: 'context'; item: ContextNote; importance: number }
  | { kind: 'scheme'; item: SchemeInsight; importance: number };

/** Scheme notes describe tendencies (no edge is claimed): below a clear matchup edge, above routine context. */
export const SCHEME_IMPORTANCE = 0.4;

export function whatMatters(insights: MatchupInsight[], context: ContextNote[], scheme: SchemeInsight[], max = 5): MattersItem[] {
  const all: MattersItem[] = [
    ...insights.map((x) => ({ kind: 'matchup' as const, item: x, importance: x.score })),
    ...context.map((x) => ({ kind: 'context' as const, item: x, importance: x.importance })),
    ...scheme.slice(0, 1).map((x) => ({ kind: 'scheme' as const, item: x, importance: SCHEME_IMPORTANCE })),
  ];
  // Stable on ties: matchup edges first (they are the page's thesis), then context, then scheme.
  const order = { matchup: 0, context: 1, scheme: 2 } as const;
  return all.sort((a, b) => b.importance - a.importance || order[a.kind] - order[b.kind]).slice(0, max);
}
