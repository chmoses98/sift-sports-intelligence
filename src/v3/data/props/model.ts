// The SIFT model lane. It shows a number only where the approval ledger lets SIFT display one (lib/projectionApprovals.ts) and the
// published projection passes its own checks (lib/projectionAuthority.ts): exactly the `authoritative` resolution, nothing else. A
// legacy engine, a withheld projection, a missing feed and a rung the model does not publish are all "—" with the reason. The lane is
// never blended with Market or History and never compared with them: no model-minus-market figure exists in this module.
import { APPROVALS } from '../../../lib/projectionApprovals';
import { thresholdProbability, type ProjectionAuthority } from '../../../lib/projectionAuthority';
import { familyOf, type ProjSport } from '../../../lib/projections';
import type { ModelLane, Prop } from './types';

const SPORT_CODES: Record<string, ProjSport> = { nfl: 'NFL', cfb: 'CFB', nba: 'NBA', mlb: 'MLB', nhl: 'NHL' };

/** The projection sport for a sport slug, or null (the feed is then never fetched). */
export const projSportOf = (slug: string): ProjSport | null => SPORT_CODES[slug] ?? null;

/** True when any statistic of the sport has an approved engine other than the established one: only then is a projection feed worth reading. */
export const sportHasApprovedModel = (slug: string): boolean => {
  const code = projSportOf(slug);
  return !!code && APPROVALS.some((a) => a.sport === code && a.engine === 'foundation');
};

export const NOT_APPROVED = 'not approved yet';

/** The lane for one prop. `authority` is null when the sport has no approved model (or its feed could not be read). */
export function modelLaneFor(p: Pick<Prop, 'slug' | 'stat' | 'label' | 'name' | 'playerId' | 'histId' | 'team' | 'opp' | 'rungs'>, authority: ProjectionAuthority | null): ModelLane {
  const code = projSportOf(p.slug);
  if (!authority || !code) return { state: 'none', reason: `SIFT’s model for ${p.label.toLowerCase()} is not approved for display` };
  const res = authority.resolve({ stat: p.stat, playerId: p.histId ?? p.playerId, name: p.name, team: p.team, opponent: p.opp });
  if (res.kind === 'authoritative') {
    const byK: Record<number, number> = {};
    for (const r of p.rungs) { const v = thresholdProbability(res.value, r.k); if (v != null) byK[r.k] = v; }
    return { state: 'published', byK };
  }
  if (res.kind === 'withheld') return { state: 'none', reason: `The projection is withheld: ${res.reason}` };
  // 'legacy' (the established engine is the one approved for this statistic) and 'fallback' both mean no approved foundation number here.
  return { state: 'none', reason: `SIFT’s model for ${p.label.toLowerCase()} is not approved for display` };
}

/** Whole percent for a rung, or null when the model does not publish this rung. */
export function modelPercent(m: ModelLane, k: number): number | null {
  if (m.state !== 'published') return null;
  const v = m.byK[k];
  return v == null ? null : Math.round(v * 100);
}

export const modelPublished = (p: Pick<Prop, 'model'>) => p.model.state === 'published';

export { familyOf };
