// One app-wide choice: read team numbers opponent-adjusted (the NFL publication's primary footing — its matchup
// rows and ratings are opponent-adjusted) or raw (what happened, over the publication's raw window). The choice
// follows the reader from the game's Matchups tab to team pages and comparisons, and is remembered on this
// device. Values always carry their own "Adjusted" / "Raw" tag, so a screenshot is never ambiguous.
import { useCallback, useSyncExternalStore } from 'react';

export type StatMode = 'adjusted' | 'raw';

const KEY = 'sift.statMode';
const listeners = new Set<() => void>();
let current: StatMode | null = null;

function read(): StatMode {
  if (current) return current;
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    current = v === 'raw' ? 'raw' : 'adjusted';
  } catch {
    current = 'adjusted';
  }
  return current;
}

export function setStatMode(m: StatMode): void {
  current = m;
  try {
    globalThis.localStorage?.setItem(KEY, m);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStatMode(): [StatMode, (m: StatMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => 'adjusted' as StatMode);
  return [mode, useCallback((m: StatMode) => setStatMode(m), [])];
}

/** Tests reset the remembered choice. */
export function resetStatMode(): void {
  current = null;
}
