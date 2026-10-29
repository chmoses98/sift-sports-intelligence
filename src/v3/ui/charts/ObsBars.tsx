// Trend bars (SD2): one bar per game with its value on top, the rolling average as a line, the league level as a dashed rule, the
// selected observation outlined in cyan. The strip of opponent logos below shares the column geometry, so each logo sits under its bar.
//
// Selecting (the screen decides what that does to the address): the bars stay as slim as the locked design draws them, but the whole
// chart is one touch surface cut into N equal, gap-free columns, each as tall as the chart. A press previews the nearest column (the bar
// lights up and a readout names it), dragging sideways follows the finger, lifting commits, and a gesture the browser takes for a
// vertical page scroll cancels without selecting (`touch-action: pan-y`, see columnSelect.ts). The chart itself is a picture for
// pointers; its keyboard and screen-reader equivalent is the observation list under it (ObsList), which selects the same observation.
import { useRef, type ReactNode } from 'react';
import { useColumnSelect } from './columnSelect';

export interface ObsBar {
  key: string;
  value: number;
  rolling: number | null;
  /** The label above the bar (already formatted). */
  text: string;
  /** The short readout shown while a finger is down on this column ("Oct 12 · at GB · 13"). */
  tip: string;
}

const W = 338, H = 168, PAD = 4, TOP = 14, BOTTOM = H - 20;

export interface ObsBarsProps {
  bars: ObsBar[];
  /** The league's level for the statistic, drawn as a dashed rule; null draws none. */
  league: number | null;
  /** The column drawn as selected (the committed one, or the one under the finger while pressing). */
  sel: number;
  onSelect: (i: number) => void;
  /** The column a finger is down on (null when no finger is); the screen may show its details live. */
  onPreview?: (i: number | null) => void;
  /** The column being previewed, for the readout. */
  preview?: number | null;
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

export function ObsBars({ bars, league, sel, onSelect, onPreview, preview = null, under, label }: ObsBarsProps) {
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
  const svg = useRef<SVGSVGElement>(null);
  const touch = useColumnSelect({
    n,
    geometry: () => { const r = svg.current?.getBoundingClientRect(); return r && r.width ? { left: r.left, width: r.width, inset: (PAD / W) * r.width } : null; },
    onPreview: (i) => onPreview?.(i),
    onCommit: onSelect,
  });
  const tipAt = preview != null && bars[preview] ? Math.max(18, Math.min(82, (cx(preview) / W) * 100)) : null;
  return (
    <div className="st-obs" data-label={label}>
      <div className={`st-obs__plot${preview != null ? ' is-press' : ''}`} {...touch}>
      {tipAt != null && <div className="st-obs__tip" style={{ left: `${tipAt}%` }} aria-hidden="true" data-obs-tip>{bars[preview!].tip}</div>}
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true" focusable="false">
        <defs><linearGradient id="st-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#eaf1f7" /><stop offset="1" stopColor="#8f9bab" /></linearGradient></defs>
        {league != null && <line x1={PAD} x2={W - PAD} y1={y(league)} y2={y(league)} stroke="rgba(255,255,255,.4)" strokeDasharray="5 4" />}
        {y0 > TOP && y0 < BOTTOM && <line x1={PAD} x2={W - PAD} y1={y0} y2={y0} stroke="rgba(255,255,255,.18)" />}
        {bars.map((b, i) => {
          const on = i === sel;
          const top = Math.min(y(b.value), y0), h = Math.max(2, Math.abs(y0 - y(b.value)));
          return (
            <g key={b.key} data-obs={i} data-on={on} className="st-obs__col">
              {/* The column's hit area: the columns tile the chart edge to edge, so no point belongs to two of them. */}
              <rect data-obs-hit={i} x={i === 0 ? 0 : PAD + w * i} y={0} width={(i === n - 1 ? W : PAD + w * (i + 1)) - (i === 0 ? 0 : PAD + w * i)} height={H} fill={on && preview != null ? 'rgba(255,255,255,.07)' : 'transparent'} />
              <rect x={cx(i) - bw / 2} y={top} width={bw} height={h} rx={3.5} fill="url(#st-bar)" opacity={on ? 1 : 0.62} stroke={on ? 'var(--sift-cyan)' : 'none'} strokeWidth={2} />
              <text x={cx(i)} y={b.value >= 0 ? top - 4 : top + h + 11} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={on ? '#fff' : '#a4acb6'} pointerEvents="none">{b.text}</text>
            </g>
          );
        })}
        {runs.map((p) => <polyline key={p} points={p} fill="none" stroke="#ffb27a" strokeWidth={1.8} strokeLinejoin="round" pointerEvents="none" />)}
      </svg>
      </div>
      {under && <div className="st-obs__under" style={{ margin: `0 ${(PAD / W) * 100}%` }}>{under.map((u, i) => <span key={bars[i]?.key ?? i} className={i === sel ? 'st-on' : undefined}>{u}</span>)}</div>}
    </div>
  );
}
