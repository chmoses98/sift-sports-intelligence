// THE AUTHORITATIVE PROJECTION — the one place that decides which number SIFT shows for a sport, game, player and stat.
//
// For each request it:
//   1. looks up the approved engine (projectionApprovals.ts);
//   2. 'legacy'  → says so: the page keeps its existing production number and no foundation number is shown;
//   3. 'foundation' → runs the quality checks on the published projection (feed present, family READY, player covered,
//      gate not BLOCK, not confirmed/likely out, coherent, fresh) and returns EITHER one authoritative value with its
//      range, reliability, availability and update time, OR a withheld reason.
//
// A withheld promoted projection is never silently replaced by the legacy number: the page shows the reason and no value.
// The one exception is an explicit, per-stat fallback approval (Approval.fallback), usable only when the feed is missing,
// stale or has not yet published the game, and only if the established projection independently passes the freshness,
// availability and quality checks in projectionFallback.ts. It is never used when the player is out, the feed shows a
// structural defect for him, or what is needed to rule one out is missing. The result is `kind: 'fallback'`: the page
// shows the established number alone, labelled as such. Probabilities for a rung come from the same published
// distribution as the expected value (thresholdProbability), never from the other engine.
//
//
// Reliability describes the projection's data quality, never betting value, and nothing here changes betting authority.
import {
  coherenceProblems, familyOf, teamKey, findProjection, findTeamProjections, fmtAge, MAX_AGE_H, PARTICIPATION_WORDS,
  type GateFinding, type Participation, type PlayerProjection, type ProjectionDoc, type ProjSport,
} from './projections';
import { approvalFor, engineFor, type FallbackTrigger } from './projectionApprovals';
import { legacyFallbackProblems, type LegacyCandidate } from './projectionFallback';

export type Reliability = 'HIGH' | 'MODERATE' | 'LOW';
export const RELIABILITY_WORDS: Record<Reliability, string> = { HIGH: 'High reliability', MODERATE: 'Moderate reliability', LOW: 'Low reliability' };

export type WithheldCode =
  | 'FEED_UNAVAILABLE' | 'FAMILY_NOT_PUBLISHED' | 'FAMILY_NOT_READY' | 'NOT_PUBLISHED' | 'NOT_PROJECTED' | 'GATE_BLOCK' | 'OUT' | 'INCOHERENT' | 'STALE';

export interface Availability { status: Participation; words: string; source: string | null; capturedUtc: string | null }
export interface AuthoritativeValue {
  sport: ProjSport;
  family: string;
  mean: number;
  median: number | null;
  /** realistic 80% prediction range — a description of the same projection, not a second projection */
  p10: number | null;
  p90: number | null;
  /** p05/p25/p50/p75/p95 of the same distribution, when published */
  quantiles: { p05: number; p25: number; p50: number; p75: number; p95: number } | null;
  /** P(X ≥ k) from the same distribution as the mean */
  thresholds: { k: number; p: number }[];
  reliability: Reliability;
  /** plain reasons the reliability is not HIGH */
  reliabilityWhy: string[];
  updatedAt: string | null;
  ageHours: number | null;
  /** player rows only */
  availability: Availability | null;
  /** matchup and role context published with the projection */
  opportunity: { family: string; mean: number; p10: number | null; p90: number | null } | null;
  opponentFactor: { factor: number; sampleGames: number | null } | null;
  adjustments: string[];
  modelVersion: string;
}
export type Resolution =
  /** the stat's approved engine is the established model: the page shows its own number */
  | { kind: 'legacy' }
  /**
   * a promoted stat whose feed is missing / stale / unpublished, shown from the established model under an explicit
   * approval after it passed its own checks. The page shows the established number ALONE and says why.
   */
  | { kind: 'fallback'; trigger: FallbackTrigger; reason: string }
  /** `fallbackEligible`: an approval covers this situation and no structural defect was found, but no established
   *  candidate was supplied to check (callers that show no established number ignore it) */
  | { kind: 'withheld'; code: WithheldCode; reason: string; fallbackEligible?: boolean }
  | { kind: 'authoritative'; value: AuthoritativeValue };

/** Whether the page should read the established model's numbers for this row (its own stat, or an approved fallback). */
export const usesEstablished = (r: Resolution): boolean => r.kind === 'legacy' || r.kind === 'fallback';

export interface StatQuery { stat: string; playerId?: string | null; name?: string | null; team?: string | null; gameId?: string | null; opponent?: string | null }
export interface TeamQuery { family: string; home: string; away: string; startUtc?: string | null }

