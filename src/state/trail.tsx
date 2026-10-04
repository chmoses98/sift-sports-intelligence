// The research path: the last places this session visited, so the user can see how they got here
// and jump sideways back to any of them. Session storage: a new visit starts a new path.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

export type TrailKind = 'home' | 'sport' | 'game' | 'team' | 'player' | 'metric' | 'ranking' | 'market' | 'history' | 'tray' | 'packet' | 'search' | 'compare' | 'status';

export interface TrailStep {
  href: string;
  label: string;
  kind: TrailKind;
}

const KEY = 'sift.trail.v1';
const MAX = 14;

interface TrailApi {
  steps: TrailStep[];
  visit: (s: TrailStep) => void;
  clear: () => void;
}

const Ctx = createContext<TrailApi | null>(null);

function load(): TrailStep[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as TrailStep[];
  } catch {
    return [];
  }
}

export function TrailProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TrailStep[]>(load);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(steps));
    } catch {
      /* ignore */
    }
  }, [steps]);
  const visit = useCallback((s: TrailStep) => {
    setSteps((prev) => {
      const without = prev.filter((p) => p.href !== s.href);
      const last = without[without.length - 1];
      // A tab or filter change on the same entity replaces its step instead of adding one.
      if (last && last.label === s.label && last.kind === s.kind) without.pop();
      return [...without, s].slice(-MAX);
    });
  }, []);
  const clear = useCallback(() => setSteps([]), []);
  const api = useMemo(() => ({ steps, visit, clear }), [steps, visit, clear]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTrail(): TrailApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrail outside TrailProvider');
  return v;
}

/** Record the current screen in the research path once its label is known. */
export function useVisit(label: string | null | undefined, kind: TrailKind): void {
  const { visit } = useTrail();
  const loc = useLocation();
  const href = loc.pathname + loc.search;
  useEffect(() => {
    if (label) visit({ href, label, kind });
    if (label) document.title = `${label} · Sift`;
  }, [label, kind, href, visit]);
}
