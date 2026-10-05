// Which published usage metrics make football sense for a player's position.
//
// One semantic rule, not per-screen exceptions: every usage metric has a ROLE (passing / rushing /
// receiving), read from its id and name; every position allows some roles as PRIMARY (always shown when
// published) and some as SECONDARY (shown only when the published share describes a real role). Anything
// else is hidden. Nothing is ever computed or substituted: a metric that is not published is not shown.

export type UsageRole = 'passing' | 'rushing' | 'receiving';

export function usageRole(metricId: string, name?: string | null): UsageRole | null {
  const s = `${metricId} ${name ?? ''}`.toLowerCase();
  if (/target|reception|receiving|route|catch/.test(s)) return 'receiving';
  if (/carry|carries|rush/.test(s)) return 'rushing';
  if (/pass|dropback|attempt|completion/.test(s)) return 'passing';
  return null;
}

type Policy = Partial<Record<UsageRole, { min: number }>>;
/**
 * min = the smallest published share that counts as a real role (0 = any positive value).
 *  - QB: passing; rushing when published (designed runs and scrambles are real QB usage); NEVER receiving.
 *  - RB / FB: rushing and receiving.
 *  - WR / TE: receiving; rushing only for a meaningful role (>= 5% of the team's carries).
 *  - K, P, LS, defensive positions, unknown: no usage metrics.
 */
export const USAGE_POLICY: Record<string, Policy> = {
  QB: { passing: { min: 0 }, rushing: { min: 0 } },
  RB: { rushing: { min: 0 }, receiving: { min: 0 } },
  FB: { rushing: { min: 0 }, receiving: { min: 0 } },
  WR: { receiving: { min: 0 }, rushing: { min: 0.05 } },
  TE: { receiving: { min: 0 }, rushing: { min: 0.05 } },
};

export function usageFor<T extends { metric_id: string; value: number | null }>(position: string | null | undefined, observations: T[], nameOf: (metricId: string) => string | null | undefined = () => null): T[] {
  const policy = USAGE_POLICY[(position ?? '').toUpperCase()];
  if (!policy) return [];
  return observations.filter((o) => {
    const role = usageRole(o.metric_id, nameOf(o.metric_id));
    const rule = role ? policy[role] : undefined;
    if (!rule || o.value == null || !Number.isFinite(o.value)) return false;
    return rule.min === 0 ? o.value > 0 : o.value >= rule.min;
  });
}
