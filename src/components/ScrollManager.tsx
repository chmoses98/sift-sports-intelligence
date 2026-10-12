// Scroll behaviour for the whole app (replaces react-router's <ScrollRestoration/>, which reset the page to the top on
// EVERY navigation, including a filter tap or a tab switch on the same screen, and restored back-navigation
// positions before the page had loaded, so they clamped short). The rules are in src/lib/scroll.ts.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { scrollDecision, tabScrollTarget } from '../lib/scroll';

const STORE = 'sift.scroll.v1';
/** The section tab bars a tab change aligns to (game pages, team pages, or anything that opts in). */
const TABS_SELECTOR = '[data-scroll-tabs], .gtabs, nav.tabs';
/** How long a restore keeps waiting for the page to grow tall enough (data and lazy screens arriving). */
const RESTORE_MS = 4000;

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function headerHeight(): number {
  const bar = document.querySelector('.topbar');
  return bar ? bar.getBoundingClientRect().height : 0;
}

/** The tabs' position in the document as laid out, not where `position: sticky` is holding them right now. */
function naturalTop(el: HTMLElement): number {
  const pos = el.style.position;
  el.style.position = 'static';
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.position = pos;
  return top;
}

function maxScroll(): number {
  return document.documentElement.scrollHeight - window.innerHeight;
}

export function ScrollManager() {
  const loc = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Record<string, number>>({});
  const key = useRef<string>(loc.key);
  const prev = useRef<{ pathname: string; search: string } | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  // Own the browser's restoration, record the reader's position per history entry, keep it across reloads.
  useEffect(() => {
    positions.current = load();
    const before = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        positions.current[key.current] = window.scrollY;
      });
    };
    const persist = () => {
      try {
        sessionStorage.setItem(STORE, JSON.stringify(positions.current));
      } catch {
        /* private mode: positions still work within this page */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      cancelAnimationFrame(raf);
      persist();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      window.history.scrollRestoration = before;
    };
  }, []);

  useLayoutEffect(() => {
    cancel.current?.();
    cancel.current = null;
    const from = prev.current;
    prev.current = { pathname: loc.pathname, search: loc.search };
    key.current = loc.key;
    const d = scrollDecision({ navType, prev: from, next: { pathname: loc.pathname, search: loc.search, hash: loc.hash, state: loc.state }, saved: positions.current[loc.key] });

    if (d.kind === 'top') {
      window.scrollTo(0, 0);
      positions.current[loc.key] = 0;
      return;
    }
    if (d.kind === 'keep' || d.kind === 'none') {
      positions.current[loc.key] = window.scrollY;
      return;
    }
    if (d.kind === 'tab') {
      const tabs = document.querySelector<HTMLElement>(TABS_SELECTOR);
      if (tabs) {
        const y = tabScrollTarget(window.scrollY, naturalTop(tabs), headerHeight());
        if (y != null) window.scrollTo(0, y);
      }
      positions.current[loc.key] = window.scrollY;
      return;
    }

    // restore / anchor: the page may still be loading (a lazy screen, its data). Keep trying as it grows, and
    // stop the moment the reader scrolls, taps or types — never fight the reader.
    let done = false;
    const attempt = (): boolean => {
      if (d.kind === 'restore') {
        if (maxScroll() >= d.y - 1) {
          window.scrollTo(0, d.y);
          return true;
        }
        window.scrollTo(0, Math.max(0, maxScroll()));
        return false;
      }
      const el = document.getElementById(d.id);
      if (!el) return false;
      el.scrollIntoView({ block: 'start' });
      return true;
    };
    if (attempt()) return;
    const stop = () => {
      done = true;
      ro.disconnect();
      clearTimeout(timer);
      for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(ev, stop);
    };
    const grew = () => {
      if (!done && attempt()) stop();
    };
    const ro = typeof ResizeObserver === 'undefined' ? { observe() {}, disconnect() { clearInterval(poll); } } : new ResizeObserver(grew);
    const poll = typeof ResizeObserver === 'undefined' ? setInterval(grew, 100) : 0;
    ro.observe(document.body);
    const timer = setTimeout(stop, RESTORE_MS);
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(ev, stop, { passive: true });
    cancel.current = stop;
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
