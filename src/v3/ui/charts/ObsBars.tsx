// Trend bars (SD2): one bar per game with its value on top, the rolling average as a line, the league level as a dashed rule, the
// selected observation outlined in cyan. Every column is a button (selecting is in place; the screen decides what that does to the
// address). The strip of opponent logos below shares the column geometry, so each logo sits under its bar.
import type { KeyboardEvent, ReactNode } from 'react';

export interface ObsBar {
  key: string;
  value: number;
  rolling: number | null;
  /** The label above the bar (already formatted). */
  text: string;
  /** Spoken name of the column ("Week 6 at GB, 13"). */
  aria: string;
}

const W = 338, H = 168, PAD = 4, TOP = 14, BOTTOM = H - 20;

export interface ObsBarsProps {
  bars: ObsBar[];
  /** The league's level for the statistic, drawn as a dashed rule; null draws none. */
  league: number | null;
  sel: number;
  onSelect: (i: number) => void;
  /** One per bar, drawn under it (an opponent logo). */
  under?: ReactNode[];
  label: string;
}

export function obsScale(values: number[], league: number | null): (v: number) => number {
  const vs = [...values, ...(league != null ? [league] : [])];
  const maxAbs = Math.max(1e-9, ...vs.map((v) => Math.abs(v)));
  const hi = Math.max(0, ...vs) + (Math.max(0, ...vs) > 0 ? 0.12 * maxAbs : 0);
  const lo = Math.min(0, ...vs) - (Math.min(0, ...vs) < 0 ? 0.12 * maxAbs : 0);
  const span = hi - lo || 1;
  return (v) => BOTTOM - ((v - lo) / span) * (BOTTOM - TOP);
}

export function ObsBars({ bars, league, sel, onSelect, under, label }: ObsBarsProps) {
  const n = bars.length;
  const y = obsScale(bars.map((b) => b.value), league);
  const w = (W - 2 * PAD) / Math.max(1, n);
  const bw = Math.min(22, w - 8);
  const cx = (i: number) => PAD + w * i + w / 2;
  const y0 = y(0);
  // The rolling line is drawn through each unbroken run of games that carry one.
  const runs: string[] = [];
  let cur: string[] = [];
  bars.forEach((b, i) => { if (b.rolling != null) cur.push(`${cx(i)},${y(b.rolling)}`); else { if (cur.length > 1) runs.push(cur.join(' ')); cur = []; } });
  if (cur.length > 1) runs.push(cur.join(' '));
  const key = (i: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); } };
  return (
    <div className="st-obs">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={label}>
        <defs><linearGradient id="st-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#eaf1f7" /><stop offset="1" stopColor="#8f9bab" /></linearGradient></defs>
        {league != null && <line x1={PAD} x2={W - PAD} y1={y(league)} y2={y(league)} stroke="rgba(255,255,255,.4)" strokeDasharray="5 4" />}
        {y0 > TOP && y0 < BOTTOM && <line x1={PAD} x2={W - PAD} y1={y0} y2={y0} stroke="rgba(255,255,255,.18)" />}
        {bars.map((b, i) => {
          const on = i === sel;
          const top = Math.min(y(b.value), y0), h = Math.max(2, Math.abs(y0 - y(b.value)));
          return (
            <g key={b.key} role="button" tabIndex={0} aria-label={b.aria} aria-pressed={on} data-obs={i} onClick={() => onSelect(i)} onKeyDown={key(i)} className="st-obs__col">
              <rect x={cx(i) - w / 2} y={0} width={w} height={H} fill="transparent" />
              <rect x={cx(i) - bw / 2} y={top} width={bw} height={h} rx={3.5} fill="url(#st-bar)" opacity={on ? 1 : 0.62} stroke={on ? 'var(--sift-cyan)' : 'none'} strokeWidth={2} />
              <text x={cx(i)} y={b.value >= 0 ? top - 4 : top + h + 11} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={on ? '#fff' : '#a4acb6'}>{b.text}</text>
            </g>
          );
        })}
        {runs.map((p) => <polyline key={p} points={p} fill="none" stroke="#ffb27a" strokeWidth={1.8} strokeLinejoin="round" pointerEvents="none" />)}
      </svg>
      {under && <div className="st-obs__under" style={{ margin: `0 ${(PAD / W) * 100}%` }}>{under.map((u, i) => <span key={bars[i]?.key ?? i} className={i === sel ? 'st-on' : undefined}>{u}</span>)}</div>}
    </div>
  );
}