export interface ProjectionAuthority {
  sport: ProjSport;
  /**
   * The stat's player projection, or why there is none. `legacy` is the established publication's own candidate for this
   * player and stat: `undefined` = the caller shows no established number (no fallback is attempted); `null` = it has none.
   */
  resolve(q: StatQuery, legacy?: LegacyCandidate | null): Resolution;
  /** both teams' projections for one game family (e.g. team_points), or why there is none */
  resolveTeams(q: TeamQuery): { kind: 'legacy' } | { kind: 'withheld'; code: WithheldCode; reason: string } | { kind: 'authoritative'; teams: { team: string; value: AuthoritativeValue }[] };
}

const withheld = (code: WithheldCode, reason: string, fallbackEligible = false): Resolution => ({ kind: 'withheld', code, reason, ...(fallbackEligible ? { fallbackEligible } : {}) });

function ageOf(iso: string | null, nowMs: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? (nowMs - t) / 3.6e6 : null;
}

function reliabilityOf(p: PlayerProjection, review: GateFinding[]): { level: Reliability; why: string[] } {
  let level: Reliability = 'HIGH';
  const why: string[] = [];
  const lower = (to: Reliability, reason: string) => {
    why.push(reason);
    if (to === 'LOW' || (to === 'MODERATE' && level === 'HIGH')) level = to;
  };
  const part = p.participation?.status ?? 'UNVERIFIED';
  if (part === 'UNCERTAIN' || part === 'UNVERIFIED') lower('LOW', `${PARTICIPATION_WORDS[part]}`);
  else if (part === 'LIKELY_ACTIVE') lower('MODERATE', 'Expected to play but not yet confirmed');
  if (p.segments?.newTeamFirst4) lower('LOW', 'One of his first games with a new team: players in this spot have been projected too high');
  if (p.segments?.backup) lower('MODERATE', 'Backup role: depth-chart players have run below projection');
  if (p.segments?.rookie) lower('MODERATE', 'Rookie: limited history');
  for (const f of review.slice(0, 2)) lower('MODERATE', f.what);
  return { level, why };
}

function playerValue(sport: ProjSport, doc: ProjectionDoc, p: PlayerProjection, nowMs: number, review: GateFinding[]): AuthoritativeValue {
  const rel = reliabilityOf(p, review);
  const part = p.participation;
  return {
    sport, family: p.family, mean: p.mean, median: p.median, p10: p.p10, p90: p.p90, quantiles: p.quantiles, thresholds: p.thresholds,
    reliability: rel.level, reliabilityWhy: rel.why, updatedAt: p.dataAsOf, ageHours: ageOf(p.dataAsOf, nowMs),
    availability: part ? { status: part.status, words: PARTICIPATION_WORDS[part.status], source: part.source || null, capturedUtc: part.capturedUtc } : { status: 'UNVERIFIED', words: PARTICIPATION_WORDS.UNVERIFIED, source: null, capturedUtc: null },
    opportunity: p.opportunity, opponentFactor: p.opponentAdjustment, adjustments: p.adjustments, modelVersion: doc.modelVersion,
  };
}

/**
 * Builds the authority for one sport. `doc` is the decoded `sift.projections.v1` feed, or null when it is missing,
 * unreachable or unrecognised; `nowMs` is injected so freshness is testable.
 */
