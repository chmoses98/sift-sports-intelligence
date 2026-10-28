// The slate behind Home, Games, Following and the Game Switcher, provided once at the shell so every screen shares one cached
// list (Back is instant). Real mode reads every published board through the app's opportunity layer; demo mode (explicit,
// labelled everywhere) reads fixtures. Both produce V3Game[] in the same order: live, then upcoming by start, then
// awaiting-result, then finals.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveSource } from '../../data/source';
import { useNow } from '../../live/hooks';
import { useAllOpportunities } from '../../opportunity/load';
import { gameRows, slateOrder } from '../../views/broadcast/games';
import { useScores } from '../../live/scores/hooks';
import { useFeedEnabled } from '../../live/scores/feed';
import { observedFor } from '../../v4/scoreState';
import { verifyScore } from './scoreVerify';
import { demoGames } from '../demo/fixtures';
import { dayKey } from '../model/time';
import { toGame } from './adapt';
import { knownSchedule, useScheduleVersion, withScheduleStarts } from './research/scheduleStarts';
import type { V3Game } from '../model/types';

export interface Slate {
  games: V3Game[];
  loading: boolean;
  /** Every feed failed: say so rather than show an empty list. */
  unavailable: boolean;
  /** Feeds that failed while others loaded. */
  failed: string[];
  /** Sports whose live publication could not be read and whose research comes from the saved copy bundled with the app (never silent). */
  saved: { label: string; slug: string; builtAt: string | null }[];
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
  // Lean: no quote is registered for the slate (nothing in it prints a price; the screens that do - Games cards, Game Detail, Player, Props -
  // register the contracts they print, so registering every candidate polled ~45 game files on every screen) and the NHL/tennis settled-record
  // documents are not read (they only feed record text of an opportunity, which the slate never prints; the candidate count does not depend on them).
  const all = useAllOpportunities(now, { lean: true });
  // Start times: the league schedule (explorer) where it has been read, else the board's own (the same schedule, as published).
  const scheduleVersion = useScheduleVersion();
  const bundles = useMemo(() => withScheduleStarts(all.bundles, knownSchedule), [all.bundles, scheduleVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- the registry changes under a stable lookup
  const rows = useMemo(() => gameRows(bundles, all.opportunities, now).sort(slateOrder), [bundles, all.opportunities, now]);
  const feedOn = useFeedEnabled();
  const evs = useMemo(() => (feedOn ? observedFor(rows, now) : []), [feedOn, rows, now]);
  const read = useScores(evs);
  const games = useMemo<V3Game[]>(() => rows.map((r) => {
    const g = toGame(r);
    const rd = feedOn ? read(r.item.event_id) : null;
    // Only a VERIFIED score is shown (data/scoreVerify.ts): matched to this event by identity evidence, in play or final, a plausible pair of
    // whole numbers. A verified score that is a little old keeps showing with `delayed`; an older or unreliable one is not shown at all.
    const v = rd ? verifyScore(rd) : null;
    if (v?.show) {
      g.score = { away: v.away, home: v.home, clock: v.clock, source: 'score-feed', asOf: null, ...(v.delayed ? { delayed: true } : {}) };
      g.phase = v.over ? 'final' : 'live';
    }
    return g;
  }).sort(slateCompare), [rows, feedOn, read]);
  const failed = all.bundles.filter((b) => b.error != null);
  const [saved, setSaved] = useState<Slate['saved']>([]);
  useEffect(() => {
    let live = true;
    // resolveSource is the app's own cached source decision (live publication, else the bundled saved copy); reading it adds no request.
    Promise.all(all.bundles.filter((b) => b.error == null).map((b) => resolveSource(b.sport).catch(() => null))).then((srcs) => {
      if (live) setSaved(srcs.filter((x): x is NonNullable<typeof x> => x != null && x.mode === 'snapshot').map((x) => ({ label: x.sport.label, slug: x.sport.slug, builtAt: x.snapshot?.explorer_built_at ?? null })));
    });
    return () => { live = false; };
  }, [all.bundles]);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failed.length === all.bundles.length);
  const value = useMemo<Slate>(() => ({ games, loading: all.loading, unavailable, failed: failed.map((b) => b.sport.label), saved, now, demo: false }), [games, all.loading, unavailable, failed, saved, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function DemoProvider({ children }: { children: ReactNode }) {
  const now = useNow(60_000);
  const day = dayKey(now) ?? '';
  // Fixture kickoffs are fixed clock times on today's date, so the sample slate is the same every time it is opened.
  const games = useMemo(() => demoGames(day).sort(slateCompare), [day]);
  const value = useMemo<Slate>(() => ({ games, loading: false, unavailable: false, failed: [], saved: [], now, demo: true }), [games, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SlateProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  return demo ? <DemoProvider>{children}</DemoProvider> : <RealProvider>{children}</RealProvider>;
}
