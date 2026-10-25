// Scroll memory: Back restores the exact offset of the screen it returns to. Keyed by the full in-app address (path + query),
// saved as the viewer leaves and restored once the screen's content has mounted (retrying while a list is still loading).
import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from '../../routing';

const mem = new Map<string, number>();
const SS = 'sift3.scroll';
try { const raw = sessionStorage.getItem(SS); if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) mem.set(k, v); } catch { /* memory only */ }
const flush = () => { try { sessionStorage.setItem(SS, JSON.stringify(Object.fromEntries([...mem].slice(-60)))); } catch { /* memory only */ } };

export const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

/** Call once in the shell. `ready` flips true once the routed screen has its content so a restore has something to scroll. */
export function useScrollMemory(ready: boolean) {
  const loc = useLocation();
  const nav = useNavigationType();
  const key = `${loc.pathname}${loc.search}`;
  // Remember where this address was left. The offset is committed to memory when the address changes (cleanup) or the page hides;
  // a scroll event that only reflects the page shrinking underneath the viewer (the screen unmounting) is ignored.
  useEffect(() => {
    let y = scrollTop();
    let h = document.documentElement.scrollHeight;
    const on = () => {
      const nh = document.documentElement.scrollHeight;
      if (nh < h - 40 && scrollTop() < y) { h = nh; return; }
      y = scrollTop(); h = nh;
    };
    window.addEventListener('scroll', on, { passive: true });
    const hide = () => { mem.set(key, y); flush(); };
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('pagehide', hide); mem.set(key, y); flush(); };
  }, [key]);
  // Arriving: Back/forward restore the saved offset; a fresh navigation starts at the top.
  useLayoutEffect(() => {
    const to = nav === 'POP' ? mem.get(key) ?? 0 : 0;
    if (to === 0) { window.scrollTo(0, 0); return; }
    let tries = 0;
    const attempt = () => {
      window.scrollTo(0, to);
      if (Math.abs(scrollTop() - to) > 2 && tries++ < 20) requestAnimationFrame(attempt);
    };
    attempt();
  }, [key, nav, ready]);
}
