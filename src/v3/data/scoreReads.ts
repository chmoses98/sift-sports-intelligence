// What the slate needs from the score store: the VERIFIED score of each observed game (data/scoreVerify.ts), and a re-render only when one of them
// changes. The score store recomputes every second while any screen observes games (its clock moves a chip's age) and notifies on every recompute;
// subscribing to that notification (`useScores`) re-built the whole slate, ~600 games, every second, and re-rendered every screen that reads it.
// Here the subscription is to a signature of what would be PRINTED (score, clock, over, delayed per game): it changes when a score does, not when a
// second passes. The store itself (src/live/scores) is untouched; this only decides when the slate listens.
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { scoreStore } from '../../live/scores/runtime';
import type { ObservedEvent } from '../../live/scores/types';
import { verifyScore, type ScoreVerdict } from './scoreVerify';

interface Held { version: number; key: string; sig: string; verdicts: Map<string, ScoreVerdict> }

export function useVerifiedScores(events: ObservedEvent[]): (eventId: string) => ScoreVerdict | null {
  const token = useId();
  const latest = useRef(events);
  latest.current = events;
  const key = events.map((e) => `${e.ref.eventId}@${e.ref.startUtc}`).join('|');
  useEffect(() => {
    scoreStore.observe(token, latest.current);
    return () => scoreStore.release(token);
  }, [token, key]);
  const held = useRef<Held>({ version: -1, key: '', sig: '', verdicts: new Map() });
  const snapshot = (): string => {
    const version = scoreStore.getVersion();
    const h = held.current;
    if (h.version === version && h.key === key) return h.sig;
    const verdicts = new Map<string, ScoreVerdict>();
    let sig = '';
    for (const e of latest.current) {
      const rd = scoreStore.read(e.ref.eventId);
      if (!rd) continue;
      const v = verifyScore(rd);
      verdicts.set(e.ref.eventId, v);
      if (v.show) sig += `${e.ref.eventId}:${v.away}-${v.home}|${v.clock}|${v.over ? 1 : 0}${v.delayed ? 1 : 0};`;
    }
    held.current = { version, key, sig, verdicts };
    return sig;
  };
  const sig = useSyncExternalStore(scoreStore.subscribe, snapshot, () => '');
  // A new function (so a memo that reads scores recomputes) only when a printed score changed; it answers from the verdicts of that moment.
  return useCallback((id: string) => held.current.verdicts.get(id) ?? null, [sig, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `sig` is the change signal
}
