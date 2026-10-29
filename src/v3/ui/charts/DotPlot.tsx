// The league dot plot (SD1, SD7): every team on the value axis, best on the right, the median dashed. The selected team is ringed in
// cyan, the next opponent dashed. Presentational: callers pass values already derived from a published ranking.
import { useMemo, type MouseEvent } from 'react';
import { nearestDot, swarmLayout } from '../../model/statDetail';

export interface DotPlotProps {
  teams: { code: string; v: number | null }[];
  higherIsBetter: boolean | null;
  median: number | null;
  sel: string | null;
  opp: string | null;
  fmt: (v: number | null) => string;
  /** Tap on a dot (the nearest one within reach): select that team in place. */
  onSelect?: (code: string) => void;
  label: string;
}

const W = 330, H = 74;

export function DotPlot({ teams, higherIsBetter, median, sel, opp, fmt, onSelect, label }: DotPlotProps) {
  const lay = useMemo(() => swarmLayout(teams, { higherIsBetter, w: W, h: H }), [teams, higherIsBetter]);
  const mx = median != null ? lay.x(median) : null;
  const left = higherIsBetter === false ? lay.hi : lay.lo, right = higherIsBetter === false ? lay.lo : lay.hi;
  const click = (e: MouseEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hit = nearestDot(lay.dots, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, 20);
    if (hit) onSelect(hit.code);
  };
  const plain = lay.dots.filter((d) => d.code !== sel && d.code !== opp);
  const o = lay.dots.find((d) => d.code === opp), s = lay.dots.find((d) => d.code === sel);
  return (
    <svg className="st-swm" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} onClick={click} data-dotplot>
      {mx != null && <line x1={mx} x2={mx} y1={6} y2={H - 16} stroke="rgba(255,255,255,.28)" strokeDasharray="3 3" />}
      {plain.map((d) => <circle key={d.code} data-dot={d.code} cx={d.cx} cy={d.cy} r={3.6} fill="#59626e" />)}
      {o && <circle data-dot={o.code} data-role="opp" cx={o.cx} cy={o.cy} r={5.4} fill="#0a0d11" stroke="#a4acb6" strokeWidth={1.6} strokeDasharray="2.6 2" />}
      {s && <><circle data-dot={s.code} data-role="sel" cx={s.cx} cy={s.cy} r={7.5} fill="#0a0d11" stroke="var(--sift-cyan)" strokeWidth={2.4} /><circle cx={s.cx} cy={s.cy} r={2.6} fill="var(--sift-cyan)" /></>}
      <text x={12} y={H - 3} fontSize={9.5} fill="var(--sift-dim)">worst {fmt(left)}</text>
      {mx != null && median != null && <text x={mx} y={H - 3} fontSize={9.5} fill="var(--sift-dim)" textAnchor="middle">median {fmt(median)}</text>}
      <text x={W - 12} y={H - 3} fontSize={9.5} fill="var(--sift-dim)" textAnchor="end">best {fmt(right)}</text>
    </svg>
  );
}
