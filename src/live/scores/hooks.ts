import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { scoreStore } from './runtime';
import type { ScoreRead } from './store';
import type { ObservedEvent } from './types';

/** Re-render whenever the score store has new reads (a refresh, or the clock moving a chip's age). */
export function useScoreVersion(): number {
  return useSyncExternalStore(scoreStore.subscribe, scoreStore.getVersion, () => 0);
}

/**
 * Tell the score store which events this screen is showing, and get the read for any of them. The reads are display-only: a
 * screen may print them, but they never feed research, markets, projections or a game's frozen state.
 */
export function useScores(events: ObservedEvent[]): (eventId: string) => ScoreRead | null {
  useScoreVersion();
  const token = useId();
  const latest = useRef(events);
  latest.current = events;
  const key = events.map((e) => `${e.ref.eventId}@${e.ref.startUtc}`).join('|');
  useEffect(() => {
    scoreStore.observe(token, latest.current);
    return () => scoreStore.release(token);
  }, [token, key]);
  return (id) => scoreStore.read(id);
}
