import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import '../styles/bottom-sheet.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A phone sheet that rises from the bottom: modal, labelled, Escape and scrim close it, focus moves in on open, is kept
 * inside while it is open and returns to the control that opened it, and the page behind does not scroll (its position is
 * kept, so closing never jumps). The body scrolls inside the sheet; `footer` stays pinned above the safe-area inset.
 * It is portalled to <body> so no ancestor's overflow, transform or stacking context can clip or bury it.
 */
export function BottomSheet({ open, onClose, title, children, footer, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The latest onClose without making it an effect dependency: a parent re-render (typing in a search box inside the sheet)
  // must not tear the sheet down and rebuild it, which would hand focus back to the opener and dismiss a phone keyboard.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    // Move focus to the first control inside (the sheet itself when it has none).
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE) ?? ref.current;
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === a || !ref.current.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      root.style.overflow = prev;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="bsheet" data-bottom-sheet>
      <div className="bsheet__scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`bsheet__panel${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="bsheet__grip" aria-hidden="true" />
        <header className="bsheet__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="bsheet__close" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close" size={18} /></button>
        </header>
        <div className="bsheet__body">{children}</div>
        {footer ? <footer className="bsheet__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