export function makeAuthority(sport: ProjSport, doc: ProjectionDoc | null, nowMs: number, rollback?: { sport: string; family: string }[]): ProjectionAuthority {
  const maxAge = MAX_AGE_H[sport];
  /** an approved fallback covers this situation (trigger) and, where the family needs it, the feed showed no defect segment */
  const eligible = (family: string, code: FallbackTrigger, p?: PlayerProjection): boolean => {
    const fb = approvalFor(sport, family)?.fallback;
    if (!fb || !fb.triggers.includes(code)) return false;
    if (fb.requiresKnownSegments && !(p && p.segments && !p.segments.newTeamFirst4)) return false;
    return true;
  };
  const gateFamily = (family: string): Resolution | null => {
    if (!doc) return withheld('FEED_UNAVAILABLE', 'the projection feed is unavailable right now', eligible(family, 'FEED_UNAVAILABLE'));
    const info = doc.families[family];
    if (!info) return withheld('FAMILY_NOT_PUBLISHED', 'the projection model has not published this stat');
    if (info.readiness !== 'READY') return withheld('FAMILY_NOT_READY', 'the projection model is not currently validated for this stat');
    return null;
  };
  const foundation = (q: StatQuery): Resolution => {
    const family = familyOf(q.stat);
    if (engineFor(sport, family, rollback) === 'legacy') return { kind: 'legacy' };
    const blocked = gateFamily(family);
    if (blocked) return blocked;
    const d = doc!;
    const p = findProjection(d, q);
    if (!p) {
      // a game the feed has no rows for at all is "not published yet"; a player missing from a game it does cover is outside the population
      const covered = (!!q.team && d.players.some((x) => teamKey(x.team) === teamKey(q.team!) && (!q.opponent || !x.opponent || teamKey(x.opponent) === teamKey(q.opponent))))
        || (!!q.playerId && d.players.some((x) => x.playerId === q.playerId));
      return covered
        ? withheld('NOT_PROJECTED', 'this player is outside the projection model’s population for this game')
        : withheld('NOT_PUBLISHED', 'projections for this game have not been published yet', eligible(family, 'NOT_PUBLISHED'));
    }
    if (p.gate.status === 'BLOCK') {
      const f = p.gate.findings.find((x) => x.severity === 'BLOCK');
      return withheld('GATE_BLOCK', f ? f.what : 'the quality gate blocked this projection');
    }
    const status = p.participation?.status;
    if (status === 'CONFIRMED_OUT') return withheld('OUT', 'confirmed out before the game');
    if (status === 'LIKELY_OUT') return withheld('OUT', 'likely out before the game');
    if (approvalFor(sport, family)?.requiresVerifiedParticipation && status !== 'CONFIRMED_ACTIVE' && status !== 'LIKELY_ACTIVE') {
      return withheld('OUT', 'the starter is not confirmed or listed as the probable starter');
    }
    const probs = coherenceProblems(p);
    if (probs.length) return withheld('INCOHERENT', probs[0]);
    const age = ageOf(p.dataAsOf, nowMs);
    if (age == null || age > maxAge) {
      // a stale row that already shows a structural defect (first games with a new team) is not a reason to use the other engine
      return withheld('STALE', `inputs are ${fmtAge(age)}, older than the ${maxAge}h freshness limit`, !p.segments?.newTeamFirst4 && eligible(family, 'STALE', p));
    }
    return { kind: 'authoritative', value: playerValue(sport, d, p, nowMs, p.gate.findings.filter((f) => f.severity === 'REVIEW')) };
  };
  return {
    sport,
    resolve(q, legacy) {
      const r = foundation(q);
      if (r.kind !== 'withheld' || !r.fallbackEligible || legacy === undefined) return r;
      const problems = legacyFallbackProblems(sport, familyOf(q.stat), legacy, nowMs);
      if (problems.length) return { kind: 'withheld', code: r.code, reason: `${r.reason}, and the established projection could not be used: ${problems[0]}` };
      return { kind: 'fallback', trigger: r.code as FallbackTrigger, reason: r.reason };
    },
    resolveTeams(q) {
      const family = q.family;
      if (engineFor(sport, family, rollback) === 'legacy') return { kind: 'legacy' };
      const blocked = gateFamily(family) as ReturnType<ProjectionAuthority['resolveTeams']> | null;
      if (blocked) return blocked;
      const d = doc!;
      const ts = findTeamProjections(d, { home: q.home, away: q.away, startUtc: q.startUtc })?.filter((t) => t.family === family) ?? [];
      if (ts.length !== 2) return withheld('NOT_PUBLISHED', 'projections for this game have not been published yet') as { kind: 'withheld'; code: WithheldCode; reason: string };
      const age = ageOf(d.dataAsOf ?? d.generatedAt, nowMs);
      if (age == null || age > maxAge) return withheld('STALE', `inputs are ${fmtAge(age)}, older than the ${maxAge}h freshness limit`) as { kind: 'withheld'; code: WithheldCode; reason: string };
      const order = [teamKey(q.away), teamKey(q.home)];
      const teams = ts.slice().sort((a, b) => order.indexOf(teamKey(a.team)) - order.indexOf(teamKey(b.team))).map((t) => ({
        team: t.team,
        value: { sport, family, mean: t.mean, median: null, p10: t.p10, p90: t.p90, quantiles: null, thresholds: [], reliability: 'HIGH' as Reliability, reliabilityWhy: [], updatedAt: d.dataAsOf ?? d.generatedAt, ageHours: age, availability: null, opportunity: null, opponentFactor: null, adjustments: [], modelVersion: d.modelVersion },
      }));
      return { kind: 'authoritative', teams };
    },
  };
}

/** P(stat ≥ threshold) from the selected projection's own distribution; null when the rung is not on its published ladder. */
export function thresholdProbability(v: AuthoritativeValue, threshold: number): number | null {
  const hit = v.thresholds.find((t) => t.k === threshold);
  return hit && Number.isFinite(hit.p) ? hit.p : null;
}

/**
 * Spread of the selected projection in "typical-range" units, so rows can be compared with each other. The published
 * range is 80% (p10–p90); for a roughly normal outcome the middle half is 0.526 of that width. An approximation used only
 * to size the gap between projection and line, never to price anything.
 */
export function typicalWidth(v: AuthoritativeValue): number | null {
  return v.p10 != null && v.p90 != null && v.p90 > v.p10 ? 0.526 * (v.p90 - v.p10) : null;
}
