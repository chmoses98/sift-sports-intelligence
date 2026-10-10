// Research visuals for the prop, script and market surfaces (approved references 03–08), built on the fx kit.
//
// Data honesty, enforced here rather than left to each caller:
//  - QuantileDist draws ONLY published quantiles. The publication ships five quantiles per simulated stat (5th, 25th,
//    50th, 75th, 95th), not the simulation's samples, so the chart is the exact piecewise-uniform reading of those
//    quantiles: each block holds the share of simulated games the publication places between two quantiles, spread
//    evenly across that span. Nothing is smoothed into a bell curve, no tail beyond the outer quantiles is invented
//    (the 5% beyond each end is written, not drawn), and no probability is read off the area.
//  - MarginMap places scripts on the final-margin axis they are defined by, over the simulation's own published
//    margin bands. It is not a score-flow chart: score-state paths are not simulated, and the chart says so.
//  - FreshChip states a quote's age with the shared freshness rules (src/live/freshness.ts); it never upgrades one.
import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { formatQuoteAge, quoteAgeMs, quoteFreshness } from '../live/freshness';

export interface QPoint {
  /** Cumulative share in [0, 1] (0.05 for the 5th percentile). */
  p: number;
  v: number;
}

/** Five published quantiles (p05..p95) as points, or null when any is missing. */
export function quantilePoints(q: { p05?: number | null; p25?: number | null; p50?: number | null; p75?: number | null; p95?: number | null } | null | undefined): QPoint[] | null {
  if (!q) return null;
  const pts: [number, number | null | undefined][] = [[0.05, q.p05], [0.25, q.p25], [0.5, q.p50], [0.75, q.p75], [0.95, q.p95]];
  const out = pts.filter((x): x is [number, number] => x[1] != null && Number.isFinite(x[1])).map(([p, v]) => ({ p, v }));
  return out.length >= 3 ? out : null;
}

/**
 * Equal-width bins between the outer quantiles, each holding the share of simulated games the published quantiles
 * place in it (piecewise-uniform between adjacent quantiles; a zero-width span is a point mass in its bin). Pure.
 * Returns null when the spread is too narrow to draw honestly (fewer than `minSpan` units between the outer quantiles).
 */
export function quantileMass(points: QPoint[], bins: number, minSpan = 3): { edges: number[]; mass: number[] } | null {
  const qs = [...points].sort((a, b) => a.p - b.p);
  if (qs.length < 3 || bins < 3) return null;
  const lo = qs[0].v;
  const hi = qs[qs.length - 1].v;
  if (!(hi - lo >= minSpan)) return null;
  for (let i = 1; i < qs.length; i++) if (qs[i].v < qs[i - 1].v) return null;
  const w = (hi - lo) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + i * w);
  const mass = Array.from({ length: bins }, () => 0);
  for (let i = 0; i < qs.length - 1; i++) {
    const a = qs[i].v;
    const b = qs[i + 1].v;
    const m = qs[i + 1].p - qs[i].p;
    if (b <= a) {
      mass[Math.min(bins - 1, Math.max(0, Math.floor((a - lo) / w)))] += m;
      continue;
    }
    for (let k = 0; k < bins; k++) {
      const o = Math.min(b, edges[k + 1]) - Math.max(a, edges[k]);
      if (o > 0) mass[k] += (m * o) / (b - a);
    }
  }
  return { edges, mass };
}

/**
 * A distribution from published quantiles, with the market line and the projection marked. Bars at or beyond the
 * line are tinted so the over side reads at a glance; the tint is not a probability.
 */
