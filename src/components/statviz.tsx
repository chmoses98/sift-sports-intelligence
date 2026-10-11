// Statistical pictures that read the same everywhere (game Matchups tab, team pages, team comparisons):
//  - ModeToggle: the app-wide Adjusted / Raw choice (state/statMode.ts);
//  - BasisTag: the footing a value stands on, written on the value itself;
//  - DuelRow: one stat for two units, rank against rank, each bar under its own team and as long as the unit is
//    strong (direction-aware ranks: #1 = best for the job), so the picture can never contradict the labels;
//  - PercentileStrip: where each team sits among every ranked team (low → high or worst → best);
//  - DivergingBar: an opponent-adjusted rating as a bar either side of league average.
// Every graphic has its meaning in text beside it (rank of N, value with unit), never by colour alone.
import type { ReactNode } from 'react';
import { TeamMark } from './ui';
import { setStatMode, useStatMode, type StatMode } from '../state/statMode';
import '../styles/lane-c-stats.css';

export function ModeToggle({ note, className }: { note?: ReactNode; className?: string }) {
  const [mode] = useStatMode();
  const b = (m: StatMode, label: string, sub: string) => (
    <button type="button" className={`svm__b${mode === m ? ' is-on' : ''}`} aria-pressed={mode === m} onClick={() => setStatMode(m)}>
      <span className="svm__l">{label}</span>
      <span className="svm__s">{sub}</span>
    </button>
  );
  return (
    <div className={`svm${className ? ` ${className}` : ''}`}>
      <div className="svm__g" role="group" aria-label="Team numbers: opponent-adjusted or raw">
        {b('adjusted', 'Adjusted', 'for opponents faced')}
        {b('raw', 'Raw', 'what happened')}
      </div>
      {note && <p className="svm__n">{note}</p>}
    </div>
  );
}

export function BasisTag({ basis, fallback, children }: { basis: 'adjusted' | 'raw' | 'season' | 'box'; fallback?: boolean; children?: ReactNode }) {
  const word = basis === 'adjusted' ? 'Adjusted' : basis === 'raw' ? 'Raw' : basis === 'season' ? 'Season' : 'Box score';
  return (
    <span className={`svtag svtag--${basis}${fallback ? ' svtag--only' : ''}`} title={fallback ? `Only the ${word.toLowerCase()} version is published for this measure` : undefined}>
      {children ?? word}{fallback ? ' only' : ''}
    </span>
  );
}

export interface DuelSide {
  abbr: string;
  sport?: string;
  color?: string;
  rank: number | null;
  of: number | null;
  /** Value with its unit ("+0.134", "41%", "27.5"). */
  value: string;
  /** "BUF pass offense". */
  who: string;
  tag?: ReactNode;
  href?: string;
}

const strength = (rank: number | null, of: number | null) => (rank == null || !of || of < 2 ? null : (of - rank) / (of - 1));

/** One stat for two units: each bar under its own team, as long as the unit is strong. */
export function DuelRow({ label, unit, left, right, note }: { label: ReactNode; unit?: ReactNode; left: DuelSide; right: DuelSide; note?: ReactNode }) {
  const ls = strength(left.rank, left.of);
  const rs = strength(right.rank, right.of);
  const lead = ls != null && rs != null ? (ls > rs + 0.2 ? 'l' : rs > ls + 0.2 ? 'r' : 'even') : 'none';
  const side = (s: DuelSide, st: number | null, cls: 'l' | 'r') => (
    <span className={`svd__side svd__side--${cls}`} style={s.color ? { ['--tc' as string]: s.color } : undefined}>
      <span className="svd__top">
        {cls === 'l' && <TeamMark sport={s.sport ?? 'NFL'} abbr={s.abbr} size="sm" />}
        <b className="svd__rk num">{s.rank != null ? `#${s.rank}` : '—'}</b>
        <span className="svd__of">{s.of ? `of ${s.of}` : 'unranked'}</span>
        {cls === 'r' && <TeamMark sport={s.sport ?? 'NFL'} abbr={s.abbr} size="sm" />}
      </span>
      <span className="svd__bar" aria-hidden="true"><i style={{ width: `${Math.max(st != null ? 4 : 0, Math.round((st ?? 0) * 100))}%` }} /></span>
      <span className="svd__val"><span className="num">{s.value}</span>{s.tag}</span>
    </span>
  );
  const sr = `${left.who}: ${left.rank != null ? `ranked ${left.rank} of ${left.of}` : 'unranked'}, ${left.value}. ${right.who}: ${right.rank != null ? `ranked ${right.rank} of ${right.of}` : 'unranked'}, ${right.value}.`;
  return (
    <div className={`svd svd--${lead}`}>
      <div className="svd__h"><span className="svd__label">{label}</span>{unit && <span className="svd__unit">{unit}</span>}</div>
      <div className="svd__row" aria-hidden="true">
        {side(left, ls, 'l')}
        {side(right, rs, 'r')}
      </div>
      <span className="sr-only">{sr}</span>
      {note && <p className="svd__note">{note}</p>}
    </div>
  );
}

export interface StripMark {
  abbr: string;
  color?: string;
  /** 0..1 along the strip. */
  pos: number;
  text: string;
}

/** Where each team sits among the league (0 = the low end, 1 = the high end), with the ends named. */
export function PercentileStrip({ marks, low = 'Lowest', high = 'Highest', label, neutral }: { marks: StripMark[]; low?: string; high?: string; label: string; /** A tendency with no better end: no red→green wash. */ neutral?: boolean }) {
  return (
    <div className={`svp${neutral ? ' svp--neutral' : ''}`} role="img" aria-label={`${label}: ${marks.map((m) => `${m.abbr} ${m.text}`).join('; ')}`}>
      <div className="svp__track" aria-hidden="true">
        <span className="svp__mid" />
        {marks.map((m, i) => (
          <span key={m.abbr + i} className={`svp__m svp__m--${i % 2 ? 'b' : 'a'}`} style={{ left: `${Math.min(100, Math.max(0, m.pos * 100))}%`, ['--tc' as string]: m.color ?? 'var(--cyan)' }}>
            <span className="svp__dot" />
            <span className="svp__lab">{m.abbr}</span>
          </span>
        ))}
      </div>
      <div className="svp__ends" aria-hidden="true"><span>{low}</span><span>League middle</span><span>{high}</span></div>
    </div>
  );
}

/** An opponent-adjusted rating as a bar either side of league average ("better" side named). */
export function DivergingBar({ value, max, betterUp = true, text, label }: { value: number | null; max: number; betterUp?: boolean | null; text: string; label: string }) {
  const v = value ?? 0;
  const w = max > 0 ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
  const good = betterUp == null ? null : (v > 0) === betterUp;
  return (
    <span className={`svx${good == null ? '' : good ? ' svx--good' : ' svx--bad'}`} role="img" aria-label={`${label}: ${text} vs league average`}>
      <span className="svx__track" aria-hidden="true">
        <span className="svx__zero" />
        {value != null && <span className="svx__bar" style={v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />}
      </span>
      <span className="svx__t num">{text}</span>
    </span>
  );
}
