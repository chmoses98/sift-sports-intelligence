// A statistic's raw and opponent-adjusted versions are separate statistics. Where the data layer links a pair (counterpartOf), this says
// which id is which; the versions are never merged, averaged or subtracted.
import { counterpartOf } from '../../data/research/relations';

export interface Family { adjId: string; rawId: string; currentIsAdjusted: boolean }

export function familyOf(slug: string, id: string): Family | null {
  const c = counterpartOf(slug, id);
  if (!c) return null;
  return c.relation === 'raw_counterpart' ? { adjId: id, rawId: c.id, currentIsAdjusted: true } : { adjId: c.id, rawId: id, currentIsAdjusted: false };
}
