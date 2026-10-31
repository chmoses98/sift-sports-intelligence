// Game Detail's live feed: which source (if any) this build may read for the game's sport (rights.ts), polled while the page is visible (poll.ts),
// aged honestly (freshness.ts). One hook, one poller per open game; nothing is requested for a game that is not in play, a sample game, a sport
// with no cleared source, or while the viewer has live scores switched off (the existing switch, src/live/scores/feed.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '../../../live/hooks';
import { useFeedEnabled } from '../../../live/scores/feed';
import type { V3Game } from '../../model/types';
import { detailFreshness, situationText } from './freshness';
import { fetchMlbDetail, MLB_POLL_MS } from './mlb';
import { startPoller } from './poll';
import { chooseSource, type DetailSourceInfo } from './rights';
import type { DetailTarget, Freshness, LiveDetail } from './types';

export type LiveDetailState =
  /** Not a live game worth asking about (pregame, final, sample). */
  | { kind: 'off' }
  /** A live game, but the viewer has switched live scores off on this device (the existing switch): nothing is requested. */
  | { kind: 'disabled' }
  /** No source covers this sport at all. */
  | { kind: 'none' }
  /** A source exists but its rights are unresolved: nothing is requested. */
  | { kind: 'blocked'; source: DetailSourceInfo }
  /** A cleared source that carries a score and period only (SportScore): the state is the slate's verified score; plays and box score do not exist. */
  | { kind: 'score-only'; source: DetailSourceInfo }
  | { kind: 'loading'; source: DetailSourceInfo }
  /** `error` is set when the latest refresh failed: `detail` is then the last good answer, with its real age. */
  | { kind: 'ready'; source: DetailSourceInfo; detail: LiveDetail | null; freshness: Freshness | null; error: unknown; retry: () => void };

export function targetOf(g: V3Game, startMs: number | null): DetailTarget {
  return { sport: g.sport, eventId: g.eventId, startMs: startMs ?? g.startMs, away: { name: g.away.name, abbr: g.away.abbr }, home: { name: g.home.name, abbr: g.home.abbr } };
}

export function useLiveDetail(g: V3Game | null, startMs: number | null): LiveDetailState {
  const feedOn = useFeedEnabled();
  const now = useNow(5_000);
  const inPlay = !!g && g.provenance === 'publication' && g.phase === 'live';
  const eligible = inPlay && feedOn;
  const choice = useMemo(() => (g ? chooseSource(g.sport) : null), [g?.sport]); // eslint-disable-line react-hooks/exhaustive-deps
  const fetching = eligible && choice?.kind === 'source' && choice.source.fetchesDetail ? choice.source : null;
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const cache = useRef(new Map<string, number>());
  const key = g ? `${g.key}|${fetching?.id ?? ''}` : '';
  const start = startMs ?? g?.startMs ?? null;
  const gRef = useRef(g);
  gRef.current = g;

  useEffect(() => {
    setDetail(null); setError(null);
    if (!fetching || !gRef.current) return;
    const target = targetOf(gRef.current, start);
    return startPoller<LiveDetail>({
      intervalMs: MLB_POLL_MS,
      fetch: (signal) => fetchMlbDetail(target, { signal, pkCache: cache.current }),
      onData: (d) => { setDetail(d); setError(null); },
      onError: (e) => setError(e), // the last answer stays (aged); the screen says the refresh failed
    });
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useCallback(() => setTick((n) => n + 1), []);

  return useMemo<LiveDetailState>(() => {
    if (!inPlay || !choice) return { kind: 'off' };
    if (!feedOn) return { kind: 'disabled' };
    if (choice.kind === 'none') return { kind: 'none' };
    if (choice.kind === 'blocked') return { kind: 'blocked', source: choice.source };
    if (!choice.source.fetchesDetail) return { kind: 'score-only', source: choice.source };
    if (!detail && !error) return { kind: 'loading', source: choice.source };
    return { kind: 'ready', source: choice.source, detail, freshness: detail ? detailFreshness(detail, now) : null, error, retry };
  }, [inPlay, feedOn, choice, detail, error, now, retry]);
}

/**
 * The game as the hero and the compact bar print it: when the slate has no verified score and a cleared detail source answered freshly enough, its
 * score and period stand in, labelled as a score-feed score. Stale detail is never printed. A score the slate already verified is left alone.
 */
export function withLiveDetail(g: V3Game, s: LiveDetailState): V3Game {
  if (s.kind !== 'ready' || !s.detail || s.freshness === 'withheld' || g.phase !== 'live') return g;
  const d = s.detail;
  let out = g;
  if (!g.score && d.score && (d.phase === 'live' || d.phase === 'break')) {
    out = { ...out, score: { away: d.score.away, home: d.score.home, clock: d.period.label, source: 'score-feed', asOf: new Date(d.providerAt ?? d.fetchedAt).toISOString(), delayed: s.freshness === 'delayed' } };
  }
  const text = situationText(d.situation);
  if (!g.situation && text) out = { ...out, situation: { text } };
  return out;
}