export function QuantileDist({
  points,
  line,
  projection,
  label,
  format = (v: number) => String(Math.round(v)),
  bins = 28,
  height = 200,
  unit,
  minSpan,
  className,
  compact,
}: {
  points: QPoint[] | null;
  line?: number | null;
  projection?: number | null;
  label: string;
  format?: (v: number) => string;
  bins?: number;
  height?: number;
  unit?: string;
  minSpan?: number;
  className?: string;
  /** Card size: no caption and no tail notes (the caption lives once on the page). */
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const qm = points ? quantileMass(points, bins, minSpan) : null;
  if (!points || !qm) {
    if (compact) return null;
    return (
      <div className="frd frd--none" role="note">
        <span className="frd__none-h">{points ? 'Range too narrow to draw' : 'No published distribution'}</span>
        <span className="frd__none-p">
          {points
            ? `The simulation places this stat between ${format(points[0].v)} and ${format(points[points.length - 1].v)}${unit ? ` ${unit}` : ''} in nine of ten games: too narrow a spread for a distribution chart.`
            : 'The publication does not simulate this stat, so Sift draws no distribution rather than inventing one.'}
        </span>
      </div>
    );
  }
  const { edges, mass } = qm;
  const W = 520;
  const H = height;
  const PX = 20;
  const top = 30;
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  // A little room either side so markers outside the 90% range still land on the axis.
  const pad = (hi - lo) * 0.06;
  const dlo = Math.min(lo - pad, line != null ? line - pad : Infinity, projection != null ? projection - pad : Infinity);
  const dhi = Math.max(hi + pad, line != null ? line + pad : -Infinity, projection != null ? projection + pad : -Infinity);
  const x = (v: number) => PX + ((v - dlo) / (dhi - dlo || 1)) * (W - 2 * PX);
  const max = Math.max(...mass, 1e-9);
  const ticks = niceTicks(dlo, dhi, 5);
  const q = (p: number) => points.find((pt) => Math.abs(pt.p - p) < 1e-6)?.v ?? null;
  const p25 = q(0.25);
  const p75 = q(0.75);
  const desc = `Middle half of simulated games ${p25 != null && p75 != null ? `${format(p25)} to ${format(p75)}` : 'not published'}; nine in ten between ${format(lo)} and ${format(hi)}${unit ? ` ${unit}` : ''}.${projection != null ? ` Projection ${format(projection)}.` : ''}${line != null ? ` Market line ${format(line)}.` : ''}`;
  const lineX = line != null ? x(line) : null;
  const projX = projection != null ? x(projection) : null;
  const near = lineX != null && projX != null && Math.abs(lineX - projX) < 80;
  return (
    <figure className={`frd${compact ? ' frd--compact' : ''}${className ? ` ${className}` : ''}`}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`${label}. ${desc}`}>
        <defs>
          <linearGradient id={`${uid}u`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6cc4ff" /><stop offset="1" stopColor="#1f5fd6" stopOpacity="0.5" /></linearGradient>
          <linearGradient id={`${uid}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d48cff" /><stop offset="1" stopColor="#7d3ad8" stopOpacity="0.5" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={PX} x2={W - PX} y1={H - (H - top) * g} y2={H - (H - top) * g} className="frd__grid" />)}
        <line x1={PX} x2={W - PX} y1={H} y2={H} className="frd__axis" />
        {p25 != null && p75 != null && <rect x={x(p25)} y={H + 1} width={Math.max(1, x(p75) - x(p25))} height={3} className="frd__mid" />}
        {mass.map((m, i) => {
          const bx = x(edges[i]);
          const bw = x(edges[i + 1]) - bx;
          const h = (m / max) * (H - top);
          const over = line != null && edges[i] >= line;
          return <rect key={i} x={bx + 0.8} y={H - h} width={Math.max(1, bw - 1.6)} height={h} rx={1.5} fill={`url(#${uid}${over ? 'o' : 'u'})`} />;
        })}
        {ticks.map((t) => <text key={t} x={x(t)} y={H + 20} textAnchor="middle" className="frd__t">{format(t)}</text>)}
        {!compact && <text x={x(lo)} y={top - 10} textAnchor="start" className="frd__tail">5% below</text>}
        {!compact && <text x={x(hi)} y={top - 10} textAnchor="end" className="frd__tail">5% above</text>}
        {projX != null && (
          <g className="frd__proj">
            <line x1={projX} x2={projX} y1={top - 2} y2={H} />
            <circle cx={projX} cy={top - 2} r={4} />
            <text x={projX + (near && lineX! > projX ? -6 : 6)} y={top + 14} textAnchor={near && lineX! > projX ? 'end' : 'start'}>Proj {format(projection!)}</text>
          </g>
        )}
        {lineX != null && (
          <g className="frd__line">
            <line x1={lineX} x2={lineX} y1={top - 6} y2={H} />
            <text x={lineX + (near && projX! >= lineX ? -6 : 6)} y={top + 36} textAnchor={near && projX! >= lineX ? 'end' : 'start'}>Line {String(line)}</text>
          </g>
        )}
      </svg>
      {!compact && <figcaption className="frd__cap">Drawn from the five published quantiles (5th · 25th · 50th · 75th · 95th): each block is the share of simulated games between two quantiles. Samples are not published.</figcaption>}
    </figure>
  );
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** A quote's age, by the shared freshness rules. */
export function FreshChip({ at, now, label = 'Quote' }: { at: string | null | undefined; now: number; label?: string }) {
  const f = quoteFreshness(at ?? null, now);
  const age = quoteAgeMs(at ?? null, now);
  const word = f === 'FRESH' ? 'fresh' : f === 'AGING' ? 'aging' : f === 'STALE' ? 'stale' : 'age unknown';
  return (
    <span className={`frfresh frfresh--${f.toLowerCase()}`} title={`${label} ${age != null ? `${formatQuoteAge(age)} old` : 'time unknown'} (${word})`}>
      <i aria-hidden="true" />
      {label} {age != null ? `${formatQuoteAge(age)} ago` : 'time unknown'}
      <span className="sr-only"> ({word})</span>
    </span>
  );
}

/** An honest capability state: what this surface needs, what is published, and what is not (yet). */
export function CapabilityState({ title, children, icon = 'info', tone = 'muted', action }: { title: ReactNode; children: ReactNode; icon?: string; tone?: 'muted' | 'gold' | 'cyan'; action?: ReactNode }) {
  return (
    <div className={`frcap frcap--${tone}`} role="note">
      <span className="frcap__ic" aria-hidden="true"><Icon name={icon} size={18} /></span>
      <div className="frcap__b">
        <b className="frcap__t">{title}</b>
        <div className="frcap__p">{children}</div>
        {action && <div className="frcap__a">{action}</div>}
      </div>
    </div>
  );
}

export interface MarginSeg {
  key: string;
  /** Home final margin, inclusive integers; null = open-ended. */
  lo: number | null;
  hi: number | null;
  /** Script identity colour 1..4. */
  tone: 1 | 2 | 3 | 4;
  label: string;
  on?: boolean;
  dim?: boolean;
}

/**
 * Scripts on the final-margin axis, from the away side's big win (left) to the home side's (right), over the
 * simulation's published margin bands (middle half and nine in ten) and mean. Each script is defined by a margin
 * range, so this is exactly what separates them; it is not a score-flow chart.
 */
export function MarginMap({
  segs,
  band,
  homeAbbr,
  awayAbbr,
  label,
  span = 35,
  bandNote,
}: {
  segs: MarginSeg[];
  band?: { mean: number | null; r50: [number, number] | null; r90: [number, number] | null } | null;
  homeAbbr: string;
  awayAbbr: string;
  label: string;
  span?: number;
  bandNote?: string;
}) {
  const W = 420;
  const PX = 12;
  const x = (v: number) => PX + ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * (W - 2 * PX);
  const rows = segs.length;
  const RH = 22;
  const top = band ? 46 : 14;
  const H = top + rows * (RH + 8) + 26;
  const ticks = [-28, -14, 0, 14, 28].filter((t) => Math.abs(t) <= span);
  const desc = segs.map((s) => `${s.label}: ${marginWords(s.lo, s.hi, homeAbbr, awayAbbr)}`).join('; ');
  return (
    <figure className="frmm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${desc}.${band?.r50 ? ` Simulated ${homeAbbr} margin: middle half ${band.r50[0]} to ${band.r50[1]}.` : ''}`}>
        <line x1={x(0)} x2={x(0)} y1={6} y2={H - 22} className="frmm__zero" />
        {band?.r90 && <rect x={x(band.r90[0])} y={14} width={x(band.r90[1]) - x(band.r90[0])} height={14} rx={7} className="frmm__r90" />}
        {band?.r50 && <rect x={x(band.r50[0])} y={14} width={x(band.r50[1]) - x(band.r50[0])} height={14} rx={7} className="frmm__r50" />}
        {band?.mean != null && <circle cx={x(band.mean)} cy={21} r={5} className="frmm__mean" />}
        {band && <text x={PX} y={42} className="frmm__cap">{bandNote ?? `Simulated ${homeAbbr} final margin: middle half (bright) and nine in ten (faint)`}</text>}
        {segs.map((s, i) => {
          const y = top + i * (RH + 8);
          const a = x(s.lo ?? -span);
          const b = x(s.hi ?? span);
          return (
            <g key={s.key} className={`frmm__seg frmm__seg--s${s.tone}${s.on ? ' is-on' : ''}${s.dim ? ' is-dim' : ''}`}>
              <rect x={a} y={y} width={Math.max(4, b - a)} height={RH} rx={6} />
              {(() => {
                const need = s.label.length * 6.6 + 10;
                if (b - a >= need) return <text x={(a + b) / 2} y={y + RH / 2 + 4} textAnchor="middle">{s.label}</text>;
                const right = W - PX - b >= need;
                return <text x={right ? b + 6 : a - 6} y={y + RH / 2 + 4} textAnchor={right ? 'start' : 'end'} className="frmm__out">{s.label}</text>;
              })()}
            </g>
          );
        })}
        {ticks.map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="frmm__t">{t === 0 ? 'Tie' : t > 0 ? `${homeAbbr} +${t}` : `${awayAbbr} +${-t}`}</text>)}
      </svg>
    </figure>
  );
}

function marginWords(lo: number | null, hi: number | null, home: string, away: string): string {
  if (lo != null && lo >= 0) return hi == null ? `${home} by ${Math.max(1, lo)} or more` : `${home} by ${Math.max(1, lo)} to ${hi}`;
  if (hi != null && hi <= 0) return lo == null ? `${away} by ${Math.max(1, -hi)} or more` : `${away} by ${Math.max(1, -hi)} to ${-lo}`;
  return `within ${Math.max(Math.abs(lo ?? 0), Math.abs(hi ?? 0))} either way`;
}

/** A horizontal share bar (0..1) in a script's identity colour. Only for published shares. */
export function ShareBar({ value, tone, label }: { value: number; tone: 1 | 2 | 3 | 4; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`frbar frbar--s${tone}`} role="img" aria-label={label}>
      <i style={{ width: `${Math.max(2, v * 100)}%` }} />
    </span>
  );
}
