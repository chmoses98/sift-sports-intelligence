// TRACK RECORD — how a kind of candidate has done once settled, read from the publication's own scorecard. A gap
// between a model and the market is only as good as the model's record on the same kind of contract; this puts that
// record on the card in one line, with no arithmetic beyond formatting the published figures.
//
//   NHL   metrics.json met_nhl.model_learning_stage → extensions.learning_v1.research_candidates.by_family: settled
//         research candidates per family (hit rate, mean model probability, mean closing-line value, shadow return)
import type { Learning } from '../lib/nhl';
import type { TrackRecord } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const cents = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10)}¢`;
const famWord = (f: string) => f.replace(/^player_/, 'player ').replace(/_/g, ' ');

/** The NHL learning scorecard's record for research candidates in `family`, or null when it publishes none. */
export function nhlFamilyRecord(l: Learning | null | undefined, family: string | null): TrackRecord | null {
  const row = family ? (l?.research_candidates as any)?.by_family?.[family] : null;
  if (!row || typeof row.n !== 'number' || row.n <= 0 || typeof row.hit_rate !== 'number' || typeof row.mean_p !== 'number') return null;
  const clv = typeof row.mean_clv === 'number' ? row.mean_clv : null;
  const ret = typeof row.shadow_return_per_cost === 'number' ? row.shadow_return_per_cost : null;
  const parts = [`${row.n.toLocaleString('en-US')} settled ${famWord(family!)} candidates won ${pct(row.hit_rate)} against ${pct(row.mean_p)} expected`];
  if (clv != null) parts.push(`closing line ${cents(clv)} on average`);
  if (ret != null) parts.push(`shadow return ${ret >= 0 ? '+' : '−'}${Math.abs(Math.round(ret * 1000) / 10)}% per $1`);
  const adverse = row.hit_rate < row.mean_p || (clv != null && clv < 0) || (ret != null && ret < 0);
  return {
    line: `${parts.join('; ')}${row.small_sample ? ' (small sample)' : ''}.`,
    adverse, n: row.n,
    source: `NHL learning scorecard${l?.generated_at_utc ? `, ${l.generated_at_utc}` : ''}${l?.stage?.label ? ` · stage ${l.stage.label.toLowerCase()}` : ''}`,
  };
}
