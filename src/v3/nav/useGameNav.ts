// The hooks Game Detail uses for Back and for switching games (see ./origin.ts for the model).
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from '../../routing';
import { gameHref } from '../ui/gamebits';
import type { V3Game } from '../model/types';
import { sheetBridge } from './sheetBridge';
import { carryOrigin, originFor, planBack, positionOf, readOrigin, withOrigin } from './origin';

const here = () => positionOf(typeof window !== 'undefined' ? window.history.state : null);

/** Call once in a game screen: records where the game was opened from on the entry it is on (once, in place, before paint). */
export function useGameOriginMark(): void {
  const loc = useLocation();
  const nav = useNavigate();
  useLayoutEffect(() => {
    if (readOrigin(loc.state) !== undefined) return;
    nav({ pathname: loc.pathname, search: loc.search, hash: loc.hash }, { replace: true, state: withOrigin(loc.state, originFor(here())), preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key]);
}

/** Back from a game: straight to the screen it was opened from (Home, Props, Following, search, a team...), however many games were switched through. */
export function useGameBack(): () => void {
  const nav = useNavigate();
  const loc = useLocation();
  const live = useRef(loc);
  live.current = loc;
  return useCallback(() => {
    const plan = planBack(live.current.state, here());
    if (plan.kind === 'pop') nav(plan.delta);
    else nav(plan.to, { replace: true });
  }, [nav]);
}

/** Switch to another game in place: the entry is replaced (history does not grow), the origin is carried, the tab is kept. */
export function useSwitchGame(): (g: Pick<V3Game, 'slug' | 'eventId'>, tab?: string) => void {
  const nav = useNavigate();
  const loc = useLocation();
  const live = useRef(loc);
  live.current = loc;
  return useCallback((g, tab) => {
    const go = () => nav(gameHref(g, tab), { replace: true, state: carryOrigin(live.current.state) });
    // From the switch sheet: close it first (its own entry steps back), then replace the game entry underneath.
    if (!sheetBridge.afterClose(go)) go();
  }, [nav]);
}
