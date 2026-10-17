import { useSyncExternalStore } from 'react';

/** Phone layout: the width at which every Sift 2.0 stylesheet switches to its phone rules (max-width: 719px). */
export const PHONE_QUERY = '(max-width: 719px)';

/**
 * Whether a CSS media query matches, kept live. Components that need a different STRUCTURE on a phone (not just
 * different styling) read this instead of rendering both and hiding one: the duplicate would double every link, label
 * and landmark for assistive technology. Server and test environments without matchMedia answer `false` (desktop).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', notify);
      return () => m.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

export const usePhone = () => useMediaQuery(PHONE_QUERY);
