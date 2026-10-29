// TEMPORARY. The metric registry's own `related_metrics` list is empty for every statistic v3 shows, so related statistics are derived
// here (backend backlog item 1 replaces this with a curated, typed list). Rules, so the derivation can never become a guess:
//  - relations reference stable metric ids, never display names; both ends must exist in the same sport's registry;
//  - raw and opponent-adjusted versions are separate statistics: their relation is explicit and typed, and a related list never
//    merges them or implies they are interchangeable;
//  - a relation never crosses sport or entity type.
import type { MetricDef } from '../../../contract/types';
import type { DerivedRelation } from './types';
import { shortMetricId } from './normalize';

/** NFL opponent-adjusted statistic to its raw counterpart (ids as published). */
const NFL_ADJ_TO_RAW: Record<string, string> = {
  adj_off_epa: 'off_epa_play', adj_off_db_epa: 'off_dropback_epa', adj_off_rush_epa: 'off_rush_epa', adj_off_ed_epa: 'off_early_down_epa',
  adj_off_explosive: 'off_explosive_rate', adj_off_to_rate: 'off_turnover_rate', adj_off_sack_rate: 'off_sack_rate_allowed', adj_off_sr: 'off_success_rate',
  adj_def_epa: 'def_epa_play', adj_def_db_epa: 'def_dropback_epa', adj_def_rush_epa: 'def_rush_epa', adj_def_ed_epa: 'def_early_down_epa',
  adj_def_explosive: 'def_explosive_rate', adj_def_to_rate: 'def_takeaway_rate', adj_def_sack_rate: 'def_sack_rate', adj_def_sr: 'def_success_rate',
};
const NFL_RAW_TO_ADJ = Object.fromEntries(Object.entries(NFL_ADJ_TO_RAW).map(([a, r]) => [r, a]));
const NHL_FAMILY = ['gf_per_game', 'ga_per_game', 'xgf_per60', 'xga_per60', 'pp_pct', 'pk_pct'];

export const isAdjustedId = (id: string) => /^adj_/.test(id);
export const counterpartOf = (slug: string, id: string): { id: string; relation: 'raw_counterpart' | 'adjusted_counterpart' } | null => {
  if (slug !== 'nfl') return null;
  if (NFL_ADJ_TO_RAW[id]) return { id: NFL_ADJ_TO_RAW[id], relation: 'raw_counterpart' };
  if (NFL_RAW_TO_ADJ[id]) return { id: NFL_RAW_TO_ADJ[id], relation: 'adjusted_counterpart' };
  return null;
};

export interface RelatedRef extends DerivedRelation { id: string }

/** Up to five related statistics for one statistic, validated against the sport's registry. */
export function deriveRelated(slug: string, id: string, defs: Map<string, MetricDef>, limit = 5): RelatedRef[] {
  const out: RelatedRef[] = [];
  const self = [...defs.values()].find((d) => shortMetricId(d.metric_id) === id);
  const exists = (x: string) => [...defs.values()].find((d) => shortMetricId(d.metric_id) === x && d.entity_type === (self?.entity_type ?? 'TEAM'));
  const add = (x: string, relation: DerivedRelation['relation']) => {
    const d = x !== id ? exists(x) : undefined;
    if (d && !out.some((o) => o.id === x)) out.push({ id: x, metricId: d.metric_id, relation });
  };
  if (slug === 'nhl') { NHL_FAMILY.forEach((x) => add(x, 'same_family')); return out.slice(0, limit); }
  if (slug !== 'nfl') return out;
  const side = /^(adj_)?off_/.test(id) ? 'off' : 'def';
  const opp = side === 'off' ? 'def' : 'off';
  if (isAdjustedId(id)) {
    const base = id.replace(/^adj_(off|def)_/, '');
    ['epa', 'db_epa', 'rush_epa', 'ed_epa'].forEach((f) => add(`adj_${side}_${f}`, 'component'));
    add(`adj_${opp}_${base}`, 'opposing_unit');
  }
  const c = counterpartOf(slug, id);
  if (c) add(c.id, c.relation);
  if (!isAdjustedId(id)) ['epa_play', 'dropback_epa', 'rush_epa', 'success_rate'].forEach((f) => add(`${side}_${f}`, 'same_family'));
  return out.slice(0, limit);
}
