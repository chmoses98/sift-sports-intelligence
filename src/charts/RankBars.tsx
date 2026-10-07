// The full comparison universe as ranked horizontal bars. Every team is present; the one you are
// researching is the signal (cyan), its opponent gold, pinned comparisons cobalt, everyone else muted
// context. League mean and median are drawn through the whole universe. Every row is a link.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { RankingEntry } from '../contract/types';
import { displayName, ordinal } from '../lib/format';

export interface RankBarsProps {
  entries: RankingEntry[];
  mean: number | null;
  median: number | null;
  focusId?: string | null;
  oppId?: string | null;
  pins?: Set<string>;
  format: (v: number | null) => string;
  hrefFor: (e: RankingEntry) => string | null;
  caption: string;
  onPin?: (id: string) => void;
  /** Optional identity mark per row (a sport's logo), decorative: the name is always written. */
  markFor?: (e: RankingEntry) => ReactNode;
  /** Optional secondary label per row (e.g. a conference). */
  subFor?: (e: RankingEntry) => string | null;
}

export function rankDomain(values: number[], mean: number | null, median: number | null): [number, number] {
  const all = [...values, ...(mean != null ? [mean] : []), ...(median != null ? [median] : [])];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  // Bars grow from zero when zero is meaningful (the data crosses it, or all values are magnitudes).
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  if (lo === hi) hi = lo + 1;
  return [lo, hi];
}

export function RankBars({ entries, mean, median, focusId, oppId, pins, format, hrefFor, caption, onPin, markFor, subFor }: RankBarsProps) {
  const vals = entries.map((e) => e.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const [lo, hi] = rankDomain(vals, mean, median);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = x(0);

  return (
    <figure className={`rankbars${markFor ? ' rankbars--marks' : ''}`} aria-label={caption}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="rankbars__legend" aria-hidden="true">
        {focusId && <span className="lg lg--focus">Viewing</span>}
        {oppId && <span className="lg lg--opp">Opponent</span>}
        {pins && pins.size > 0 && <span className="lg lg--compare">Pinned</span>}
        <span className="lg lg--context">Rest of league</span>
        {mean != null && <span className="lg lg--mean">Mean {format(mean)}</span>}
        {median != null && <span className="lg lg--median">Median {format(median)}</span>}
      </div>
      <div className="rankbars__body">
      <ol className="rankbars__list">
        {entries.map((e) => {
          const role = e.entity_id === focusId ? 'focus' : e.entity_id === oppId ? 'opp' : pins?.has(e.entity_id) ? 'compare' : 'context';
          const v = e.value;
          const left = v == null ? zero : Math.min(zero, x(v));
          const width = v == null ? 0 : Math.abs(x(v) - zero);
          const href = hrefFor(e);
          const inner = (
            <>
              <span className="rankbars__rank">{e.rank}</span>
              <span className="rankbars__name">
                {markFor?.(e)}
                <span className="rankbars__abbr">{e.short_name ?? ''}</span>
                <span className="rankbars__full">{displayName(e.display_name)}</span>
                {subFor && <span className="rankbars__sub">{subFor(e) ?? ''}</span>}
              </span>
              <span className="rankbars__track">
                <span className={`rankbars__bar rankbars__bar--${role}${v != null && v < 0 ? ' is-neg' : ''}`} style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }} />
              </span>
              <span className="rankbars__val">{format(v)}</span>
            </>
          );
          return (
            <li key={e.entity_id} className={`rankbars__row rankbars__row--${role}`} aria-label={`${ordinal(e.rank)}: ${e.display_name}, ${format(v)}`}>
              {href ? <Link to={href} className="rankbars__link">{inner}</Link> : <span className="rankbars__link">{inner}</span>}
              {onPin && role !== 'focus' && role !== 'opp' && (
                <button type="button" className={`rankbars__pin${role === 'compare' ? ' is-on' : ''}`} onClick={() => onPin(e.entity_id)} aria-pressed={role === 'compare'} aria-label={`${role === 'compare' ? 'Unpin' : 'Pin'} ${e.display_name} for comparison`}>
                  {role === 'compare' ? '−' : '+'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="rankbars__refs" aria-hidden="true">
        {mean != null && <span className="rankbars__ref rankbars__ref--mean" style={{ left: `${x(mean)}%` }} />}
        {median != null && <span className="rankbars__ref rankbars__ref--median" style={{ left: `${x(median)}%` }} />}
        {lo < 0 && hi > 0 && <span className="rankbars__ref rankbars__ref--zero" style={{ left: `${zero}%` }} />}
      </div>
      </div>
    </figure>
  );
}
