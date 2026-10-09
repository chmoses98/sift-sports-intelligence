// The ranking rule, in full (docs/OPPORTUNITIES.md). Deterministic and auditable; never a hidden score.
//
//   1. Tier: Actionable (1) → robust research candidate (2: the publication's own support word is a strong one, the
//      price is current, its worst-case edge is published and positive, the contract is not a single-event long shot,
//      and the model's own settled record does not lose to the market) → other research candidates (3) → signals
//      without a validated bet (4: published watch signals, and research candidates from a model whose own settled
//      record loses to the market — a model disagreement, not an edge) → passes (5).
//   2. Within a tier: a current price before a stale or missing one.
//   3. High-variance single-event contracts (goal scorers, exact scores) sort after everything else in their tier.
//   4. The evidence class of the model's record: a model whose own settled record loses to the market
//      (MARKET_BEATS_MODEL) sorts after every other research model, whatever the size of its gap. A big number from a
//      model the market beats is weaker evidence than a smaller one from a model that does not.
//   5. Then the publication's worst-case edge (desc), then its fee-adjusted EV per contract (desc), then the share of
//      posterior draws with a positive edge (desc) — except between two MARKET_BEATS_MODEL rows, where the size of
//      the gap is not evidence of an edge (the soccer and tennis publications' own studies find the model's error
//      grows with it), so they keep kickoff order.
//   6. Then kickoff, then id.
// Correlation: at most one opportunity per thesis group is featured; the rest are listed as related expressions, and
// the expressions that cannot win together with the lead are said to be the opposite outcome. Featured leads on the
// same game are named as one exposure, and two leads that cannot both win are named as contradicting each other.
import { contradicts } from './correlation';
import type { Calibration, Opportunity, OpportunityStatus, RankInputs } from './types';

const num = (v: number | null) => (v == null ? -Infinity : v);

/** Published support words that mean the publication's own robustness check passed (exact words, never a substring). */
export const STRONG_SUPPORT = new Set(['ROBUST', 'VERY_ROBUST', 'EVIDENCE_STRONGER', 'AGREES_WITH_MODEL']);

/** Sort order of a model's evidence class within a tier (lower first). */
export const EVIDENCE_ORDER: Record<Calibration, number> = { VALIDATED: 0, RESEARCH: 1, UNVALIDATED: 2, MARKET_BEATS_MODEL: 3 };

export interface TierInputs {
  status: OpportunityStatus;
  support: string | null;
  worstCaseEdge: number | null;
  highVariance: boolean;
  priceCurrent: boolean;
  calibration: Calibration;
}

export function tierOf(x: TierInputs): RankInputs['tier'] {
  if (x.status === 'ACTIONABLE') return 1;
  if (x.status === 'PASS') return 5;
  if (x.status === 'WATCH' || x.calibration === 'MARKET_BEATS_MODEL') return 4;
  const robust = STRONG_SUPPORT.has(String(x.support ?? '').toUpperCase())
    && x.priceCurrent && x.worstCaseEdge != null && x.worstCaseEdge > 0 && !x.highVariance;
  return robust ? 2 : 3;
}
export const TIER_WORD: Record<RankInputs['tier'], string> = { 1: 'Actionable', 2: 'Research candidate · robust', 3: 'Research candidate', 4: 'Watch', 5: 'Pass' };

/** The tier's word for one row: a research candidate in tier 4 is a model disagreement, not a watch signal. */
export function tierWord(tier: RankInputs['tier'], status: OpportunityStatus): string {
  return tier === 4 && status === 'RESEARCH_CANDIDATE' ? 'Model disagreement' : TIER_WORD[tier];
}

export function compareOpportunities(a: Opportunity, b: Opportunity): number {
  if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
  if (a.rank.priceCurrent !== b.rank.priceCurrent) return a.rank.priceCurrent ? -1 : 1;
  if (a.rank.highVariance !== b.rank.highVariance) return a.rank.highVariance ? 1 : -1;
  const c = EVIDENCE_ORDER[a.confidence.calibration] - EVIDENCE_ORDER[b.confidence.calibration];
  if (c !== 0) return c;
  if (a.confidence.calibration === 'MARKET_BEATS_MODEL' && b.confidence.calibration === 'MARKET_BEATS_MODEL') return a.rank.kickoff.localeCompare(b.rank.kickoff) || a.id.localeCompare(b.id);
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
  /** Ids of related expressions that cannot win together with the lead (the opposite outcome, not a second way in). */
  opposed: string[];
  /** Other featured leads on the same game: one exposure, not independent edges. */
  sameGame: Opportunity[];
  /** Featured leads on the same game that cannot win together with this one: the two rely on opposite scenarios. */
  conflicts: Opportunity[];
}

/** Rank, then collapse each thesis group to its best expression with the others attached as related. */
export function featureOpportunities(all: Opportunity[]): Featured[] {
  const sorted = [...all].sort(compareOpportunities);
  const groups = new Map<string, Featured>();
  const out: Featured[] = [];
  for (const o of sorted) {
    const key = o.group ?? o.id;
    const g = groups.get(key);
    if (g) {
      g.related.push(o);
      if (contradicts(g.lead, o)) g.opposed.push(o.id);
    } else {
      const f: Featured = { lead: o, related: [], opposed: [], sameGame: [], conflicts: [] };
      groups.set(key, f);
      out.push(f);
    }
  }
  const byEvent = new Map<string, Featured[]>();
  for (const f of out) byEvent.set(`${f.lead.sport}:${f.lead.eventId}`, [...(byEvent.get(`${f.lead.sport}:${f.lead.eventId}`) ?? []), f]);
  for (const fs of byEvent.values()) {
    if (fs.length < 2) continue;
    for (const f of fs) {
      f.sameGame = fs.filter((x) => x !== f).map((x) => x.lead);
      f.conflicts = f.sameGame.filter((x) => contradicts(f.lead, x));
    }
  }
  return out;
}

/** Only what a viewer should act on or review: never a PASS row. */
export const isLive = (o: Opportunity) => o.status !== 'PASS';
