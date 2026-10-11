// What the page should do with the scroll position when the address changes. Pure, so every rule is unit-tested
// (tests/scroll.test.ts); src/components/ScrollManager.tsx carries it out.
//
// - Back / forward: return to where the reader was on that entry (restored as the page grows, see ScrollManager).
// - A new screen (another path): start at the top.
// - The same screen with new query parameters (a filter, a selected script, a tab): stay where the reader is —
//   a filter tap must never throw the page back to the top. When the tab changes and the reader is below the
//   section tabs, the new tab starts just under the tabs.
// - An explicit request wins: navigate(to, { state: { scroll: 'top' | 'keep' } }).
// - A section anchor (#/path#section): scroll to that section.

export type NavKind = 'POP' | 'PUSH' | 'REPLACE';

export interface ScrollInput {
  navType: NavKind;
  prev: { pathname: string; search: string } | null;
  next: { pathname: string; search: string; hash: string; state?: unknown };
  /** The saved position of the entry being shown (back/forward and reload), if one was recorded. */
  saved: number | undefined;
}

export type ScrollDecision =
  | { kind: 'restore'; y: number }
  | { kind: 'top' }
  | { kind: 'keep' }
  | { kind: 'tab' }
  | { kind: 'anchor'; id: string }
  | { kind: 'none' };

const TAB_KEYS = ['tab'];

function requested(state: unknown): 'top' | 'keep' | null {
  const s = (state as { scroll?: unknown } | null | undefined)?.scroll;
  return s === 'top' || s === 'keep' ? s : null;
}

export function scrollDecision({ navType, prev, next, saved }: ScrollInput): ScrollDecision {
  if (navType === 'POP') {
    if (saved != null && Number.isFinite(saved)) return { kind: 'restore', y: saved };
    // A first load with nothing saved keeps the browser's own position (the top, or a section anchor).
    if (!prev) return next.hash ? { kind: 'anchor', id: next.hash.slice(1) } : { kind: 'none' };
  }
  const asked = requested(next.state);
  if (asked === 'top') return { kind: 'top' };
  if (asked === 'keep') return { kind: 'keep' };
  if (next.hash) return { kind: 'anchor', id: decodeURIComponent(next.hash.slice(1)) };
  if (!prev) return { kind: 'none' };
  if (prev.pathname === next.pathname) {
    if (prev.search === next.search) return { kind: 'keep' };
    const a = new URLSearchParams(prev.search);
    const b = new URLSearchParams(next.search);
    return TAB_KEYS.some((k) => a.get(k) !== b.get(k)) ? { kind: 'tab' } : { kind: 'keep' };
  }
  return { kind: 'top' };
}

/**
 * Where the section tabs should sit after a tab change: if the reader has scrolled below the tabs' natural
 * position, put the tabs just under the sticky header (the new tab's content starts in view); otherwise stay.
 */
export function tabScrollTarget(scrollY: number, tabsNaturalTop: number, headerH: number): number | null {
  const target = Math.max(0, tabsNaturalTop - headerH);
  return scrollY > target + 1 ? target : null;
}
