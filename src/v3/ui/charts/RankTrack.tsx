// League position tracks. `RankTrack` is one marker on a rail (a unit's percentile: 0 worst at the left, 100 best at the right), ice for
// offense and amber for defense. `GapTrack` is two markers on one rail with the gap between them filled (Compare): the same ranks drive
// both markers, nothing is blended into one score. Markers may be any node (a team logo link).
import type { ReactNode } from 'react';
import type { Role } from '../../model/statDecl';

const clamp = (p: number) => Math.max(0, Math.min(100, p));

export function RankTrack({ pct, role, letter, height = 24 }: { pct: number | null; role: Role; letter?: string; height?: number }) {
  return (
    <span className="st-ptr" style={{ height }} aria-hidden="true">
      <i className="st-rail" /><i className="st-tick" />
      {pct != null && <span className={`st-mk ${role}`} style={{ left: `${clamp(pct)}%` }}>{letter}</span>}
    </span>
  );
}

export interface GapMarker { pct: number; node: ReactNode; better: boolean | null }

export function GapTrack({ a, b, role }: { a: GapMarker; b: GapMarker; role: Role }) {
  const lo = Math.min(a.pct, b.pct), hi = Math.max(a.pct, b.pct);
  const cls = (m: GapMarker) => `st-mk st-mk--lg ${role} ${m.better == null ? '' : m.better ? 'is-win' : 'is-lose'}`;
  return (
    <div className="st-ptr st-ptr--cmp">
      <i className="st-rail" /><i className="st-tick" />
      <span className={`st-gap ${role}`} style={{ left: `${clamp(lo)}%`, width: `${clamp(hi) - clamp(lo)}%` }} />
      <span className={cls(a)} style={{ left: `${clamp(a.pct)}%` }}>{a.node}</span>
      <span className={cls(b)} style={{ left: `${clamp(b.pct)}%` }}>{b.node}</span>
    </div>
  );
}
