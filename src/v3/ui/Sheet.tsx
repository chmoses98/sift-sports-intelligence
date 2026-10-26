// One bottom-sheet host. A sheet is part of the address history: opening pushes an entry, so the browser Back button (and the
// swipe-back gesture) closes it and returns to the screen exactly as it was; closing with the X, the backdrop or Escape does the same
// by stepping back. Two kinds share the host:
//   imperative  sheet.open(title, node)   ephemeral UI (filters, a line picker); a reload drops it
//   addressed   ?sheet=contract&tk=…      durable and shareable; rendered from the registry below
// Links inside a sheet leave the sheet's entry clean (no sheet) before navigating, so Back from the destination lands on the
// screen underneath with every sheet closed. Page scroll is locked without moving the page, and focus returns to the opener.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from '../../routing';
import { sheetBridge } from '../nav/sheetBridge';
import { sheetOf, withSheet } from '../nav/routes';
import { Icon } from './Icon';

interface SheetSpec { title: string; node: ReactNode; tall?: boolean; id: string }
interface Ctx {
  open: (title: string, node: ReactNode, o?: { tall?: boolean }) => void;
  /** Open an addressed sheet (registered with `registerSheet`) over the current screen. */
  openAddressed: (kind: string, tk?: string) => void;
  close: () => void;
  isOpen: boolean;
}
const SheetCtx = createContext<Ctx>({ open: () => {}, openAddressed: () => {}, close: () => {}, isOpen: false });
export const useSheet = () => useContext(SheetCtx);

/** Addressed sheets by kind. A screen module registers the kinds it owns (the exact-contract sheet, for one). */
export interface AddressedSheet { title: (tk: string | null) => string; tall?: boolean; render: (tk: string | null) => ReactNode }
const registry = new Map<string, AddressedSheet>();
export const registerSheet = (kind: string, s: AddressedSheet) => { registry.set(kind, s); };

const FLAG = 'v3sheet';
const stripFlag = (state: unknown) => { if (!state || typeof state !== 'object') return state ?? null; const { [FLAG]: _drop, ...rest } = state as Record<string, unknown>; return Object.keys(rest).length ? rest : null; };

export function SheetHost({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [imp, setImp] = useState<SheetSpec | null>(null);
  const pending = useRef<SheetSpec | null>(null);
  // `close` may be asked twice for one sheet (a change made inside it, then its own close); it steps back once.
  const closing = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const flagged = (loc.state as Record<string, unknown> | null)?.[FLAG];
  const addressed = sheetOf(loc.search);
  const reg = addressed ? registry.get(addressed.kind) : undefined;
  const addr = addressed && reg ? addressed : null;
  const isOpen = !!imp || !!addr;

  const here = useRef({ pathname: loc.pathname, search: loc.search, state: loc.state as unknown, flagged: !!flagged, imp: false, addr: false });
  here.current = { pathname: loc.pathname, search: loc.search, state: loc.state, flagged: !!flagged, imp: !!imp, addr: !!addr };

  /** Close whichever sheet is open. A sheet we pushed steps back; a deep-linked one drops its parameters in place. */
  const close = useCallback(() => {
    const h = here.current;
    if (h.flagged) { if (!closing.current) { closing.current = true; nav(-1); } }
    else if (h.addr) nav({ pathname: h.pathname, search: withSheet(h.search, null) }, { replace: true, state: h.state, preventScrollReset: true });
    else { setImp(null); sheetBridge.flush(); }
  }, [nav]);

  const open = useCallback((title: string, node: ReactNode, o?: { tall?: boolean }) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const spec: SheetSpec = { title, node, tall: o?.tall, id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
    pending.current = spec;
    const h = here.current;
    nav({ pathname: h.pathname, search: h.search }, { state: { ...((h.state as object) ?? {}), [FLAG]: spec.id }, preventScrollReset: true });
  }, [nav]);

  const openAddressed = useCallback((kind: string, tk?: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const h = here.current;
    nav({ pathname: h.pathname, search: withSheet(h.search, { kind, tk }) }, { state: { ...((h.state as object) ?? {}), [FLAG]: kind }, preventScrollReset: true });
  }, [nav]);

  // The address decides what is open: our own pushed entry shows the pending sheet; leaving it (Back, a link) hides it.
  useEffect(() => {
    if (!flagged) closing.current = false;
    if (pending.current && flagged === pending.current.id) { setImp(pending.current); pending.current = null; return; }
    if (imp && flagged !== imp.id) { setImp(null); sheetBridge.flush(); return; }
    if (!imp && !pending.current && !addr && flagged) {
      // A stale flag (Back from a page a sheet link opened, or a reload): clean the entry instead of showing nothing.
      nav({ pathname: loc.pathname, search: loc.search }, { replace: true, state: stripFlag(loc.state), preventScrollReset: true });
    }
    if (!imp && !addr && !flagged) sheetBridge.flush();
  }, [flagged, imp, addr, loc.pathname, loc.search, loc.state, nav]);

  useEffect(() => { sheetBridge.register(isOpen && (flagged || addr) ? close : null); return () => sheetBridge.register(null); }, [isOpen, flagged, addr, close]);

  // Scroll lock that keeps the page exactly where it was.
  useEffect(() => {
    if (!isOpen) return;
    const y = window.scrollY;
    const b = document.body;
    const prev = { pos: b.style.position, top: b.style.top, w: b.style.width };
    b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.width = '100%';
    panel.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      b.style.position = prev.pos; b.style.top = prev.top; b.style.width = prev.w;
      window.scrollTo(0, y);
      opener.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, close]);

  // A link inside the sheet. A sheet we pushed is replaced by the destination, so Back from there lands on the screen underneath
  // with every sheet closed and no ghost entry; a deep-linked sheet drops its parameters first and then navigates normally.
  const onPanelClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const h = here.current;
    sheetBridge.clear();
    if (h.flagged) {
      const href = a.getAttribute('href') ?? '';
      const to = href.startsWith('#') ? href.slice(1) : href;
      if (!to.startsWith('/')) return;
      e.preventDefault(); e.stopPropagation();
      nav(to, { replace: true });
    } else if (h.addr) {
      nav({ pathname: h.pathname, search: withSheet(h.search, null) }, { replace: true, state: stripFlag(h.state), preventScrollReset: true });
    }
  };

  const value = useMemo(() => ({ open, openAddressed, close, isOpen }), [open, openAddressed, close, isOpen]);
  const spec: (SheetSpec & { node: ReactNode }) | null = imp ?? (addr && reg ? { id: addr.kind, title: reg.title(addr.tk), node: reg.render(addr.tk), tall: reg.tall } : null);
  return (
    <SheetCtx.Provider value={value}>
      {children}
      {spec && (
        <div className="v3-sheet-root" role="presentation">
          <button type="button" className="v3-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={close} />
          <div ref={panel} className={`v3-sheet${spec.tall ? ' v3-sheet--tall' : ''}`} role="dialog" aria-modal="true" aria-label={spec.title} tabIndex={-1} onClickCapture={onPanelClick}>
            <div className="v3-sheet__grip" aria-hidden="true" />
            <header className="v3-sheet__head">
              <h2>{spec.title}</h2>
              <button type="button" className="v3-sheet__x" aria-label="Close" onClick={close}><Icon name="close" size={20} /></button>
            </header>
            <div className="v3-sheet__body">{spec.node}</div>
          </div>
        </div>
      )}
    </SheetCtx.Provider>
  );
}
