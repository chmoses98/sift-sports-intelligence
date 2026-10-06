// A compact multi-series price chart (YES midpoint in cents over time) for the game overview's line
// history: 2 px step lines (captures hold until the next one), a recessive grid, one shared y axis,
// a legend above, and a crosshair readout on hover / tap. Series colours are Sift's validated chart
// marks; text stays in text tokens.
import { scaleLinear, scaleUtc } from 'd3-scale';
import { curveStepAfter, line as d3line } from 'd3-shape';
import { useMemo, useState } from 'react';
import { useWidth } from './useWidth';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { t: number; v: number }[];
}

const M = { top: 10, right: 12, bottom: 22, left: 34 };

function valueAt(pts: { t: number; v: number }[], t: number): number | null {
  let out: number | null = null;
  for (const p of pts) {
    if (p.t > t) break;
    out = p.v;
  }
  return out;
}

const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtWhen = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function MiniLines({ series, height = 160, summary }: { series: LineSeries[]; height?: number; summary: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(360);
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length < 2) return null;
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    const x = scaleUtc().domain([t0, t1]).range([M.left, width - M.right]);
    const vs = all.map((p) => p.v);
    const y = scaleLinear().domain([Math.max(0, Math.min(...vs) - 0.05), Math.min(1, Math.max(...vs) + 0.05)]).nice(3).range([height - M.bottom, M.top]);
    const paths = series.map((s) => ({ s, d: d3line<{ t: number; v: number }>().curve(curveStepAfter).x((p) => x(p.t)).y((p) => y(p.v))([...s.points, ...(s.points.length ? [{ t: t1, v: s.points[s.points.length - 1].v }] : [])]) }));
    const xt = x.ticks(Math.max(2, Math.min(5, Math.floor(width / 110))));
    return { x, y, paths, xt, t0, t1 };
  }, [series, width, height]);

  if (!geo) return <p className="muted small">Not enough captures to chart.</p>;
  const { x, y, paths, xt } = geo;
  const hv = hover != null ? series.map((s) => ({ s, v: valueAt(s.points, hover) })) : null;
  const tipLeft = hover != null ? Math.min(Math.max(x(hover) - 80, 0), width - 170) : 0;
  return (
    <div className="minilines" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={summary}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const t = x.invert(e.clientX - r.left).getTime();
          setHover(Math.min(Math.max(t, geo.t0), geo.t1));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {y.ticks(3).map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="ax-grid" />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="ax-tick">{Math.round(v * 100)}¢</text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={+t} x={x(t)} y={height - 6} textAnchor="middle" className="ax-tick">{fmtDay(+t)}</text>
        ))}
        {paths.map(({ s, d }) => d && <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />)}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={height - M.bottom} className="ax-cross" />
            {hv!.map(({ s, v }) => v != null && <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--panel-solid)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="minilines__tip" style={{ left: tipLeft }} aria-hidden="true">
          <div className="minilines__when">{fmtWhen(hover)}</div>
          {hv!.map(({ s, v }) => (
            <div key={s.key} className="minilines__row"><i style={{ background: s.color }} />{s.label}<b>{v != null ? `${Math.round(v * 100)}¢` : '—'}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
