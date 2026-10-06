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
  visit: (s: TrailStep, parent?: TrailStep | null) => void;
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

const pathOf = (href: string) => href.split('?')[0];
const GAME_KINDS = new Set<TrailKind>(['game', 'history']);

/**
 * The next path after visiting `s`. Pure, so the rules are unit-testable.
 *
 * The path is how the user got here, but it never claims a context the screen does not have:
 * - a game is a root under its sport: opening a game drops any other game (and what followed it);
 * - a screen that belongs to something (a player to his game, a market to its game) names it as `parent`;
 *   when the path does not run through that parent, the path restarts at the sport and the parent.
 */
export function nextTrail(prev: TrailStep[], s: TrailStep, parent?: TrailStep | null): TrailStep[] {
  if (s.kind === 'home') return [];
  if (s.kind === 'sport') return [s];
  let without = prev.filter((p) => p.href !== s.href);
  if (GAME_KINDS.has(s.kind)) {
    const i = without.findIndex((p) => GAME_KINDS.has(p.kind) && pathOf(p.href) !== pathOf(s.href));
    if (i >= 0) without = without.slice(0, i);
  }
  if (parent && !without.some((p) => pathOf(p.href) === pathOf(parent.href))) {
    without = [...without.filter((p) => p.kind === 'sport'), parent];
  }
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
  const visit = useCallback((s: TrailStep, parent?: TrailStep | null) => {
    setSteps((prev) => nextTrail(prev, s, parent));
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

/**
 * Record the current screen in the research path once its label is known. `parent` is the screen this one
 * belongs to (a player's game, a market's game); pass the label as null until the parent is known, so the
 * path never shows a stale context, even for a moment.
 */
export function useVisit(label: string | null | undefined, kind: TrailKind, parent?: TrailStep | null): void {
  const { visit } = useTrail();
  const loc = useLocation();
  const href = loc.pathname + loc.search;
  const pHref = parent?.href;
  const pLabel = parent?.label;
  const pKind = parent?.kind;
  useEffect(() => {
    if (label) visit({ href, label, kind }, pHref && pLabel && pKind ? { href: pHref, label: pLabel, kind: pKind } : null);
    if (label) document.title = kind === 'home' ? 'Sift · Sports Intelligence' : `${label} · Sift`;
  }, [label, kind, href, visit, pHref, pLabel, pKind]);
}
