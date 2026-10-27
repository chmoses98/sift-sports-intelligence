// Stat Detail's hooks over the research data layer. Everything is lazy and cached by the shared async memo: the ranking catalog reads
// two team profiles that Team Research already holds, a ranking document is fetched only for the statistic being opened, and a
// series only for the selected team's one metric. Sample-data mode (?demo=1) returns nothing from here; the screen falls back to the
// labelled sample view model in useStat.ts (kept as it was, other screens import from it).
import { useMemo } from 'react';
import type { SeriesDoc } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import { buildRankingCatalog, nextGame } from './research/normalize';
import { useResearchRepo, useSchedule, useTeamIndex, useTeamProfile } from './research/hooks';
import type { RankingCatalog, ScheduleEvent } from './research/types';

/** Which ranking is which, from the profiles' own lists: the first team's and the selected team's (the same list; the second is free insurance). */
export function useStatCatalog(slug: string, selCode: string | null): { catalog: RankingCatalog | null; season: string | null; loading: boolean; explorer: boolean; failure: unknown; retry: () => void } {
  const { explorer, loading: rl } = useResearchRepo(slug);
  const ti = useTeamIndex(slug);
  const first = useTeamProfile(slug, ti.teams[0]?.short_name ?? null);
  const sel = useTeamProfile(slug, selCode && selCode !== ti.teams[0]?.short_name ? selCode : null);
  const catalog = useMemo(() => {
    const docs = [first.raw, sel.raw].filter((d): d is NonNullable<typeof d> => !!d);
    return docs.length ? buildRankingCatalog(docs) : null;
  }, [first.raw, sel.raw]);
  return { catalog, season: first.profile?.season ?? null, loading: rl || ti.loading || first.loading, explorer, failure: ti.failure ?? first.failure, retry: () => { ti.retry(); first.retry(); } };
}

/** One published per-game series, fetched only when asked for. */
export function useSeries(slug: string, seriesId: string | null): { series: SeriesDoc | null; loading: boolean; error: boolean } {
  const { repo } = useResearchRepo(slug);
  const doc = useAsync<SeriesDoc>(repo && seriesId ? `v3r:ser:${slug}:${seriesId}` : null, () => repo!.series(seriesId!));
  return { series: doc.data ?? null, loading: !!seriesId && doc.loading, error: !!doc.error };
}

/**
 * The selected team's next opponent, from the league schedule (never from Kalshi event metadata). An explicit `opp` in the address
 * wins (Team Research and Game Detail pass the opponent they know); otherwise the schedule decides. `event` is the upcoming game
 * between the two, for the Game matchup chip.
 */
export function useNextOpponent(slug: string, selCode: string | null, oppParam: string | null): { opp: string | null; event: ScheduleEvent | null; loading: boolean } {
  const ti = useTeamIndex(slug);
  const sched = useSchedule(slug);
  return useMemo(() => {
    const selPid = selCode ? ti.byCode.get(selCode)?.participant_id ?? null : null;
    if (!selPid) return { opp: oppParam, event: null, loading: ti.loading || sched.loading };
    const code = (id: string | null) => (id ? ti.byId.get(id)?.short_name ?? null : null);
    const nxt = nextGame(sched.schedule, selPid, Date.now());
    const otherOf = (e: ScheduleEvent) => (e.homeId === selPid ? e.awayId : e.homeId);
    if (oppParam) {
      const oppPid = ti.byCode.get(oppParam)?.participant_id ?? null;
      const between = oppPid ? nextGame(sched.schedule.filter((e) => (e.homeId === selPid && e.awayId === oppPid) || (e.awayId === selPid && e.homeId === oppPid)), selPid, Date.now()) : null;
      return { opp: oppParam, event: between, loading: false };
    }
    return { opp: nxt ? code(otherOf(nxt)) : null, event: nxt, loading: false };
  }, [selCode, oppParam, ti.byCode, ti.byId, ti.loading, sched.schedule, sched.loading]);
}
