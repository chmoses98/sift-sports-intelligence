// A sheet's content is created when the sheet opens, but the numbers behind it (live prices, the line, the filters) keep changing. The screen
// publishes its current view here and a sheet subscribes, so a sheet is never a stale copy. One Player screen exists at a time.
import { useSyncExternalStore } from 'react';
import type { PlayerView } from './view';

let current: PlayerView | null = null;
const subs = new Set<() => void>();
const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function publishView(v: PlayerView | null): void {
  current = v;
  subs.forEach((s) => s());
}

export const useSharedView = (): PlayerView | null => useSyncExternalStore(subscribe, () => current, () => current);
