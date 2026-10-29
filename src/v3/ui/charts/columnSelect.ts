// Selecting one of N slim columns of a chart with a finger. The columns tile the plot with no gaps and no overlap, so a point belongs to
// exactly one column (adjacent columns can never steal each other's taps), and a press outside the first or last column still selects the
// nearest one. A press PREVIEWS the nearest column and keeps following the finger while it drags sideways; lifting COMMITS the column the
// finger is on; a gesture the browser takes over (a vertical page scroll, a system gesture) CANCELS and leaves the committed selection alone.
//
// Touch: the element these handlers go on must set `touch-action: pan-y`. The browser then keeps vertical panning (the page still scrolls
// when a finger starts on the chart and moves up or down) and hands every horizontal movement to the page as pointer events, never
// scrolling the page for it. The pointer is captured so a drag keeps selecting after the finger leaves the chart's box.
//
// A tap the browser cancels but still delivers as a click (WebKit sent pointerdown, pointercancel, pointerup, click for taps beside a column edge, in CI on
// Playwright's iPhone profiles) selects the column the click landed on: a click only follows a finger that did not pan, so it is never a scroll in disguise.
import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Which of `n` equal columns the horizontal position `x` falls in; `inset` is the unused margin at each end of the plot (same unit as x). */
export function columnAt(x: number, left: number, width: number, n: number, inset = 0): number {
  if (n <= 0) return -1;
  const span = Math.max(1, width - 2 * inset);
  return Math.max(0, Math.min(n - 1, Math.floor(((x - left - inset) / span) * n)));
}

export interface ColumnSelectOptions {
  n: number;
  /** The plot's own box and its inset, read at the moment of the event (the plot scales with the page). */
  geometry: () => { left: number; width: number; inset: number } | null;
  /** The column under the finger while it is down (null: the gesture ended or was cancelled). */
  onPreview: (i: number | null) => void;
  /** The column the finger was lifted on. */
  onCommit: (i: number) => void;
}

export function useColumnSelect(o: ColumnSelectOptions) {
  const opts = useRef(o);
  opts.current = o;
  const active = useRef<{ id: number; col: number } | null>(null);
  /** Whether the pointer sequence that ends in the next click already committed a column (the click then has nothing to add). */
  const committed = useRef(false);

  const colOf = useCallback((clientX: number): number | null => {
    const g = opts.current.geometry();
    if (!g) return null;
    return columnAt(clientX, g.left, g.width, opts.current.n, g.inset);
  }, []);

  const end = useCallback((e: PointerEvent<HTMLElement>, commit: boolean) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const col = commit ? colOf(e.clientX) ?? a.col : null;
    opts.current.onPreview(null);
    if (col != null) { committed.current = true; opts.current.onCommit(col); }
  }, [colOf]);

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const col = colOf(e.clientX);
      if (col == null) return;
      committed.current = false;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer cannot be captured */ }
      active.current = { id: e.pointerId, col };
      opts.current.onPreview(col);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      const col = colOf(e.clientX);
      if (col != null && col !== a.col) { a.col = col; opts.current.onPreview(col); }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, true),
    // The browser took the gesture (a vertical scroll began): nothing is selected.
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, false),
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (committed.current) { committed.current = false; return; }
      const col = colOf(e.clientX);
      if (col != null) { opts.current.onPreview(null); opts.current.onCommit(col); }
    },
  };
}
