// Hooks for the Team Research screen on top of the research data layer. One team profile per team page (useTeamProfile); opponents'
// profiles only for the opponents the Schedule tab shows, fetched lazily and cached for the session; the board's props only for the
// team's next game. Nothing here fetches every team.
import { useEffect, useMemo, useState } from 'react';
import { sportBySlug } from '../../../data/sports';
import { heroTeam } from '../../../lib/hero/input';
import { demoOn } from '../../state/prefs';
import { propCountsOf } from '../../model/teamResearch';
import type { NextGameVM } from '../../model/teamResearch';
import type { V3Game, V3Team } from '../../model/types';
import { deriveProps } from '../adapt';
import { useEventDetail } from '../useGameExtras';
import { useResearchRepo, useTeamIndex } from './hooks';
import { normalizeTeamProfile } from './normalize';
import type { TeamProfile } from './types';

const FALLBACK: [string, string] = ['#1d2d52', '#3f5079'];

/** A team's identity (logo, colours, names) from the slate when it is on it, else from the repository's identity tables. */
export function identityFor(slug: string, code: string, fullName: string | null, slate: V3Game[] = []): V3Team {
  for (const g of slate) for (const t of [g.away, g.home]) if (t.slug === slug && t.id === code) return t;
  const sport = sportBySlug(slug);
  const sportCode = sport?.code ?? slug.toUpperCase();
  const h = heroTeam(sportCode, code, fullName ?? code);
  return { id: code, slug, sport: sportCode, name: h?.name ?? fullName ?? code, nick: h?.short ?? fullName ?? code, abbr: code, logo: h?.logo ?? null, colors: h?.colors ?? FALLBACK };
}

const cache = new Map<string, Promise<TeamProfile | null>>();

/**
 * The profiles of the given team codes (the next few opponents), fetched lazily and cached for the session. A team that cannot be
 * loaded is null: its cells say "—" and it is retried on the next visit. Sample mode returns nothing (the screen builds sample ones).
 */
export function useProfilesByCode(slug: string, codes: string[]): { byCode: Map<string, TeamProfile | null>; pending: boolean } {
  const { repo } = useResearchRepo(slug);
  const ti = useTeamIndex(slug);
  const key = codes.join(',');
  const [got, setGot] = useState<Map<string, TeamProfile | null>>(() => new Map());
  useEffect(() => {
    if (!repo || ti.loading || !codes.length) return;
    let alive = true;
    for (const code of codes) {
      const pid = ti.byCode.get(code)?.participant_id;
      if (!pid) { setGot((m) => (m.has(code) ? m : new Map(m).set(code, null))); continue; }
      const k = `${slug}:${pid}`;
      let p = cache.get(k);
      if (!p) {
        p = repo.profile(pid).then((d) => normalizeTeamProfile(d, slug)).catch(() => { cache.delete(k); return null; });
        cache.set(k, p);
      }
      void p.then((v) => { if (alive) setGot((m) => new Map(m).set(code, v)); });
    }
    return () => { alive = false; };
    // `codes` is represented by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, ti.loading, ti.byCode, key, slug]);
  const byCode = useMemo(() => new Map(codes.filter((c) => got.has(c)).map((c) => [c, got.get(c) ?? null] as const)), [got, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { byCode, pending: !!repo && codes.some((c) => !got.has(c)) };
}

/**
 * Props listed on the team's next game, from that game's own board document: the count for "Props today" and per player. Null while
 * unknown (not loaded, or the game is not on the board): a row never claims "no props" without the board.
 */
export function useTeamProps(slug: string, next: NextGameVM | null, playerIds: string[]) {
  const real = !demoOn();
  const detail = useEventDetail(slug, next?.eventId ?? '', real && !!next);
  const ids = playerIds.join(',');
  return useMemo(() => {
    if (!detail.data) return null;
    return propCountsOf(deriveProps(detail.data.markets), playerIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, ids]);
}
