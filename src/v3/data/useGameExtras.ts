// Per-game documents, read lazily and merged onto the slate's V3Game: the Kalshi lines (event_detail, every sport), a
// finished game's published score and the verified venue photo (event research). Demo games already carry everything.
import { useMemo } from 'react';
import { useLiveQuotes } from '../../live/hooks';
import { overlayLive } from './liveMarket';
import { useAsync } from '../../data/hooks';
import { SportRepo } from '../../data/repo';
import { NotFoundError } from '../../data/fetcher';
import { resolveSource } from '../../data/source';
import { sportBySlug } from '../../data/sports';
import { useGameResearch } from '../../views/broadcast/parts';
import { finalScores } from '../../views/broadcast/lifecycle';
import type { V3Game } from '../model/types';
import { deriveLines, photoFor } from './adapt';

export interface GameExtras {
  game: V3Game;
  /** The raw documents, for screens that need more than the view-model (Matchup, Lens, markets). */
  detailLoading: boolean;
}

export function useEventDetail(slug: string, eventId: string, enabled: boolean) {
  return useAsync(enabled ? `v3detail:${slug}:${eventId}` : null, async () => {
    const sport = sportBySlug(slug);
    if (!sport) throw new Error(`unknown sport ${slug}`);
    return new SportRepo(await resolveSource(sport)).eventDetail(eventId);
  });
}

/**
 * The event's research document, with failures kept (the shared `useGameResearch` turns every failure into "none"). A document that is not
 * published for this game (404) is `null` data: that is an answer. A connection failure, a timeout or a body that cannot be read is an error
 * the screen says out loud, with a Retry.
 */
export function useEventResearch(slug: string, eventId: string, enabled: boolean) {
  return useAsync(enabled ? `v3er:${slug}:${eventId}` : null, async () => {
    const sport = sportBySlug(slug);
    if (!sport) throw new Error(`unknown sport ${slug}`);
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return null;
    return repo.eventResearch(eventId).catch((e: unknown) => { if (e instanceof NotFoundError) return null; throw e; });
  });
}

/**
 * `want`: 'lines' (list rows), 'full' (Game Detail: also the research document and the photo), 'photo' (Home's featured card: the research document and the
 * photo, no contract document and no quote: that card prints no price).
 */
export function useGameExtras(g: V3Game | null, want: 'lines' | 'full' | 'photo', enabled = true): GameExtras | null {
  const real = !!g && g.provenance === 'publication';
  const detail = useEventDetail(g?.slug ?? '', g?.eventId ?? '', real && enabled && want !== 'photo');
  const needResearch = real && enabled && (want !== 'lines' || g!.phase === 'final');
  const research = useGameResearch(needResearch ? g!.slug : null, needResearch ? g!.eventId : null);
  // Lines: derived from the publication's capture, then re-derived with any NEWER live quote (the app's own overlay: a quote is only
  // ever replaced by a newer observation, so a failed refresh can never make a price look newer than it is).
  const markets = detail.data?.markets;
  const first = useMemo(() => (g && markets ? deriveLines(markets, g.away, g.home, { away: detail.data?.event.away_participant ?? null, home: detail.data?.event.home_participant ?? null }) : []), [g, markets, detail.data]);
  const tickers = useMemo(() => first.flatMap((l) => (want === 'full' ? (l.alternates ?? [l.price]) : [l.price]).map((p) => p.ticker)), [first, want]);
  const live = useLiveQuotes(real && enabled ? tickers : undefined, want === 'full' ? 'detail' : 'slate');
  return useMemo(() => {
    if (!g) return null;
    if (!real) return { game: g, detailLoading: false };
    let out = g;
    const d = detail.data;
    if (d) {
      const overlaid = d.markets.map((m) => overlayLive(m, live.quote(m.kalshi_ticker)));
      out = { ...out, lines: deriveLines(overlaid, g.away, g.home, { away: d.event.away_participant ?? null, home: d.event.home_participant ?? null }) };
    }
    const r = research.data;
    if (g.phase === 'final' && !g.score) {
      const fs = finalScores((r?.extensions as { result?: unknown } | null)?.result) ?? finalScores(r?.event?.extensions);
      if (fs) out = { ...out, score: { away: fs.away, home: fs.home, clock: 'Final', source: 'publication', asOf: r?.generated_at ?? null } };
    }
    if (want !== 'lines' && g.item) out = { ...out, photo: photoFor(g.item, g.sport, r ?? null) };
    return { game: out, detailLoading: detail.loading };
    // live.version: the store's quotes change under a stable lookup function
  }, [g, real, detail.data, detail.loading, research.data, want, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
}
