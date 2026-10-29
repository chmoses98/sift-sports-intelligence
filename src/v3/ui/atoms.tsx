// Shared research atoms (see atoms.css). Presentational and data-free: callers pass values already derived from published data, and a
// missing value is always passed as null so the atom prints "—" and never a guess.
import { Fragment, type ReactNode } from 'react';
import './atoms.css';
import { Icon } from './Icon';

export type Lane = 'market' | 'history' | 'sift';
export const LANE_NAME: Record<Lane, string> = { market: 'Market', history: 'History', sift: 'SIFT model' };

/** The lane's own shape: square (Market), ring (History), diamond (SIFT model). */
export const LaneMark = ({ lane }: { lane: Lane }) => <i className={`x-sw${lane === 'market' ? '' : ` x-sw--${lane}`}`} aria-hidden="true" />;

export interface LaneCell {
  lane: Lane;
  /** Already formatted ("54%", "6 of 10"); null prints "—". */
  value: string | null;
  sub: string;
  /** The tap target wrapping the cell: a PriceTap for Market, a link or button for the others. Omit for a plain cell. */
  wrap?: (cell: ReactNode) => ReactNode;
}

/** The three-lane readout. Always Market, History, SIFT model, in that order, never blended or subtracted. */
export function Lanes({ cells, label = 'Evidence lanes' }: { cells: [LaneCell, LaneCell, LaneCell]; label?: string }) {
  return (
    <div className="x-trio" role="group" aria-label={label}>
      {cells.map((c) => {
        const body = <><span className={`t x-lane--${c.lane}`}><LaneMark lane={c.lane} />{LANE_NAME[c.lane]}</span><span className={`n x-lane--${c.lane}${c.value == null ? ' is-none' : ''}`}>{c.value ?? '—'}</span><span className="s">{c.sub}</span></>;
        return <Fragment key={c.lane}>{c.wrap ? c.wrap(body) : <div>{body}</div>}</Fragment>;
      })}
    </div>
  );
}

/** One rung on the 0–100 track with each lane's mark. A lane with no value draws no mark. */
export function LaneTrack({ market, history, sift }: { market: number | null; history: number | null; sift: number | null }) {
  const mk = (v: number | null, lane: Lane) => (v == null ? null : <i className={`x-mk x-mk--${lane}`} style={{ left: `${Math.max(0, Math.min(100, v))}%` }} />);
  return <div className="x-track" aria-hidden="true">{mk(market, 'market')}{mk(history, 'history')}{mk(sift, 'sift')}</div>;
}

/** A league percentile (0 worst, 100 best) on a track, offense ice or defense amber. */
export function PercentileTrack({ pct, role, label }: { pct: number | null; role?: 'off' | 'def'; label: string }) {
  if (pct == null) return <div className="x-pct" role="img" aria-label={`${label}: not ranked`} />;
  const p = Math.max(0, Math.min(100, pct));
  return <div className="x-pct" role="img" aria-label={`${label}: ${Math.round(p)}th percentile`}><i className={role} style={{ width: `${p}%` }} /><b className={role} style={{ left: `${p}%` }} /></div>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { key: T; label: string; badge?: number | string | null }[]; value: T; onChange: (k: T) => void; label: string }) {
  return (
    <div className="x-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>{t.label}{t.badge != null && t.badge !== '' && <i>{t.badge}</i>}</button>)}
    </div>
  );
}

export function Seg<T extends string | number | null>({ options, value, onChange, label, hit }: { options: readonly [T, string][]; value: T; onChange: (v: T) => void; label: string; hit?: boolean }) {
  return (
    <div className={`x-seg${hit ? ' x-seg--hit' : ''}`} role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** Data SIFT does not have, with the reason. Never a working control. */
export const LockedRow = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="x-lock" role="note"><Icon name="lock" size={14} /><span><b>{title}</b> {children}</span></div>
);
