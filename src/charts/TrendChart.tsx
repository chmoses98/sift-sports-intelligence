// A per-game time series: one column per game (diverging around zero when the metric can be
// negative), the published trailing mean as a 2px line, season boundaries, and a selectable point.
// Selecting a point (tap, click, or ←/→ when focused) opens its detail: date, opponent, value,
// rolling value, and the links into that game and that opponent. The chart is navigation.
import { scaleBand, scaleLinear } from 'd3-scale';
import { line as d3line } from 'd3-shape';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SeriesPoint } from '../contract/types';
import { shortDate } from '../lib/format';
import { useWidth } from './useWidth';

export interface TrendChartProps {
  points: SeriesPoint[];
  format: (v: number | null) => string;
  unit: string;
  rollingWindow: number | null;
  title: string;
  opponentLabel: (id: string | null) => string;
  outcome?: (p: SeriesPoint) => 'W' | 'L' | 'T' | null;
  selectedX?: string | null;
  onSelect?: (p: SeriesPoint) => void;
  renderDetail?: (p: SeriesPoint) => ReactNode;
  height?: number;
}

const M = { top: 14, right: 12, bottom: 30, left: 44 };

export function TrendChart({ points, format, unit, rollingWindow, title, opponentLabel, outcome, selectedX, onSelect, renderDetail, height = 220 }: TrendChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<string | null>(selectedX ?? (points.length ? points[points.length - 1].x : null));
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ?? sel;

  const geo = useMemo(() => {
    const vals = points.flatMap((p) => [p.value, p.rolling_value]).filter((v): v is number => v != null);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const y = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice(4).range([height - M.bottom, M.top]);
    const x = scaleBand<string>().domain(points.map((p) => p.x)).range([M.left, width - M.right]).paddingInner(0.28).paddingOuter(0.1);
    const seasons: { label: string; x0: number; x1: number }[] = [];
    for (const p of points) {
      const s = p.x.slice(0, 4);
      const px = x(p.x) ?? 0;
      const last = seasons[seasons.length - 1];
      if (!last || last.label !== s) seasons.push({ label: s, x0: px, x1: px + x.bandwidth() });
      else last.x1 = px + x.bandwidth();
    }
    const roll = d3line<SeriesPoint>()
      .defined((p) => p.rolling_value != null)
      .x((p) => (x(p.x) ?? 0) + x.bandwidth() / 2)
      .y((p) => y(p.rolling_value ?? 0))(points);
    return { x, y, seasons, roll };
  }, [points, width, height]);

  const idx = points.findIndex((p) => p.x === active);
  const activePt = idx >= 0 ? points[idx] : null;
  const selPt = points.find((p) => p.x === sel) ?? null;

  const choose = (p: SeriesPoint) => {
    setSel(p.x);
    onSelect?.(p);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = points.findIndex((p) => p.x === sel);
    if (e.key === 'ArrowRight' && i < points.length - 1) choose(points[i + 1]);
    else if (e.key === 'ArrowLeft' && i > 0) choose(points[i - 1]);
    else return;
    e.preventDefault();
  };

  const bw = Math.min(24, geo.x.bandwidth());
  const y0 = geo.y(0);
  const ticks = geo.y.ticks(4);

  return (
    <figure className="trend">
      <div ref={ref} className="trend__plot" tabIndex={0} onKeyDown={onKey} role="group" aria-label={`${title}. Use left and right arrows to move between games.`}>
        <svg width={width} height={height} role="img" aria-label={`${title}: ${points.length} games`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} className={t === 0 ? 'ax-zero' : 'ax-grid'} />
              <text x={M.left - 6} y={geo.y(t)} className="ax-tick" textAnchor="end" dominantBaseline="middle">{format(t)}</text>
            </g>
          ))}
          {geo.seasons.map((s, i) => (
            <g key={s.label}>
              {i > 0 && <line x1={s.x0 - 3} x2={s.x0 - 3} y1={M.top} y2={height - M.bottom + 6} className="ax-season" />}
              <text x={(s.x0 + s.x1) / 2} y={height - 8} className="ax-tick" textAnchor="middle">{s.label}</text>
            </g>
          ))}
          {points.map((p) => {
            const cx = (geo.x(p.x) ?? 0) + geo.x.bandwidth() / 2;
            const v = p.value ?? 0;
            const top = Math.min(geo.y(v), y0);
            const h = Math.max(1.5, Math.abs(geo.y(v) - y0));
            const o = outcome?.(p);
            const isSel = p.x === sel;
            const isAct = p.x === active;
            return (
              <g key={p.x}>
                <rect
                  x={cx - bw / 2} y={top} width={bw} height={h} rx={Math.min(4, bw / 2)}
                  className={`trend__col${o ? ' trend__col--' + o : ''}${isSel ? ' is-sel' : ''}${isAct ? ' is-act' : ''}${v < 0 ? ' is-neg' : ''}`}
                />
                <rect
                  x={(geo.x(p.x) ?? 0) - geo.x.step() * 0.14} y={M.top} width={geo.x.step()} height={height - M.top - M.bottom}
                  className="trend__hit"
                  onMouseEnter={() => setHover(p.x)} onMouseLeave={() => setHover(null)} onClick={() => choose(p)}
                >
                  <title>{`${shortDate(p.t)} vs ${opponentLabel(p.opponent_id)}: ${format(p.value)}`}</title>
                </rect>
              </g>
            );
          })}
          {geo.roll && <path d={geo.roll} className="trend__roll" />}
          {activePt && (
            <line
              x1={(geo.x(activePt.x) ?? 0) + geo.x.bandwidth() / 2} x2={(geo.x(activePt.x) ?? 0) + geo.x.bandwidth() / 2}
              y1={M.top} y2={height - M.bottom} className="trend__cross"
            />
          )}
        </svg>
        {activePt && (
          <div className="trend__tip" style={{ left: Math.min(width - 150, Math.max(4, (geo.x(activePt.x) ?? 0) - 60)) }} aria-hidden="true">
            <b>{shortDate(activePt.t)}</b> vs {opponentLabel(activePt.opponent_id)}
            <span className="num">{format(activePt.value)}</span>
          </div>
        )}
      </div>
      <figcaption className="trend__legend">
        <span className="lg lg--col">Per game ({unit})</span>
        {rollingWindow != null && <span className="lg lg--line">Trailing {rollingWindow}-game mean</span>}
        {outcome && <span className="lg lg--win">Win</span>}
        {outcome && <span className="lg lg--loss">Loss</span>}
      </figcaption>
      {selPt && renderDetail && <div className="trend__detail" aria-live="polite">{renderDetail(selPt)}</div>}
      <details className="tableview">
        <summary>Table view ({points.length} games)</summary>
        <table className="dtable">
          <thead><tr><th>Game</th><th>Date</th><th>Opponent</th><th className="r">Value</th><th className="r">Rolling</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.x}>
                <td><button type="button" className="linklike" onClick={() => choose(p)}>{gameName(p.x, p.t)}</button></td>
                <td>{shortDate(p.t)}</td>
                <td>{opponentLabel(p.opponent_id)}</td>
                <td className="r num">{format(p.value)}</td>
                <td className="r num">{format(p.rolling_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** "2025 · Wk 13" from an nflverse game id ("2025_13_MIN_SEA"); the date when the id has another shape. */
export function gameName(x: string, t: string): string {
  const m = /^(\d{4})_(\d{2})_/.exec(x);
  if (!m) return shortDate(t);
  const wk = Number(m[2]);
  return `${m[1]} · ${wk > 18 ? ({ 19: 'Wild Card', 20: 'Divisional', 21: 'Conference', 22: 'Super Bowl' } as Record<number, string>)[wk] ?? 'Playoffs' : `Wk ${wk}`}`;
}
