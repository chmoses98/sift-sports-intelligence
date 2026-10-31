// Scroll memory. Back restores the exact offset of the entry it returns to; a state change in place (tab, window, line, filter) never
// moves the page; a new screen starts at the top. Memory is per history entry (`location.key`), saved the instant the viewer arrives
// somewhere else (before the new screen scrolls anything) and restored once the screen's content has mounted (retrying while a list is
// still loading). A reload, whose entry key is the shared "default", falls back to the address.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from '../../routing';
import { SHELL_PARAMS } from '../nav/schemas';

const mem = new Map<string, number>();
const SS = 'sift3.scroll';
try { const raw = sessionStorage.getItem(SS); if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) mem.set(k, v); } catch { /* memory only */ }
const flush = () => { try { sessionStorage.setItem(SS, JSON.stringify(Object.fromEntries([...mem].slice(-80)))); } catch { /* memory only */ } };

export const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

/** The address without the shell's own parameters (an open sheet is not a different page). */
export const pageKey = (pathname: string, search: string) => {
  const q = new URLSearchParams(search);
  SHELL_PARAMS.forEach((p) => q.delete(p));
  const s = q.toString();
  return `${pathname}${s ? `?${s}` : ''}`;
};

/** What remembers an entry: its history key, or the address for the shared "default" key a fresh load gets. */
const slot = (key: string, page: string) => (key === 'default' ? `a:${page}` : `k:${key}`);

/** The entry the viewer is on: where it is scrolled, tracked by the scroll event, and the document height last seen. */
const cur = { slot: '', page: '', y: 0, h: 0 };
const remember = () => { if (!cur.slot) return; mem.set(cur.slot, cur.y); mem.set(`a:${cur.page}`, cur.y); flush(); };

/**
 * Put the page back at `to`. The screen being returned to may not be tall enough yet (a lazy route chunk still loading after a reload, a list still
 * fetching), and scrolling a short page only clamps, so nothing is scrolled until the document can reach `to`; the wait is bounded and ends the moment
 * the viewer takes over (wheel, touch, key) or another restore begins.
 */
let restoring = 0;
const RESTORE_MS = 5000;
const TAKEOVER = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
const restore = (to: number) => {
  const token = ++restoring;
  const t0 = performance.now();
  const done = () => { TAKEOVER.forEach((e) => window.removeEventListener(e, stop)); };
  const stop = () => { if (restoring === token) restoring++; done(); };
  TAKEOVER.forEach((e) => window.addEventListener(e, stop, { passive: true }));
  const attempt = () => {
    if (restoring !== token) { done(); return; }
    const reach = document.documentElement.scrollHeight - window.innerHeight;
    const late = performance.now() - t0 > RESTORE_MS;
    if (reach >= to - 2 || late) {
      window.scrollTo(0, to);
      if (Math.abs(scrollTop() - to) <= 2 || late) { done(); return; }
    }
    requestAnimationFrame(attempt);
  };
  attempt();
};

/** Call once in the shell. `ready` flips true once the routed screen has its content so a restore has something to scroll. */
export function useScrollMemory(ready: boolean) {
  const loc = useLocation();
  const nav = useNavigationType();
  const page = pageKey(loc.pathname, loc.search);
  const here = slot(loc.key, page);
  const prev = useRef<{ pathname: string; page: string } | null>(null);
  const settled = useRef<string | null>(null);

  useEffect(() => {
    try { history.scrollRestoration = 'manual'; } catch { /* the browser decides */ }
    cur.h = document.documentElement.scrollHeight;
    // A scroll event that only reflects the page shrinking underneath the viewer (a screen unmounting, a sheet locking the body) is ignored: the browser has clamped
    // the offset to the new bottom. A shorter page alone is not enough (a virtualised list resizes its spacer while the viewer is somewhere else in it).
    const on = () => {
      const nh = document.documentElement.scrollHeight;
      if (nh < cur.h - 40 && scrollTop() < cur.y && scrollTop() >= nh - window.innerHeight - 2) { cur.h = nh; return; }
      cur.y = scrollTop(); cur.h = nh;
    };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('pagehide', remember);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('pagehide', remember); remember(); };
  }, []);

  // Arriving. Runs before the new screen paints, and before anything here scrolls: the entry being left is committed first.
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = { pathname: loc.pathname, page };
    const first = settled.current !== here;
    settled.current = here;
    if (first) {
      restoring++;   // a restore still waiting for the screen the viewer has now left is over
      if (cur.slot && cur.slot !== here) remember();
      cur.slot = here; cur.page = page;
      if (nav === 'POP') {
        const to = mem.get(here) ?? 0;
        cur.y = to;
        if (to === 0) { window.scrollTo(0, 0); return; }
        restore(to);
        return;
      }
      // PUSH or REPLACE onto the same page (a sheet, a tab, a window, a line, a filter): the page stays where it is.
      if (before && before.pathname === loc.pathname && (nav === 'REPLACE' || before.page === page)) { cur.y = scrollTop(); return; }
      cur.y = 0;
      window.scrollTo(0, 0);
      return;
    }
    // The same entry became ready after a restore began: finish restoring (a list that was still loading).
    if (nav === 'POP' && ready) {
      const to = mem.get(here) ?? 0;
      if (to > 0 && Math.abs(scrollTop() - to) > 2) restore(to);
    }
  }, [here, nav, ready, loc.pathname, page]);
}
