// The ranking rule, in full (docs/OPPORTUNITIES.md). Deterministic and auditable; never a hidden score.
//
//   1. Tier: Actionable (1) → robust research candidate with a current price and a positive worst-case edge (2) →
//      other research candidates (3) → published watch signals (4) → passes (5).
//   2. Within a tier: a current price before a stale or missing one.
//   3. Then the publication's worst-case edge (desc), then its fee-adjusted EV per contract (desc), then the share of
//      posterior draws with a positive edge (desc).
//   4. High-variance single-event contracts (goal scorers, exact scores) sort after everything else in their tier.
//   5. Then kickoff, then id.
// Correlation: at most one opportunity per thesis group is featured; the rest are listed as related expressions.
import type { Opportunity } from './types';

const num = (v: number | null) => (v == null ? -Infinity : v);

export function compareOpportunities(a: Opportunity, b: Opportunity): number {
  if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
  if (a.rank.priceCurrent !== b.rank.priceCurrent) return a.rank.priceCurrent ? -1 : 1;
  if (a.rank.highVariance !== b.rank.highVariance) return a.rank.highVariance ? 1 : -1;
  const w = num(b.rank.worstCaseEdge) - num(a.rank.worstCaseEdge);
  if (w !== 0 && Number.isFinite(w)) return w;
  const e = num(b.rank.evPerContract) - num(a.rank.evPerContract);
  if (e !== 0 && Number.isFinite(e)) return e;
  const s = num(b.rank.edgeShare) - num(a.rank.edgeShare);
  if (s !== 0 && Number.isFinite(s)) return s;
  return a.rank.kickoff.localeCompare(b.rank.kickoff) || a.id.localeCompare(b.id);
}

export interface Featured {
  lead: Opportunity;
  /** Other expressions of the same thesis on the same game, best first. */
  related: Opportunity[];
}

/** Rank, then collapse each thesis group to its best expression with the others attached as related. */
export function featureOpportunities(all: Opportunity[]): Featured[] {
  const sorted = [...all].sort(compareOpportunities);
  const groups = new Map<string, Featured>();
  const out: Featured[] = [];
  for (const o of sorted) {
    const key = o.group ?? o.id;
    const g = groups.get(key);
    if (g) g.related.push(o);
    else {
      const f = { lead: o, related: [] };
      groups.set(key, f);
      out.push(f);
    }
  }
  return out;
}

/** Only what a viewer should act on or review: never a PASS row. */
export const isLive = (o: Opportunity) => o.status !== 'PASS';
