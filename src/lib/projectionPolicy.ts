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

// ---------------------------------------------------------------------------------------------------------------------
// ABSOLUTE PUBLICATION STANDARD. Beating a simple baseline is necessary, never sufficient: a projection is published only if
// its ranges are calibrated, it is unbiased, it carries real information beyond the baseline, and all of that holds in more
// than one independent period. Mirrors research/projection_foundation/promotion/absolute_accuracy.py, which documents the
// rules and writes absolute_evidence.json; tests/projectionApprovals.test.ts requires the two to agree.
export interface AbsolutePeriod {
  name: string; independent: boolean; n: number; clusters: number;
  mae: number; rmse: number; bias: number; cover50: number; cover80: number; cover90: number; pitVar: number;
  crps: number; baselineCrps: number; baselineRmse: number; corr: number | null;
  vsBaseline: ScoreDiff | null;
}
export interface AbsoluteFamily { sport: string; family: string; model: string; meanOutcome: number | null; meanOutcomeSource: string; periods: AbsolutePeriod[]; verdict: AbsoluteVerdict }
export type PublicationStandard = 'MET' | 'MET_WITH_CAVEATS' | 'NOT_MET';
export interface AbsoluteVerdict { status: PublicationStandard; failures: string[]; caveats: string[] }
export interface AbsoluteEvidenceFile { schema: 'sift.absolute_evidence.v1'; families: Record<string, AbsoluteFamily> }

export const ABSOLUTE_STANDARD = {
  minClusters: 300, underCoverageSE: 3, overCoverage: 0.05, pitBand: 0.10, biasOverRmse: 0.15,
  materialCrpsGain: 0.01, lowInfoMseSkill: 0.05, wideRange80: 0.83, biasCaveatOverRmse: 0.10,
} as const;

const signed3 = (x: number): string => `${x < 0 ? '-' : '+'}${Math.abs(Number(x.toPrecision(3)))}`;   // Python's %+.3g

export function absoluteVerdict(periods: AbsolutePeriod[]): AbsoluteVerdict {
  const S = ABSOLUTE_STANDARD;
  const failures: string[] = [], caveats: string[] = [];
  const deciding = periods.filter((p) => p.independent && p.clusters >= S.minClusters);
  const small = periods.filter((p) => p.independent && p.clusters < S.minClusters);
  for (const p of deciding) {
    const n = p.clusters;
    for (const [nominal, v] of [[0.5, p.cover50], [0.8, p.cover80], [0.9, p.cover90]] as const) {
      const se = Math.sqrt(nominal * (1 - nominal) / n), d = v - nominal;
      if (d < -S.underCoverageSE * se) failures.push(`${p.name}: the ${Math.round(nominal * 100)}% range covers ${v.toFixed(3)}, more than ${S.underCoverageSE} standard errors under nominal`);
      else if (d > S.overCoverage) failures.push(`${p.name}: the ${Math.round(nominal * 100)}% range covers ${v.toFixed(3)}, more than 5 points over nominal`);
    }
    const tol = Math.max(S.pitBand, 2 * Math.sqrt(2 / n));
    if (Math.abs(p.pitVar - 1) > tol) failures.push(`${p.name}: PIT variance ratio ${p.pitVar.toFixed(3)} is outside 1 ± ${tol.toFixed(3)}`);
    if (Math.abs(p.bias) > S.biasOverRmse * p.rmse) failures.push(`${p.name}: bias ${signed3(p.bias)} exceeds 0.15 × RMSE`);
    else if (Math.abs(p.bias) > S.biasCaveatOverRmse * p.rmse) caveats.push(`${p.name}: bias ${signed3(p.bias)} is ${(Math.abs(p.bias) / p.rmse).toFixed(2)} × RMSE`);
    if (p.cover80 > S.wideRange80) caveats.push(`${p.name}: 80% range covers ${p.cover80.toFixed(3)} (ranges slightly wide, i.e. conservative)`);
  }
  if (!deciding.length) failures.push('no independent period large enough to decide');
  else {
    const first = deciding[0];
    const gain = 1 - first.crps / first.baselineCrps;
    if (gain < S.materialCrpsGain || !first.vsBaseline || !(first.vsBaseline.hi < 0)) failures.push(`${first.name}: CRPS improvement over the baseline is ${(gain * 100).toFixed(2)}% (needs ≥ 1% with the interval below 0)`);
    const mseSkill = 1 - (first.rmse / first.baselineRmse) ** 2;
    if (mseSkill < S.lowInfoMseSkill) caveats.push(`${first.name}: low information: squared error is only ${(mseSkill * 100).toFixed(1)}% below the baseline's`);
    for (const p of deciding.slice(1)) {
      if (!p.vsBaseline || !(p.vsBaseline.hi < 0) || p.crps >= p.baselineCrps) failures.push(`${p.name}: the improvement over the baseline is not confirmed (interval does not sit below 0)`);
    }
  }
  for (const p of small) {
    if (p.crps >= p.baselineCrps || (p.vsBaseline && !(p.vsBaseline.hi < 0))) caveats.push(`${p.name} (${p.clusters} games, too few to decide): did not confirm the improvement over the baseline`);
  }
  return { status: failures.length ? 'NOT_MET' : caveats.length ? 'MET_WITH_CAVEATS' : 'MET', failures, caveats };
}
