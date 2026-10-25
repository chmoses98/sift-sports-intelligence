// Per-game documents, read lazily and merged onto the slate's V3Game: the Kalshi lines (event_detail, every sport), a
// finished game's published score and the verified venue photo (event research). Demo games already carry everything.
import { useMemo } from 'react';
import { useAsync } from '../../data/hooks';
import { SportRepo } from '../../data/repo';
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

/** `want`: 'lines' (list rows), 'full' (Game Detail: also the research document and the photo). */
export function useGameExtras(g: V3Game | null, want: 'lines' | 'full', enabled = true): GameExtras | null {
  const real = !!g && g.provenance === 'publication';
  const detail = useEventDetail(g?.slug ?? '', g?.eventId ?? '', real && enabled);
  const needResearch = real && enabled && (want === 'full' || g!.phase === 'final');
  const research = useGameResearch(needResearch ? g!.slug : null, needResearch ? g!.eventId : null);
  return useMemo(() => {
    if (!g) return null;
    if (!real) return { game: g, detailLoading: false };
    let out = g;
    const d = detail.data;
    if (d) {
      const lines = deriveLines(d.markets ?? [], g.away, g.home, { away: d.event.away_participant ?? null, home: d.event.home_participant ?? null });
      out = { ...out, lines };
    }
    const r = research.data;
    if (g.phase === 'final' && !g.score) {
      const fs = finalScores((r?.extensions as { result?: unknown } | null)?.result) ?? finalScores(r?.event?.extensions);
      if (fs) out = { ...out, score: { away: fs.away, home: fs.home, clock: 'Final', source: 'publication', asOf: r?.generated_at ?? null } };
    }
    if (want === 'full' && g.item) out = { ...out, photo: photoFor(g.item, g.sport, r ?? null) };
    return { game: out, detailLoading: detail.loading };
  }, [g, real, detail.data, detail.loading, research.data, want]);
}
