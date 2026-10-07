// CBB visual pieces. Every mark draws a value the CBB publication already carries (a projection row, its
// archived model ranges, a roster-truth minutes split, a published national rank); nothing here computes a
// rating, an edge or a pick. Identity: real school logos committed under public/teams/cbb (lazy, never
// fetched from a third party at runtime) with a monogram in the school's colors as the fallback. Names are
// always written next to a mark and every bar carries its number, so color is never the only signal.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { fmt1, marginWords } from './data';
import { accent, identity } from './identity';

// ------------------------------------------------------------------ identity

export function TeamLogo({ pid, size = 32, abbr, className }: { pid: string | null | undefined; size?: number; abbr?: string | null; className?: string }) {
  const t = identity(pid);
  const [broken, setBroken] = useState(false);
  const style = { '--lg': `${size}px`, '--tc': accent(t) } as CSSProperties;
  const cls = `clogo${className ? ` ${className}` : ''}`;
  if (t?.logo && !broken) {
    return (
      <span className={cls} style={style} aria-hidden="true">
        <img src={t.logo} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
      </span>
    );
  }
  const text = (t?.abbr ?? abbr ?? '?').slice(0, 4);
  return (
    <span className={`${cls} clogo--mono`} style={style} aria-hidden="true">
      <span className="clogo__m" style={{ fontSize: `${Math.max(8, size * (text.length > 3 ? 0.27 : 0.34))}px` }}>{text}</span>
    </span>
  );
}

// ------------------------------------------------------------------ win probability

/** The model's win probability as one split bar: each side labelled with its team and number. */
export function WinSplit({ pHome, away, home, colors }: { pHome: number; away: string; home: string; colors: [string, string] }) {
  const h = Math.round(pHome * 100);
  const a = 100 - h;
  return (
    <figure className="cwin" aria-label={`Model win probability: ${away} ${a}%, ${home} ${h}%`}>
      <div className="cwin__lbl" aria-hidden="true">
        <span><b className="num">{a}%</b> {away}</span>
        <span className="cwin__cap">win probability</span>
        <span>{home} <b className="num">{h}%</b></span>
      </div>
      <div className="cwin__bar" aria-hidden="true">
        <span style={{ width: `${a}%`, background: colors[0] }} />
        <span style={{ width: `${h}%`, background: colors[1] }} />
      </div>
    </figure>
  );
}

// ------------------------------------------------------------------ model uncertainty axes

function niceStep(span: number): number {
  return span > 60 ? 20 : span > 30 ? 10 : 5;
}

/**
 * The frozen model's margin distribution on one axis: the point projection, its 50% and 80% ranges, and
 * "Even" at zero. The axis reads away-side to the left and home-side to the right, with both ends named.
 */
export function MarginAxis({ margin, r50, r80, away, home, compact }: { margin: number; r50: [number, number] | null; r80: [number, number] | null; away: string; home: string; compact?: boolean }) {
  const ext = Math.max(Math.abs(margin), ...(r80 ?? r50 ?? [0]).map(Math.abs), 4);
  const step = niceStep(ext * 2);
  const lim = Math.ceil((ext + 1) / step) * step;
  const x = (v: number) => ((v + lim) / (2 * lim)) * 100;
  const ticks: number[] = [];
  for (let v = -lim; v <= lim; v += step) ticks.push(v);
  const band = (r: [number, number] | null, k: string, label: string) =>
    r ? <span className={`cax__band cax__band--${k}`} style={{ left: `${x(r[0])}%`, width: `${x(r[1]) - x(r[0])}%` }} title={`${label}: ${marginWords(r[0], home, away)} to ${marginWords(r[1], home, away)}`} /> : null;
  return (
    <figure className={`cax${compact ? ' cax--compact' : ''}`} aria-label={`Projected margin ${marginWords(margin, home, away)}${r80 ? `; 80% model range ${marginWords(r80[0], home, away)} to ${marginWords(r80[1], home, away)}` : ''}`}>
      <div className="cax__ends" aria-hidden="true"><span>← {away} wins by more</span><span>{home} wins by more →</span></div>
      <div className="cax__plot" aria-hidden="true">
        {ticks.map((t) => <span key={t} className={`cax__tick${t === 0 ? ' cax__tick--zero' : ''}`} style={{ left: `${x(t)}%` }} />)}
        {band(r80, '80', '80% model range')}
        {band(r50, '50', '50% model range')}
        <span className="cax__pt" style={{ left: `${x(margin)}%` }} />
        <span className="cax__ptl num" style={{ left: `${Math.min(88, Math.max(12, x(margin)))}%` }}>{marginWords(margin, home, away)}</span>
      </div>
      <div className="cax__ticks num" aria-hidden="true">
        {ticks.map((t) => <span key={t} style={{ left: `${x(t)}%` }}>{t === 0 ? 'Even' : Math.abs(t)}</span>)}
      </div>
    </figure>
  );
}

