// The one horizontal rail for chips, sport tabs and filter pills. Never wraps: a single row that scrolls sideways with snap points, a hidden
// scrollbar and a soft fade on whichever edge has more to reveal (so a half-visible next chip reads as "scroll", not as clipping). The active
// chip is scrolled into view when the screen opens and whenever the active chip changes. Children keep their DOM order, so keyboard and
// screen-reader order is the visual order. The styling lives in rail.css (`.v3-xrail`); this component only adds the behaviour.
import { useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import './rail.css';

/** What marks a rail child as the active one (chips use aria-pressed, tabs aria-selected, links aria-current or `.is-on`). */
export const RAIL_ACTIVE = '[aria-pressed="true"], [aria-selected="true"], [aria-current="true"], [aria-current="page"], .is-on';
/** How much of the next chip stays visible past the active one, so the rail never ends flush against the active chip. */
const PEEK = 44;

export type RailFade = 'start' | 'end' | 'both' | 'none';

/** Which edges have more content to scroll to (pure: the unit test and the component share it). */
export function railFade(scrollLeft: number, clientWidth: number, scrollWidth: number): RailFade {
  const max = scrollWidth - clientWidth;
  if (max <= 2) return 'none';
  const start = scrollLeft > 2, end = scrollLeft < max - 2;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}

/** The scrollLeft that brings an item fully into view with a peek of its neighbours, or null when it already is. */
export function scrollTarget(item: { left: number; width: number }, view: { scrollLeft: number; clientWidth: number; scrollWidth: number }, peek = PEEK): number | null {
  const max = Math.max(0, view.scrollWidth - view.clientWidth);
  if (item.left - peek < view.scrollLeft) return Math.max(0, item.left - peek);
  if (item.left + item.width + peek > view.scrollLeft + view.clientWidth) return Math.min(max, item.left + item.width + peek - view.clientWidth);
  return null;
}

interface Props extends HTMLAttributes<HTMLElement> { as?: 'div' | 'nav' | 'ul'; children: ReactNode }

export function ChipRail({ as: Tag = 'div', className, children, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef<string | null>(null);

  // Runs after every render but measures only when the active chip CHANGED (or on first show): reading layout (scroll and client sizes, bounding
  // boxes) after every commit forced a synchronous layout of the whole page each time a screen re-rendered. The edges' fade is kept current by the
  // observers below (resize, children, scroll) and once more when the fonts arrive (they change the chips' widths without changing the rail's box).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(RAIL_ACTIVE);
    // Move only when the active chip CHANGED (or on first show): a viewer who scrolled the rail by hand is never yanked back by a re-render.
    const sig = active ? `${[...el.children].indexOf(active)}:${active.textContent}` : '';
    if (seen.current !== null && sig === seen.current) return;
    if (active) {
      const first = seen.current === null;
      const er = el.getBoundingClientRect(), ir = active.getBoundingClientRect();
      const to = scrollTarget({ left: ir.left - er.left + el.scrollLeft, width: ir.width }, el);
      if (to != null) {
        const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left: to, behavior: first || calm ? 'auto' : 'smooth' });
      }
    }
    seen.current = sig;
    el.dataset.fade = railFade(el.scrollLeft, el.clientWidth, el.scrollWidth);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fade = () => { el.dataset.fade = railFade(el.scrollLeft, el.clientWidth, el.scrollWidth); };
    el.addEventListener('scroll', fade, { passive: true });
    window.addEventListener('resize', fade);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fade) : null;
    ro?.observe(el);
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) fade(); });
    // Chips arrive after the slate loads: their size changes what can scroll.
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(fade) : null;
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { alive = false; el.removeEventListener('scroll', fade); window.removeEventListener('resize', fade); ro?.disconnect(); mo?.disconnect(); };
  }, [Tag]);

  const T = Tag as 'div';
  return <T ref={ref as never} className={`v3-xrail${className ? ` ${className}` : ''}`} data-fade="none" {...rest}>{children}</T>;
}
