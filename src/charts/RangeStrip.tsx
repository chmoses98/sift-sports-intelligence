// A simulated quantity as a range: 90% interval (whisker), 50% interval (box), mean (dot), with the
// market's own centre for the same quantity marked so the two can be compared on one axis.
import { scaleLinear } from 'd3-scale';
import { useWidth } from './useWidth';

export interface RangeRow {
  label: string;
  mean: number | null;
  r50: [number, number] | null;
  r90: [number, number] | null;
  market?: number | null;
  format?: (v: number) => string;
}

const ROW_H = 54;
const M = { left: 12, right: 12 };

export function RangeStrip({ rows, caption }: { rows: RangeRow[]; caption: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <figure className="rangestrip" ref={ref as never}>
      <figcaption className="sr-only">{caption}</figcaption>
      {rows.map((r) => {
        const vals = [r.mean, r.market, ...(r.r90 ?? []), ...(r.r50 ?? [])].filter((v): v is number => v != null);
        if (!vals.length) return null;
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        const pad = (hi - lo || 1) * 0.08;
        const x = scaleLinear().domain([lo - pad, hi + pad]).range([M.left, width - M.right]);
        const f = r.format ?? ((v: number) => v.toFixed(1));
        return (
          <div key={r.label} className="rangestrip__row">
            <div className="rangestrip__label">
              <span>{r.label}</span>
              <span className="num">
                mean {r.mean != null ? f(r.mean) : '—'}
                {r.market != null && <span className="rangestrip__mkt"> · market {f(r.market)}</span>}
              </span>
            </div>
            <svg width={width} height={ROW_H - 20} role="img" aria-label={`${r.label}: mean ${r.mean}, 50% range ${r.r50?.join('–')}, 90% range ${r.r90?.join('–')}${r.market != null ? `, market centre ${r.market}` : ''}`}>
              {r.r90 && <line x1={x(r.r90[0])} x2={x(r.r90[1])} y1={14} y2={14} className="dist__whisker" />}
              {r.r50 && <rect x={x(r.r50[0])} y={7} width={Math.max(2, x(r.r50[1]) - x(r.r50[0]))} height={14} rx={3} className="dist__box" />}
              {r.mean != null && <circle cx={x(r.mean)} cy={14} r={4} className="dist__mean" />}
              {r.market != null && (
                <g>
                  <line x1={x(r.market)} x2={x(r.market)} y1={2} y2={26} className="dist__market" />
                </g>
              )}
              {r.r90 && (
                <>
                  <text x={x(r.r90[0])} y={33} className="ax-tick" textAnchor="middle">{f(r.r90[0])}</text>
                  <text x={x(r.r90[1])} y={33} className="ax-tick" textAnchor="middle">{f(r.r90[1])}</text>
                </>
              )}
            </svg>
          </div>
        );
      })}
      <div className="trend__legend" aria-hidden="true">
        <span className="lg lg--whisker">90% of simulations</span>
        <span className="lg lg--box">Middle 50%</span>
        <span className="lg lg--meandot">Simulated mean</span>
        <span className="lg lg--market">Market centre</span>
      </div>
    </figure>
  );
}
