// A player's markets as one horizontal carousel: swipe on a phone, arrow buttons on a desktop, ←/→ (Home/End) from
// the keyboard, CSS scroll-snap everywhere. Each tile is one stat: the main line, both captured asks, how many
// alternate rungs the ladder carries, the published projection's side of the line and — where the game logs reach
// it — how many of the last games played cleared TODAY's line (history, never a chance).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../components/Icon';
import type { HitRate } from '../../history/hitRate';
import type { PropRow } from '../../insights/propBoard';
import { HitDots } from './HitRate';

const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

export function MarketCarousel({ rows, selectedId, onSelect, hits, hitLabel, label, size = 'md' }: {
  rows: PropRow[];
  selectedId: string | null;
  onSelect: (row: PropRow) => void;
  /** History against each row's current main line, when the game logs have it. */
  hits?: Map<string, HitRate | null>;
  hitLabel?: string;
  label: string;
  size?: 'sm' | 'md';
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ prev: false, next: false });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, rows.length]);
  // Keep the selected tile in view when the selection changes from elsewhere (address, another panel).
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const t = track.current;
    if (!el || !t) return;
    const l = el.offsetLeft - t.offsetLeft;
    if (l < t.scrollLeft || l + el.offsetWidth > t.scrollLeft + t.clientWidth) t.scrollTo?.({ left: Math.max(0, l - 8), behavior: 'auto' });
  }, [selectedId]);
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy?.({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: 'smooth' });
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const tiles = [...(track.current?.querySelectorAll<HTMLButtonElement>('.pmk') ?? [])];
    const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tiles.length - 1 : null;
    if (to == null || to < 0 || to >= tiles.length) return;
    e.preventDefault();
    tiles[to].focus();
    tiles[to].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  return (
    <div className={`pcar pcar--${size}`} role="group" aria-label={label}>
      <button type="button" className="pcar__nav pcar__nav--prev" onClick={() => page(-1)} disabled={!edge.prev} aria-label="Previous markets" tabIndex={-1}><span className="pcar__flip"><Icon name="chevronRight" size={16} /></span></button>
      <ul className="pcar__track" ref={track} onScroll={measure} onKeyDown={onKey}>
        {rows.map((r) => {
          const h = hits?.get(r.id) ?? null;
          const on = r.id === selectedId;
          const read = r.read === 'ABOVE' ? 'up' : r.read === 'BELOW' ? 'down' : r.read === 'ON' ? 'on' : null;
          const alts = Math.max(0, r.ladder.length - (r.main ? 1 : 0));
          return (
            <li key={r.id}>
              <button type="button" className={`pmk${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onSelect(r)}
                aria-label={`${r.def.label}${r.line != null ? `, line ${r.line}` : ', no priced line'}${h && h.n ? `, ${hitLabel ?? 'recent games'}: ${h.over} of ${h.n} over` : ''}`}>
                <span className="pmk__stat">{r.def.label}</span>
                <span className="pmk__line"><b className="pmk__n">{r.line ?? '—'}</b>{read && <i className={`pmk__read pmk__read--${read}`} title={read === 'up' ? 'Projection above the line' : read === 'down' ? 'Projection below the line' : 'Projection on the line'} aria-hidden="true">{read === 'up' ? '▲' : read === 'down' ? '▼' : '='}</i>}</span>
                {size === 'md' && <span className="pmk__px">{r.main ? <>O {cents(r.main.yesAsk)} · U {cents(r.main.noAsk)}</> : 'No priced line'}</span>}
                {h && h.n > 0 ? (
                  <span className="pmk__hit">{size === 'md' && <HitDots h={h} max={10} />}<span className="pmk__hn">{h.over}/{h.n}</span>{size === 'sm' && ' over'}</span>
                ) : <span className="pmk__hit pmk__hit--none">{r.line == null ? '' : 'No game log'}</span>}
                {size === 'md' && alts > 0 && <span className="pmk__alt">+{alts} alt line{alts === 1 ? '' : 's'}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="pcar__nav pcar__nav--next" onClick={() => page(1)} disabled={!edge.next} aria-label="More markets" tabIndex={-1}><Icon name="chevronRight" size={16} /></button>
    </div>
  );
}