/** The projected total on its own axis with the model's 50% and 80% ranges. */
export function TotalAxis({ total, r50, r80 }: { total: number; r50: [number, number] | null; r80: [number, number] | null }) {
  const lo0 = Math.min(total, ...(r80 ?? r50 ?? [total]));
  const hi0 = Math.max(total, ...(r80 ?? r50 ?? [total]));
  const step = niceStep(hi0 - lo0 + 10);
  const lo = Math.floor((lo0 - 4) / step) * step;
  const hi = Math.ceil((hi0 + 4) / step) * step;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const band = (r: [number, number] | null, k: string, label: string) =>
    r ? <span className={`cax__band cax__band--${k}`} style={{ left: `${x(r[0])}%`, width: `${x(r[1]) - x(r[0])}%` }} title={`${label}: ${fmt1(r[0])}–${fmt1(r[1])} points`} /> : null;
  return (
    <figure className="cax" aria-label={`Projected total ${fmt1(total)}${r80 ? `; 80% model range ${fmt1(r80[0])} to ${fmt1(r80[1])}` : ''}`}>
      <div className="cax__plot" aria-hidden="true">
        {ticks.map((t) => <span key={t} className="cax__tick" style={{ left: `${x(t)}%` }} />)}
        {band(r80, '80', '80% model range')}
        {band(r50, '50', '50% model range')}
        <span className="cax__pt" style={{ left: `${x(total)}%` }} />
        <span className="cax__ptl num" style={{ left: `${Math.min(90, Math.max(10, x(total)))}%` }}>{fmt1(total)}</span>
      </div>
      <div className="cax__ticks num" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ left: `${x(t)}%` }}>{t}</span>)}</div>
    </figure>
  );
}

export function AxisKey() {
  return (
    <p className="caxkey">
      <span><i className="caxkey__b caxkey__b--50" aria-hidden="true" />50% model range</span>
      <span><i className="caxkey__b caxkey__b--80" aria-hidden="true" />80% model range</span>
      <span><i className="caxkey__pt" aria-hidden="true" />Projection</span>
      <span className="caxkey__warn">Model uncertainty — not guaranteed</span>
    </p>
  );
}

// ------------------------------------------------------------------ roster composition

export const ROSTER_SEG = [
  { k: 'returning', label: 'Returning', cls: 'ret' },
  { k: 'transfer', label: 'Transfers', cls: 'tr' },
  { k: 'first_d1', label: 'First D-I', cls: 'fd' },
] as const;

type Minutes = { returning: number | null; transfer: number | null; first_d1?: number | null; unseen?: number | null };

/** Expected minutes by roster origin as one 200-minute bar, every segment labelled with its minutes. */
export function MinutesComp({ m, compact, caption = true }: { m: Minutes; compact?: boolean; caption?: boolean }) {
  const vals = { returning: m.returning, transfer: m.transfer, first_d1: m.first_d1 ?? m.unseen ?? null };
  const total = ROSTER_SEG.reduce((a, s) => a + (vals[s.k] ?? 0), 0);
  if (!total) return <p className="muted small">No expected-minutes split published.</p>;
  const scale = Math.max(total, 200);
  return (
    <figure className={`cmin${compact ? ' cmin--compact' : ''}`} aria-label={`Expected minutes: ${ROSTER_SEG.map((s) => `${s.label} ${fmt1(vals[s.k])}`).join(', ')} of 200`}>
      <div className="cmin__bar" aria-hidden="true">
        {ROSTER_SEG.map((s) => {
          const v = vals[s.k] ?? 0;
          if (v <= 0) return null;
          const w = (100 * v) / scale;
          return <span key={s.k} className={`cmin__s cmin__s--${s.cls}`} style={{ width: `${w}%` }}>{!compact && w > 13 ? <b className="num">{Math.round(v)}</b> : null}</span>;
        })}
      </div>
      {caption && (
        <figcaption className="cmin__key">
          {ROSTER_SEG.map((s) => (
            <span key={s.k}><i className={`cmin__dot cmin__s--${s.cls}`} aria-hidden="true" />{s.label} <b className="num">{vals[s.k] == null ? '—' : Math.round(vals[s.k]!)}</b></span>
          ))}
          <span className="muted">of 200 expected minutes</span>
        </figcaption>
      )}
    </figure>
  );
}

// ------------------------------------------------------------------ national standing

/** Where a published rank sits in its D-I universe: a track with #1 at the right end. Position only. */
export function Standing({ rank, size, tone, directional = true }: { rank: number | null | undefined; size: number | null | undefined; tone?: string; directional?: boolean }) {
  if (rank == null || !size || size < 2) return null;
  const pos = (1 - (rank - 1) / (size - 1)) * 100;
  return (
    <span className={`cstand${directional ? '' : ' cstand--pos'}`} aria-hidden="true" style={tone ? ({ '--tc': tone } as CSSProperties) : undefined}>
      {directional ? <span className="cstand__fill" style={{ width: `${pos}%` }} /> : <span className="cstand__dot" style={{ left: `${pos}%` }} />}
    </span>
  );
}

export function RankText({ rank, size }: { rank: number | null | undefined; size: number | null | undefined }) {
  if (rank == null) return <span className="crank muted">unranked</span>;
  return <span className="crank num">#{rank}<span className="crank__of"> of {size}</span></span>;
}

/** A compact stat tile: label, value, rank and its standing in D-I. */
export function StatTile({ label, value, rank, size, note, href, tone, info, directional = true }: { label: ReactNode; value: ReactNode; rank?: number | null; size?: number | null; note?: ReactNode; href?: string; tone?: string; info?: ReactNode; directional?: boolean }) {
  const body = (
    <>
      <span className="ctile__l">{label}{info}</span>
      <b className="ctile__v num">{value}</b>
      {rank !== undefined && <RankText rank={rank} size={size} />}
      {rank != null && <Standing rank={rank} size={size} tone={tone} directional={directional} />}
      {note && <span className="ctile__n">{note}</span>}
    </>
  );
  return href ? <Link className="ctile ctile--a" to={href}>{body}</Link> : <div className="ctile">{body}</div>;
}

/** Minutes as a single bar inside a table cell (40-minute scale). */
export function MinuteBar({ v }: { v: number | null }) {
  return (
    <span className="cmb">
      <span className="cmb__t" aria-hidden="true"><span className="cmb__f" style={{ width: `${Math.min(100, ((v ?? 0) / 40) * 100)}%` }} /></span>
      <span className="num cmb__v">{fmt1(v)}</span>
    </span>
  );
}
