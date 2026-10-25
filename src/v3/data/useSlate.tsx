// The slate behind Home, Games, Following and the Game Switcher, provided once at the shell so every screen shares one cached
// list (Back is instant). Real mode reads every published board through the app's opportunity layer; demo mode (explicit,
// labelled everywhere) reads fixtures. Both produce V3Game[] in the same order: live, then upcoming by start, then
// awaiting-result, then finals.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { gameRows, slateOrder } from '../../views/broadcast/games';
import { useScores } from '../../live/scores/hooks';
import { useFeedEnabled } from '../../live/scores/feed';
import { observedFor, periodClock, shownState } from '../../v4/scoreState';
import { demoGames } from '../demo/fixtures';
import { toGame } from './adapt';
import type { V3Game } from '../model/types';

export interface Slate {
  games: V3Game[];
  loading: boolean;
  /** Every feed failed: say so rather than show an empty list. */
  unavailable: boolean;
  /** Feeds that failed while others loaded. */
  failed: string[];
  now: number;
  demo: boolean;
}

const phaseRank = (g: V3Game) => (g.phase === 'live' ? 0 : g.phase === 'pregame' ? 1 : g.phase === 'other' ? 2 : 3);
export const slateCompare = (a: V3Game, b: V3Game) => phaseRank(a) - phaseRank(b) || a.startMs - b.startMs || a.key.localeCompare(b.key);

const Ctx = createContext<Slate | null>(null);

export function useSlate(): Slate {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSlate outside SlateProvider');
  return s;
}

export function useGameByKey(key: string | undefined) {
  const s = useSlate();
  return { ...s, game: useMemo(() => s.games.find((g) => g.key === key) ?? null, [s.games, key]) };
}

function RealProvider({ children }: { children: ReactNode }) {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now).sort(slateOrder), [all.bundles, all.opportunities, now]);
  const feedOn = useFeedEnabled();
  const evs = useMemo(() => (feedOn ? observedFor(rows, now) : []), [feedOn, rows, now]);
  const read = useScores(evs);
  const games = useMemo<V3Game[]>(() => rows.map((r) => {
    const g = toGame(r);
    const rd = feedOn ? read(r.item.event_id) : null;
    const st = shownState(rd);
    if (rd?.game?.score && (st === 'live' || st === 'over')) {
      g.score = { away: rd.game.score.away, home: rd.game.score.home, clock: st === 'over' ? 'Final' : periodClock(rd) || 'Live', source: 'score-feed', asOf: null, stale: rd.view.mode === 'LAST_KNOWN' || rd.view.mode === 'DELAYED' };
      g.phase = st === 'over' ? 'final' : 'live';
    }
    return g;
  }).sort(slateCompare), [rows, feedOn, read]);
  const failed = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failed.length === all.bundles.length);
  const value = useMemo<Slate>(() => ({ games, loading: all.loading, unavailable, failed: failed.map((b) => b.sport.label), now, demo: false }), [games, all.loading, unavailable, failed, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function DemoProvider({ children }: { children: ReactNode }) {
  const now = useNow(60_000);
  const day = new Date(now).toDateString();
  // Fixture kickoffs are fixed clock times on today's date, so the sample slate is the same every time it is opened.
  const games = useMemo(() => demoGames(new Date(day).getTime()).sort(slateCompare), [day]);
  const value = useMemo<Slate>(() => ({ games, loading: false, unavailable: false, failed: [], now, demo: true }), [games, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SlateProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  return demo ? <DemoProvider>{children}</DemoProvider> : <RealProvider>{children}</RealProvider>;
}
