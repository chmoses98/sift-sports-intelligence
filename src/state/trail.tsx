// The research path: how the user got to this screen, shown as a breadcrumb. It resets at the roots:
// the global Home clears it, a sport home restarts it at that sport. Deeper screens append (a tab or
// filter change on the same entity replaces its step). Session storage: a new visit starts a new path.
// `recent` is a separate, longer memory of entities opened this session ("pick up where you left off"),
// unaffected by the resets.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

export type TrailKind = 'home' | 'sport' | 'slate' | 'parlays' | 'news' | 'settings' | 'game' | 'team' | 'player' | 'metric' | 'ranking' | 'market' | 'history' | 'tray' | 'packet' | 'search' | 'compare' | 'status';

export interface TrailStep {
  href: string;
  label: string;
  kind: TrailKind;
}

const KEY = 'sift.trail.v1';
const RECENT_KEY = 'sift.recent.v1';
const MAX = 14;
const RECENT_MAX = 10;

interface TrailApi {
  steps: TrailStep[];
  recent: TrailStep[];
  visit: (s: TrailStep) => void;
  clear: () => void;
}

const Ctx = createContext<TrailApi | null>(null);

function load(key: string): TrailStep[] {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '[]') as TrailStep[];
  } catch {
    return [];
  }
}

function save(key: string, v: TrailStep[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** The next path after visiting `s`. Pure, so the reset rules are unit-testable. */
export function nextTrail(prev: TrailStep[], s: TrailStep): TrailStep[] {
  if (s.kind === 'home') return [];
  if (s.kind === 'sport') return [s];
  const without = prev.filter((p) => p.href !== s.href);
  const last = without[without.length - 1];
  // A tab or filter change on the same entity replaces its step instead of adding one.
  if (last && last.label === s.label && last.kind === s.kind) without.pop();
  return [...without, s].slice(-MAX);
}

const ENTITY_KINDS = new Set<TrailKind>(['game', 'team', 'player', 'metric', 'ranking', 'market', 'history', 'compare']);

export function TrailProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TrailStep[]>(() => load(KEY));
  const [recent, setRecent] = useState<TrailStep[]>(() => load(RECENT_KEY));
  useEffect(() => save(KEY, steps), [steps]);
  useEffect(() => save(RECENT_KEY, recent), [recent]);
  const visit = useCallback((s: TrailStep) => {
    setSteps((prev) => nextTrail(prev, s));
    if (ENTITY_KINDS.has(s.kind)) setRecent((prev) => [s, ...prev.filter((p) => p.label !== s.label || p.kind !== s.kind)].slice(0, RECENT_MAX));
  }, []);
  const clear = useCallback(() => setSteps([]), []);
  const api = useMemo(() => ({ steps, recent, visit, clear }), [steps, recent, visit, clear]);
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
    if (label) document.title = kind === 'home' ? 'Sift · Sports Intelligence' : `${label} · Sift`;
  }, [label, kind, href, visit]);
}
