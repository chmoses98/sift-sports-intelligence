// PROJECTION PROMOTION POLICY — the rule a stat family must satisfy before the Projection Foundation engine may be
// SIFT's one authoritative number for it. The policy is code so it can be tested against the frozen holdout evidence
// (research/projection_foundation/promotion/evidence.json) and so a promotion in projectionApprovals.ts cannot drift
// away from the evidence behind it.
//
// Evidence is historical (walk-forward, untouched holdout). It is never a betting claim: a more accurate projection is
// not an edge, and nothing here touches betting authority, thresholds or staking.

export interface ScoreDiff { diff: number; lo: number; hi: number }
export interface FamilyEvidence {
  readiness: 'READY' | 'SHADOW VALIDATION' | 'NEEDS IMPROVEMENT' | 'INSUFFICIENT DATA';
  reason: string;
  model: string | null;
  n: number | null;
  mae: number | null;
  bias: number | null;
  crps: number | null;
  cover80: number | null;
  /** challenger − season-average baseline (CRPS, MAE for a few families); negative = challenger better */
  vsBaseline: ScoreDiff | null;
  /** challenger − incumbent on identical holdout rows; negative = challenger better; null = no incumbent comparison exists */
  vsIncumbent: ScoreDiff | null;
  /** share of the incumbent's holdout score the challenger removes (null without an incumbent comparison) */
  relGain: number | null;
}
export interface EvidenceFile {
  schema: 'sift.promotion_evidence.v1';
  sports: Record<string, { holdout: string | null; pfCore: string | null; codeSha: string | null; families: Record<string, FamilyEvidence> }>;
}

export const PROMOTION_POLICY = {
  /** The challenger's own holdout verdict must be READY (beats baseline, calibrated, no subgroup failure). */
  requiredReadiness: 'READY' as const,
  /** With an incumbent: the game-clustered 95% interval of (challenger − incumbent) must sit entirely below 0 … */
  incumbentCiMustExcludeZero: true,
  /** … and the gain must be material: at least this share of the incumbent's holdout score (statistical significance
   *  alone is not enough: NHL's 0.1–1.0% gains are significant and still marginal). */
  minRelativeGain: 0.01,
  /** Without an incumbent comparison the challenger must beat the baseline with the interval below 0, and the stat
   *  must not already carry a competing production number in SIFT. */
  baselineCiMustExcludeZero: true,
} as const;

export interface PolicyVerdict { ok: boolean; reasons: string[] }

/** Whether the historical evidence alone supports promotion. Live-input readiness is judged separately (approvals). */
export function evidenceVerdict(e: FamilyEvidence | undefined, opts: { competingProductionNumber: boolean }): PolicyVerdict {
  if (!e) return { ok: false, reasons: ['no frozen holdout evidence for this family'] };
  const why: string[] = [];
  if (e.readiness !== PROMOTION_POLICY.requiredReadiness) why.push(`holdout readiness is ${e.readiness}, not READY`);
  if (e.vsIncumbent) {
    if (!(e.vsIncumbent.hi < 0)) why.push(`the interval versus the incumbent includes 0 [${e.vsIncumbent.lo.toFixed(3)}, ${e.vsIncumbent.hi.toFixed(3)}]`);
    if (e.relGain == null || e.relGain < PROMOTION_POLICY.minRelativeGain) why.push(`the gain over the incumbent is ${e.relGain == null ? 'unmeasured' : `${(e.relGain * 100).toFixed(2)}%`}, below the ${PROMOTION_POLICY.minRelativeGain * 100}% materiality floor`);
  } else {
    if (opts.competingProductionNumber) why.push('SIFT already shows a production number for this stat and no incumbent comparison exists to justify replacing it');
    if (!e.vsBaseline || !(e.vsBaseline.hi < 0)) why.push('the interval versus the baseline does not exclude 0');
  }
  return { ok: why.length === 0, reasons: why };
}
