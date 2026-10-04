// The whole comparison universe on one value axis: every team a muted dot, the team you are reading
// the signal, its opponent gold, league mean and median ticked. "Sift" in one line: context muted,
// signal lit. Dots are links (tab-reachable); values, not ranks, so clusters and outliers are visible.
import { scaleLinear } from 'd3-scale';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { RankingEntry } from '../contract/types';
import { useWidth } from './useWidth';

export function DotStrip({ entries, focusId, oppId, mean, median, format, hrefFor, higherIsBetter, caption }: {
  entries: RankingEntry[];
  focusId?: string | null;
  oppId?: string | null;
  mean: number | null;
  median: number | null;
  format: (v: number | null) => string;
  hrefFor: (e: RankingEntry) => string | null;
  higherIsBetter: boolean | null;
  caption: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nav = useNavigate();
  const [hover, setHover] = useState<RankingEntry | null>(null);
  const vals = entries.map((e) => e.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // Best on the right, always: flip the axis when lower is better.
  const range: [number, number] = higherIsBetter === false ? [width - 18, 18] : [18, width - 18];
  const x = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range(range);
  const H = 74;
  // Light vertical jitter by rank parity keeps near-ties distinguishable without a force layout.
  const yOf = (i: number) => 30 + ((i % 3) - 1) * 7;
  const show = hover ?? entries.find((e) => e.entity_id === focusId) ?? null;
  const ordered = [...entries].sort((a, b) => {
    const r = (e: RankingEntry) => (e.entity_id === focusId ? 2 : e.entity_id === oppId ? 1 : 0);
    return r(a) - r(b);
  });
  return (
    <figure className="dotstrip">
      <div ref={ref}>
        <svg width={width} height={H} role="img" aria-label={caption}>
          <line x1={18} x2={width - 18} y1={30} y2={30} className="ax-grid" />
          {mean != null && <line x1={x(mean)} x2={x(mean)} y1={12} y2={48} className="dotstrip__mean" />}
          {median != null && <line x1={x(median)} x2={x(median)} y1={16} y2={44} className="dotstrip__median" />}
          {ordered.map((e) => {
            if (e.value == null) return null;
            const role = e.entity_id === focusId ? 'focus' : e.entity_id === oppId ? 'opp' : 'context';
            const i = entries.indexOf(e);
            const href = hrefFor(e);
            return (
              <circle
                key={e.entity_id}
                cx={x(e.value)} cy={role === 'context' ? yOf(i) : 30} r={role === 'context' ? 5 : 7.5}
                className={`dotstrip__dot dotstrip__dot--${role}`}
                tabIndex={href ? 0 : -1}
                role={href ? 'link' : undefined}
                aria-label={`${e.display_name}: ${format(e.value)}, rank ${e.rank}`}
                onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(e)} onBlur={() => setHover(null)}
                onClick={() => href && nav(href)}
                onKeyDown={(ev) => ev.key === 'Enter' && href && nav(href)}
              />
            );
          })}
          <text x={18} y={H - 6} className="ax-tick">{higherIsBetter === false ? 'worst' : 'lowest'} · {format(higherIsBetter === false ? hi : lo)}</text>
          <text x={width - 18} y={H - 6} className="ax-tick" textAnchor="end">{higherIsBetter === false ? 'best' : 'highest'} · {format(higherIsBetter === false ? lo : hi)}</text>
        </svg>
      </div>
      <figcaption className="dotstrip__cap">
        {show ? (
          <span><b>{show.display_name}</b> · {format(show.value)} · rank {show.rank}</span>
        ) : (
          <span className="muted">Hover or focus a dot</span>
        )}
        <span className="trend__legend">
          {focusId && <span className="lg lg--focus">Viewing</span>}
          {oppId && <span className="lg lg--opp">Opponent</span>}
          <span className="lg lg--mean">Mean</span>
          <span className="lg lg--median">Median</span>
        </span>
      </figcaption>
    </figure>
  );
}
