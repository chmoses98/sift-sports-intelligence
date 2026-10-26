// A windowed list over the WINDOW scroll (the shell remembers and restores the window's offset, so the list must not own a scroll
// container). The container is as tall as every row together (tall-container spacer approach): the page is scrollable to any row
// immediately, Back's restore finds a document tall enough on its first frame, and only the rows near the viewport exist in the DOM.
// Row heights are constants supplied by the caller; the one expanded row is measured, and its measured height is remembered by key
// for the session, so coming back to it lands on the same pixels.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const measuredSizes = new Map<string, number>();

export interface VirtualListProps<T> {
  items: T[];
  keyOf: (t: T) => string;
  /** The row's height (a constant) or, for a dynamic row, its estimate before it is measured. */
  heightOf: (t: T) => number;
  /** Rows whose real height is measured after they render (the expanded row). */
  dynamic?: (t: T) => boolean;
  render: (t: T, index: number) => ReactNode;
  /** Pixels rendered above and below the viewport. */
  overscan?: number;
  /** Called with the index range near the viewport (a smaller overscan than what is rendered) whenever it changes: what to fetch for. */
  onVisible?: (start: number, end: number) => void;
  /** Pixels around the viewport that count as visible (default 300). */
  visibleOverscan?: number;
  className?: string;
  label?: string;
}

function lowerBound(offsets: Float64Array, n: number, y: number): number {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid + 1] <= y) lo = mid + 1; else hi = mid; }
  return lo;
}

export function VirtualList<T>({ items, keyOf, heightOf, dynamic, render, overscan = 700, onVisible, visibleOverscan = 300, className, label }: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [measureV, setMeasureV] = useState(0);
  const [range, setRange] = useState<[number, number, number, number]>([0, Math.min(items.length, 14), 0, Math.min(items.length, 8)]);

  const { offsets, total } = useMemo(() => {
    const o = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      const h = dynamic?.(t) ? measuredSizes.get(keyOf(t)) ?? heightOf(t) : heightOf(t);
      o[i + 1] = o[i] + h;
    }
    return { offsets: o, total: o[items.length] };
  }, [items, heightOf, dynamic, keyOf, measureV]);

  const calc = useCallback((): [number, number, number, number] => {
    const el = ref.current;
    if (!el || !items.length) return [0, 0, 0, 0];
    const top = el.getBoundingClientRect().top;
    const y = -top;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const start = Math.max(0, lowerBound(offsets, items.length, y - overscan));
    let end = lowerBound(offsets, items.length, y + vh + overscan) + 1;
    end = Math.min(items.length, Math.max(end, start + 1));
    const vs = Math.max(0, lowerBound(offsets, items.length, y - visibleOverscan));
    const ve = Math.min(items.length, Math.max(lowerBound(offsets, items.length, y + vh + visibleOverscan) + 1, vs + 1));
    return [start, end, vs, ve];
  }, [items.length, offsets, overscan, visibleOverscan]);

  const frame = useRef(0);
  const update = useCallback(() => {
    frame.current = 0;
    const next = calc();
    setRange((cur) => (cur[0] === next[0] && cur[1] === next[1] && cur[2] === next[2] && cur[3] === next[3] ? cur : next));
  }, [calc]);

  useLayoutEffect(() => { update(); }, [update]);
  useEffect(() => {
    const on = () => { if (!frame.current) frame.current = requestAnimationFrame(update); };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [update]);

  const [start, end, vs, ve] = range[1] > items.length ? ([0, Math.min(items.length, 14), 0, Math.min(items.length, 8)] as const) : range;
  useEffect(() => { onVisible?.(vs, ve); }, [vs, ve, onVisible]);

  // Measure the dynamic rows (the expanded one) and remember the height by key.
  const ro = useRef<ResizeObserver | null>(null);
  useEffect(() => () => { ro.current?.disconnect(); ro.current = null; }, []);
  const attach = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    if (!ro.current) {
      ro.current = new ResizeObserver((es) => {
        let changed = false;
        for (const e of es) {
          const k = (e.target as HTMLElement).dataset.vkey;
          const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height);
          if (k && h > 0 && measuredSizes.get(k) !== h) { measuredSizes.set(k, h); changed = true; }
        }
        if (changed) setMeasureV((v) => v + 1);
      });
    }
    ro.current.observe(el);
  }, []);

  const slice = items.slice(start, end);
  return (
    <div ref={ref} className={className} role="list" aria-label={label} aria-rowcount={items.length} style={{ paddingTop: offsets[start] ?? 0, paddingBottom: Math.max(0, total - (offsets[end] ?? total)), minHeight: 0 }}>
      {slice.map((t, i) => {
        const k = keyOf(t);
        const dyn = dynamic?.(t);
        return (
          <div key={k} role="listitem" aria-posinset={start + i + 1} aria-setsize={items.length} data-vkey={dyn ? k : undefined} ref={dyn ? attach : undefined} style={{ display: 'flow-root' }}>
            {render(t, start + i)}
          </div>
        );
      })}
    </div>
  );
}
