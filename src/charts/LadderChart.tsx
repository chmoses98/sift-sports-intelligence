// One betting ladder (a stat's YES ≥ X rungs) as the curve it is: P(YES) by line. The market's
// bid–ask at each rung, the model's fair price at each rung (research evidence), and — when the
// repository simulated the stat — the simulated distribution's quantiles on the same x axis.
// Question it answers: where along the ladder do the market and the projection disagree?
import { scaleLinear } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWidth } from './useWidth';

export interface Rung {
  x: number;
  bid: number | null;
  ask: number | null;
  fair: number | null;
  href: string;
  ticker: string;
}

export interface Quantiles {
  p05?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p95?: number;
  mean?: number | null;
}

const M = { top: 14, right: 14, bottom: 30, left: 40 };

export function LadderChart({ rungs, quantiles, unit, title, selected, height = 230 }: { rungs: Rung[]; quantiles?: Quantiles | null; unit: string; title: string; selected?: string | null; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nav = useNavigate();
  const [hover, setHover] = useState<Rung | null>(null);
  const lane = quantiles ? 34 : 0;
  const plotH = height - lane;
  const geo = useMemo(() => {
    const xs = rungs.map((r) => r.x);
    if (quantiles?.p05 != null) xs.push(quantiles.p05);
    if (quantiles?.p95 != null) xs.push(quantiles.p95);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const pad = (hi - lo || 1) * 0.06;
    const x = scaleLinear().domain([lo - pad, hi + pad]).range([M.left, width - M.right]);
    const y = scaleLinear().domain([0, 1]).range([plotH - M.bottom, M.top]);
    const fairLine = d3line<Rung>().defined((r) => r.fair != null).x((r) => x(r.x)).y((r) => y(r.fair!))(rungs);
    const midLine = d3line<Rung>().defined((r) => r.bid != null && r.ask != null).x((r) => x(r.x)).y((r) => y((r.bid! + r.ask!) / 2))(rungs);
    return { x, y, fairLine, midLine };
  }, [rungs, quantiles, width, plotH]);
  const hasFair = rungs.some((r) => r.fair != null);
  const act = hover ?? rungs.find((r) => r.ticker === selected) ?? null;

  return (
    <figure className="ladder">
      <div ref={ref} className="ladder__plot">
        <svg width={width} height={height} role="img" aria-label={`${title}: ${rungs.length} rungs from ${rungs[0]?.x} to ${rungs[rungs.length - 1]?.x} ${unit}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} className={t === 0.5 ? 'ax-zero' : 'ax-grid'} />
              <text x={M.left - 6} y={geo.y(t)} className="ax-tick" textAnchor="end" dominantBaseline="middle">{t * 100}%</text>
            </g>
          ))}
          {geo.x.ticks(width < 480 ? 4 : 7).map((t) => (
            <text key={t} x={geo.x(t)} y={plotH - 10} className="ax-tick" textAnchor="middle">{t}</text>
          ))}
          <text x={width - M.right} y={plotH - 10} className="ax-label" textAnchor="end" dx={0} dy={-12}>{unit} ≥ X</text>
          {geo.midLine && <path d={geo.midLine} className="ladder__mid" />}
          {geo.fairLine && <path d={geo.fairLine} className="ladder__fair" />}
          {rungs.map((r) => {
            const cx = geo.x(r.x);
            const isAct = act?.ticker === r.ticker;
            return (
              <g key={r.ticker} className={`ladder__rung${isAct ? ' is-act' : ''}`}>
                {r.bid != null && r.ask != null && <line x1={cx} x2={cx} y1={geo.y(r.bid)} y2={geo.y(r.ask)} className="ladder__spread" />}
                {r.bid != null && r.ask != null && <circle cx={cx} cy={geo.y((r.bid + r.ask) / 2)} r={4.5} className="ladder__mkt" />}
                {r.fair != null && <rect x={cx - 4} y={geo.y(r.fair) - 4} width={8} height={8} className="ladder__fairpt" transform={`rotate(45 ${cx} ${geo.y(r.fair)})`} />}
                <rect
                  x={cx - 14} y={M.top} width={28} height={plotH - M.top - M.bottom} className="trend__hit"
                  onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} onClick={() => nav(r.href)}
                >
                  <title>{`${r.ticker}: ${unit} ≥ ${r.x}`}</title>
                </rect>
              </g>
            );
          })}
          {quantiles && (
            <g transform={`translate(0, ${plotH})`} className="ladder__dist">
              {quantiles.p05 != null && quantiles.p95 != null && <line x1={geo.x(quantiles.p05)} x2={geo.x(quantiles.p95)} y1={12} y2={12} className="dist__whisker" />}
              {quantiles.p25 != null && quantiles.p75 != null && <rect x={geo.x(quantiles.p25)} y={6} width={Math.max(2, geo.x(quantiles.p75) - geo.x(quantiles.p25))} height={12} rx={3} className="dist__box" />}
              {quantiles.p50 != null && <line x1={geo.x(quantiles.p50)} x2={geo.x(quantiles.p50)} y1={4} y2={20} className="dist__median" />}
              {quantiles.mean != null && <circle cx={geo.x(quantiles.mean)} cy={12} r={3.5} className="dist__mean" />}
              <text x={M.left} y={30} className="ax-label">Simulated range: 90% · 50% · median · ● mean (RESEARCH)</text>
            </g>
          )}
        </svg>
        {act && (
          <div className="ladder__readout" aria-live="polite">
            <b>{unit} ≥ {act.x}</b>
            <span>market <span className="num">{act.bid != null ? Math.round(act.bid * 1000) / 10 : '—'}/{act.ask != null ? Math.round(act.ask * 1000) / 10 : '—'}¢</span></span>
            {act.fair != null && <span>model fair <span className="num">{Math.round(act.fair * 1000) / 10}¢</span></span>}
          </div>
        )}
      </div>
      <figcaption className="trend__legend">
        <span className="lg lg--mkt">Market YES bid–ask · mid</span>
        {hasFair && <span className="lg lg--fairpt">Model fair P(YES) — evidence, not a bet</span>}
      </figcaption>
    </figure>
  );
}
