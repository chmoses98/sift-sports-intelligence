// The broadcast-analytics visual kit (approved references 01–11, docs/design/VISUAL_REFERENCES.md): one family of
// lit glass cards, condensed display numerals, stat strips, ring gauges, rank-vs-rank bars and distributions, so
// every destination is built from the same parts instead of a new generic card each time.
//
// Data honesty is the caller's job and these parts make it easy to keep:
//  - Ring renders a share only; pass it a probability ONLY when the publication supplies one (never a script rank).
//  - Histogram draws counts the caller computed from real samples or published quantile bins; it never smooths,
//    extrapolates or invents a tail. Fewer than three bins renders an honest "not enough data" state.
//  - VsBar draws two published ranks against their universe; a missing rank renders as "unranked", never as a bar.
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';

export type FxTone = 'cyan' | 'gold' | 'green' | 'red' | 'violet' | 'muted' | 'home' | 'away';

/** A lit glass card with a condensed uppercase title row and an optional "view all" action. */
export function FxCard({
  title,
  icon,
  action,
  children,
  className,
  id,
  tone,
  as: Tag = 'section',
  sub,
}: {
  title?: ReactNode;
  icon?: string;
  action?: { to: string; label: string } | ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: FxTone;
  as?: 'section' | 'article' | 'div';
  sub?: ReactNode;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <Tag className={`fx-card${tone ? ` fx-card--${tone}` : ''}${className ? ` ${className}` : ''}`} id={id} aria-labelledby={title && hid ? hid : undefined}>
      {title != null && (
        <header className="fx-card__h">
          <h2 className="fx-card__t" id={hid}>
            {icon && <Icon name={icon} size={17} />}
            <span>{title}</span>
          </h2>
          {action && typeof action === 'object' && 'to' in (action as object) ? (
            <Link className="fx-card__a" to={(action as { to: string }).to}>
              {(action as { label: string }).label} <Icon name="arrowRight" size={13} />
            </Link>
          ) : (
            (action as ReactNode) ?? null
          )}
        </header>
      )}
      {sub != null && <p className="fx-card__sub">{sub}</p>}
      {children}
    </Tag>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** 0..1 fill for the accent bar under the value; omit for no bar. */
  bar?: number | null;
  tone?: FxTone;
  title?: string;
}

/**
 * The hero's broadcast stat strip: condensed numerals over a thin lit accent bar. `focusable` for a strip that can
 * scroll sideways (the phone hero): a scroll region must be reachable by keyboard (WCAG 2.1.1, axe
 * scrollable-region-focusable).
 */
export function StatStrip({ items, className, label, focusable }: { items: StatItem[]; className?: string; label: string; focusable?: boolean }) {
  if (!items.length) return null;
  return (
    <dl className={`fx-stats${className ? ` ${className}` : ''}`} aria-label={label} tabIndex={focusable ? 0 : undefined}>
      {items.map((s) => (
        <div key={s.label} className={`fx-stat${s.tone ? ` fx-stat--${s.tone}` : ''}`} title={s.title}>
          <dt className="fx-stat__l">{s.label}</dt>
          <dd className="fx-stat__v">{s.value}</dd>
          {s.sub != null && <dd className="fx-stat__s">{s.sub}</dd>}
          {s.bar != null && Number.isFinite(s.bar) && (
            <dd className="fx-stat__bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, Math.min(100, s.bar * 100))}%` }} />
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** A donut gauge for a share in [0, 1]. Only for sourced probabilities or real proportions. */
export function Ring({ value, label, tone = 'cyan', size = 64, children }: { value: number; label: string; tone?: FxTone; size?: number; children?: ReactNode }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <span className={`fx-ring fx-ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="fx-ring__track" />
        <circle cx="50" cy="50" r={r} className="fx-ring__val" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <span className="fx-ring__c">{children ?? `${Math.round(v * 100)}%`}</span>
    </span>
  );
}

/** Strength in [0, 1] from a rank (1 = best) within its universe. */
export function rankStrength(rank: number | null | undefined, of: number | null | undefined): number | null {
  if (rank == null || !of || of < 2) return null;
  return 1 - (rank - 1) / (of - 1);
}

/**
 * One offense against the defense it faces, as two published ranks: the left unit's bar grows from the centre to
 * the left, the right unit's to the right, each as long as its rank is strong. The stronger side is lit.
 */
export function VsBar({
  label,
  left,
  right,
  leftMark,
  rightMark,
}: {
  label: ReactNode;
  left: { rank: number | null; of: number | null; text?: string };
  right: { rank: number | null; of: number | null; text?: string };
  leftMark?: ReactNode;
  rightMark?: ReactNode;
}) {
  const ls = rankStrength(left.rank, left.of);
  const rs = rankStrength(right.rank, right.of);
  const lead = ls != null && rs != null ? (ls > rs + 0.08 ? 'l' : rs > ls + 0.08 ? 'r' : 'even') : 'none';
  const rk = (x: { rank: number | null; of: number | null }) => (x.rank != null ? `#${x.rank}` : '—');
  return (
    <div className={`fx-vs fx-vs--${lead}`}>
      <span className="fx-vs__side fx-vs__side--l">{leftMark}<b className="fx-vs__rk">{rk(left)}</b></span>
      <span className="fx-vs__mid">
        <span className="fx-vs__label">{label}</span>
        <span className="fx-vs__track" aria-hidden="true">
          <i className="fx-vs__l" style={{ width: `${(ls ?? 0) * 50}%` }} />
          <i className="fx-vs__r" style={{ width: `${(rs ?? 0) * 50}%` }} />
        </span>
        <span className="sr-only">{`${left.text ?? 'Left'} ${left.rank != null ? `ranked ${left.rank} of ${left.of}` : 'unranked'}; ${right.text ?? 'right'} ${right.rank != null ? `ranked ${right.rank} of ${right.of}` : 'unranked'}`}</span>
      </span>
      <span className="fx-vs__side fx-vs__side--r"><b className="fx-vs__rk">{rk(right)}</b>{rightMark}</span>
    </div>
  );
}

/** Bin real samples into equal-width bins between lo and hi (inclusive edges). Pure. */
export function binSamples(samples: number[], bins: number, lo?: number, hi?: number): { edges: number[]; counts: number[] } {
  const xs = samples.filter((x) => Number.isFinite(x));
  if (!xs.length || bins < 1) return { edges: [], counts: [] };
  const a = lo ?? Math.min(...xs);
  const b = hi ?? Math.max(...xs);
  const w = b > a ? (b - a) / bins : 1;
  const counts = Array.from({ length: bins }, () => 0);
  for (const x of xs) counts[Math.min(bins - 1, Math.max(0, Math.floor((x - a) / w)))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => a + i * w), counts };
}

/**
 * A distribution drawn from counts the caller binned from real data, with an optional marked value (the market
 * line). Bars at or above the marker are tinted, so "over" mass reads at a glance.
 */
export function Histogram({
  edges,
  counts,
  marker,
  label,
  height = 120,
  format = (v: number) => String(Math.round(v * 10) / 10),
  ticks = 4,
  className,
}: {
  edges: number[];
  counts: number[];
  marker?: { value: number; label: string } | null;
  label: string;
  height?: number;
  format?: (v: number) => string;
  ticks?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  if (counts.length < 3 || edges.length !== counts.length + 1) return <p className="fx-hist__none muted small">Not enough observed data to draw a distribution.</p>;
  const W = 400;
  const H = height;
  const P = 18;
  const lo = edges[0];
  const hi = edges[edges.length - 1];
  const x = (v: number) => P + ((v - lo) / (hi - lo || 1)) * (W - 2 * P);
  const max = Math.max(...counts, 1);
  const bw = (W - 2 * P) / counts.length;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);
  return (
    <figure className={`fx-hist${className ? ` ${className}` : ''}`}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`${uid}u`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fb8ff" /><stop offset="1" stopColor="#1e5fd0" stopOpacity="0.55" /></linearGradient>
          <linearGradient id={`${uid}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c08bff" /><stop offset="1" stopColor="#7a3fd8" stopOpacity="0.55" /></linearGradient>
        </defs>
        <line x1={P} x2={W - P} y1={H} y2={H} className="fx-hist__axis" />
        {counts.map((c, i) => {
          const h = (c / max) * (H - 14);
          const over = marker != null && edges[i] >= marker.value;
          return <rect key={i} x={P + i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={1.5} fill={over ? `url(#${uid}o)` : `url(#${uid}u)`} data-over={over || undefined} />;
        })}
        {tickVals.map((t) => (
          <text key={t} x={x(t)} y={H + 16} textAnchor="middle" className="fx-hist__t">{format(t)}</text>
        ))}
        {marker && marker.value >= lo && marker.value <= hi && (
          <g className="fx-hist__mk">
            <line x1={x(marker.value)} x2={x(marker.value)} y1={4} y2={H} />
            <text x={x(marker.value)} y={11} textAnchor={x(marker.value) > W - 60 ? 'end' : 'middle'}>{marker.label}</text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Illuminated icon tabs (game sections, hubs). Links, so every tab is a direct, shareable URL. */
export function IconTabs({ items, label, className }: { items: { to: string; label: string; icon?: string; current?: boolean; badge?: ReactNode }[]; label: string; className?: string }) {
  return (
    <nav className={`fx-tabs${className ? ` ${className}` : ''}`} aria-label={label}>
      {items.map((t) => (
        <Link key={t.to} to={t.to} className="fx-tab" aria-current={t.current ? 'page' : undefined}>
          {t.icon && <Icon name={t.icon} size={16} />}
          <span>{t.label}</span>
          {t.badge != null && <span className="fx-tab__b">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A small up/down/flat chip for a published change. */
export function Delta({ value, format = (v: number) => v.toFixed(1), suffix = '' }: { value: number | null | undefined; format?: (v: number) => string; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="fx-delta fx-delta--flat">—</span>;
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return <span className={`fx-delta fx-delta--${dir}`}>{value > 0 ? '+' : value < 0 ? '−' : ''}{format(Math.abs(value))}{suffix}</span>;
}
