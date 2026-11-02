// "Havoc" is not an analytical input of the CFB Script Engine read and is never shown as evidence. Everything that displays a metric, a finding or a component edge asks
// here first. (The payload still carries the metric in its registry and tables; it is filtered at display, never recomputed.)
import type { Finding, MetricRow } from '../../lib/scriptEngine';

const HAVOC = /havoc/i;
export const isHavoc = (s: string | null | undefined): boolean => !!s && HAVOC.test(s);

/** A finding is displayable evidence unless it cites a havoc metric or its own words name havoc. */
export const usableFinding = (f: Pick<Finding, 'metric_refs' | 'statement' | 'code'>): boolean => !isHavoc(f.code) && !isHavoc(f.statement) && !f.metric_refs.some(isHavoc);

/** A metric row may be shown as evidence unless it is a havoc metric. */
export const usableMetric = (m: Pick<MetricRow, 'metric_id'> | null | undefined): boolean => !!m && !isHavoc(m.metric_id);
