// One bottom-sheet host: slides up from the bottom with a grip and a close control, locks page scroll without moving the page
// (the offset is restored on dismiss), closes on Escape / backdrop / route change, and returns focus to what opened it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from '../../routing';
import { Icon } from './Icon';

interface SheetSpec { title: string; node: ReactNode; tall?: boolean; id: string }
interface Ctx { open: (title: string, node: ReactNode, o?: { tall?: boolean }) => void; close: () => void; isOpen: boolean }
const SheetCtx = createContext<Ctx>({ open: () => {}, close: () => {}, isOpen: false });
export const useSheet = () => useContext(SheetCtx);

export function SheetHost({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const close = useCallback(() => setSheet(null), []);
  const open = useCallback((title: string, node: ReactNode, o?: { tall?: boolean }) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet({ title, node, tall: o?.tall, id: `${Date.now()}` });
  }, []);
  // Navigating away (a sheet row that opens a game, a team…) closes the sheet.
  useEffect(() => { setSheet(null); }, [pathname]);
  // Scroll lock that keeps the page exactly where it was.
  useEffect(() => {
    if (!sheet) return;
    const y = window.scrollY;
    const b = document.body;
    const prev = { pos: b.style.position, top: b.style.top, w: b.style.width };
    b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.width = '100%';
    panel.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      b.style.position = prev.pos; b.style.top = prev.top; b.style.width = prev.w;
      window.scrollTo(0, y);
      opener.current?.focus?.({ preventScroll: true });
    };
  }, [sheet]);
  const value = useMemo(() => ({ open, close, isOpen: !!sheet }), [open, close, sheet]);
  return (
    <SheetCtx.Provider value={value}>
      {children}
      {sheet && (
        <div className="v3-sheet-root" role="presentation">
          <button type="button" className="v3-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={close} />
          <div ref={panel} className={`v3-sheet${sheet.tall ? ' v3-sheet--tall' : ''}`} role="dialog" aria-modal="true" aria-label={sheet.title} tabIndex={-1}>
            <div className="v3-sheet__grip" aria-hidden="true" />
            <header className="v3-sheet__head">
              <h2>{sheet.title}</h2>
              <button type="button" className="v3-sheet__x" aria-label="Close" onClick={close}><Icon name="close" size={20} /></button>
            </header>
            <div className="v3-sheet__body">{sheet.node}</div>
          </div>
        </div>
      )}
    </SheetCtx.Provider>
  );
}
