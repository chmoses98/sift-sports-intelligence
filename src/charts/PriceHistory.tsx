// Kalshi price movement for one ticker: the YES bid–ask band as a 10% wash, the mid as a 2px step
// line (captures are change-suppressed: a price holds until the next capture), the model's current
// fair price as a reference line, and kickoff. Crosshair + readout on hover/tap.
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area as d3area, curveStepAfter, line as d3line } from 'd3-shape';
import { useMemo, useState } from 'react';
import type { HistoryPoint } from '../contract/types';
import { useWidth } from './useWidth';

const M = { top: 12, right: 14, bottom: 28, left: 40 };

interface Pt { t: number; bid: number | null; ask: number | null; mid: number | null; last: number | null; vol: number | null }

export function PriceHistory({ points, fair, kickoff, title, height = 220 }: { points: HistoryPoint[]; fair?: number | null; kickoff?: string | null; title: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Pt | null>(null);
  const data: Pt[] = useMemo(
    () =>
      points.map((p) => ({
        t: Date.parse(p.captured_at), bid: p.yes_bid, ask: p.yes_ask, last: p.last_price, vol: p.volume,
        mid: p.yes_bid != null && p.yes_ask != null ? (p.yes_bid + p.yes_ask) / 2 : p.last_price,
      })),
    [points],
  );
  const geo = useMemo(() => {
    const ts = data.map((d) => d.t);
    const ko = kickoff ? Date.parse(kickoff) : null;
    const t1 = Math.max(...ts, ...(ko && ko < Math.max(...ts) + 86400e3 * 3 ? [ko] : []));
    const x = scaleUtc().domain([Math.min(...ts), t1]).range([M.left, width - M.right]);
    const vals = data.flatMap((d) => [d.bid, d.ask, d.mid]).filter((v): v is number => v != null);
    if (fair != null) vals.push(fair);
    const lo = Math.max(0, Math.min(...vals) - 0.04);
    const hi = Math.min(1, Math.max(...vals) + 0.04);
    const y = scaleLinear().domain([lo, hi]).nice(4).range([height - M.bottom, M.top]);
    const band = d3area<Pt>().defined((d) => d.bid != null && d.ask != null).curve(curveStepAfter).x((d) => x(d.t)).y0((d) => y(d.bid!)).y1((d) => y(d.ask!))(data);
    const mid = d3line<Pt>().defined((d) => d.mid != null).curve(curveStepAfter).x((d) => x(d.t)).y((d) => y(d.mid!))(data);
    return { x, y, band, mid, ko };
  }, [data, width, height, fair, kickoff]);

  if (data.length < 2) return <p className="muted">Only {data.length} capture for this ticker — no movement to chart.</p>;
  const last = data[data.length - 1];
  const first = data[0];
  const ticks = geo.y.ticks(4);

  const onMove = (clientX: number, rectLeft: number) => {
    const t = geo.x.invert(clientX - rectLeft).getTime();
    let best = data[0];
    for (const d of data) if (d.t <= t) best = d;
    setHover(best);
  };

  return (
    <figure className="pricehist">
      <div ref={ref} className="pricehist__plot">
        <svg
          width={width} height={height} role="img"
          aria-label={`${title}: mid moved from ${Math.round((first.mid ?? 0) * 100)}¢ to ${Math.round((last.mid ?? 0) * 100)}¢ over ${data.length} captures`}
          onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect().left)}
          onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect().left)}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} className="ax-grid" />
              <text x={M.left - 6} y={geo.y(t)} className="ax-tick" textAnchor="end" dominantBaseline="middle">{Math.round(t * 100)}¢</text>
            </g>
          ))}
          {geo.x.ticks(width < 480 ? 3 : 6).map((t) => (
            <text key={+t} x={geo.x(t)} y={height - 8} className="ax-tick" textAnchor="middle">
              {t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          ))}
          {geo.band && <path d={geo.band} className="pricehist__band" />}
          {geo.mid && <path d={geo.mid} className="pricehist__mid" />}
          {fair != null && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={geo.y(fair)} y2={geo.y(fair)} className="pricehist__fair" />
              <text x={width - M.right} y={geo.y(fair) - 5} className="ax-label" textAnchor="end">model fair {Math.round(fair * 1000) / 10}¢ (research)</text>
            </g>
          )}
          {geo.ko != null && geo.ko <= geo.x.domain()[1].getTime() && (
            <g>
              <line x1={geo.x(geo.ko)} x2={geo.x(geo.ko)} y1={M.top} y2={height - M.bottom} className="pricehist__ko" />
              <text x={geo.x(geo.ko) - 4} y={M.top + 10} className="ax-label" textAnchor="end">kickoff</text>
            </g>
          )}
          <circle cx={geo.x(last.t)} cy={geo.y(last.mid ?? 0)} r={4.5} className="pricehist__end" />
          {hover && (
            <g>
              <line x1={geo.x(hover.t)} x2={geo.x(hover.t)} y1={M.top} y2={height - M.bottom} className="trend__cross" />
              <circle cx={geo.x(hover.t)} cy={geo.y(hover.mid ?? 0)} r={4.5} className="pricehist__end" />
            </g>
          )}
        </svg>
        <div className="pricehist__readout" aria-live="polite">
          {(() => {
            const d = hover ?? last;
            return (
              <>
                <b>{new Date(d.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b>
                <span>bid <span className="num">{d.bid != null ? Math.round(d.bid * 1000) / 10 : '—'}¢</span></span>
                <span>ask <span className="num">{d.ask != null ? Math.round(d.ask * 1000) / 10 : '—'}¢</span></span>
                {d.vol != null && <span>vol <span className="num">{Math.round(d.vol)}</span></span>}
              </>
            );
          })()}
        </div>
      </div>
      <figcaption className="trend__legend">
        <span className="lg lg--band">YES bid–ask</span>
        <span className="lg lg--line">Mid</span>
        {fair != null && <span className="lg lg--fair">Model fair (current, research)</span>}
      </figcaption>
    </figure>
  );
}
