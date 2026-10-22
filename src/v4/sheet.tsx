import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface SheetApi { open: (content: ReactNode, opts?: { label: string }) => void; close: () => void }
const Ctx = createContext<SheetApi>({ open: () => {}, close: () => {} });
export const useSheet = () => useContext(Ctx);

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea';

/** One bottom sheet at a time: dialog semantics, Escape and scrim close, focus moves in and returns, drag the grabber down to dismiss. */
export function SheetHost({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{ content: ReactNode; label: string } | null>(null);
  const opener = useRef<Element | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number } | null>(null);

  const open = useCallback((content: ReactNode, opts?: { label: string }) => {
    opener.current = document.activeElement;
    setSheet({ content, label: opts?.label ?? 'Details' });
  }, []);
  const close = useCallback(() => {
    setSheet(null);
    (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const el = panel.current;
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [sheet, close]);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      {sheet && (
        <>
          <div className="v4-scrim" onClick={close} aria-hidden="true" />
          <div className="v4-sheet" ref={panel} role="dialog" aria-modal="true" aria-label={sheet.label}
>
            <div className="v4-grab" aria-hidden="true"
              onPointerDown={(e) => { drag.current = { y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
              onPointerUp={(e) => { if (drag.current && e.clientY - drag.current.y > 70) close(); drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}>
              <i />
            </div>
            {sheet.content}
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}
