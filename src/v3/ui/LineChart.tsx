import { useId } from 'react';

export interface Pt { key: string; label: string; y: number }

/** A responsive SVG line chart whose points are real observations. Taps pick the nearest point; the list under the chart is the accessible alternative. */
export function LineChart({ pts, fmt, sel, onSel, label }: { pts: Pt[]; fmt: (v: number) => string; sel: number | null; onSel: (i: number) => void; label: string }) {
  const id = useId();
  const W = 358, H = 210, L = 44, R = 14, T = 16, B = 30;
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const idxs = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, d = 1e9;
    pts.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < d) { d = dd; best = i; } });
    onSel(best);
  };
  const s = sel != null ? pts[sel] : null;
  return (
    <svg className="v3-lc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerDown={pick} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#19cde0" stopOpacity="0.28" /><stop offset="1" stopColor="#19cde0" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="v3-lc__grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="v3-lc__tick">{fmt(t)}</text></g>))}
      <path d={`${path} L${x(pts.length - 1)},${H - B} L${x(0)},${H - B} Z`} fill={`url(#${id}g)`} />
      <path d={path} className="v3-lc__line" />
      {pts.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.y)} r={sel === i ? 6 : 3.6} className={sel === i ? 'v3-lc__pt is-sel' : 'v3-lc__pt'} />)}
      {idxs.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="v3-lc__tick">{pts[i].label}</text>)}
      {s && sel != null && (() => { const cx = Math.min(W - 56, Math.max(L + 6, x(sel) - 28)); return (<g><rect x={cx} y={Math.max(0, y(s.y) - 38)} width="56" height="24" rx="6" className="v3-lc__tip" /><text x={cx + 28} y={Math.max(0, y(s.y) - 38) + 16} textAnchor="middle" className="v3-lc__tiptx">{fmt(s.y)}</text></g>); })()}
    </svg>
  );
}
