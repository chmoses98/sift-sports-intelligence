// Hooks over the research data layer. Everything is lazy and cached by the shared async memo (research documents revalidate on the
// research clock). One team profile answers a team's whole statistic list (rank, percentile and ranking id per window), so Team
// Research and the Stat Detail highlight need no ranking fetches; a ranking document is fetched only when a statistic is opened.
// Sample-data mode (?demo=1) returns nothing from here: screens fall back to their labelled sample view models.
import { useEffect, useMemo } from 'react';
import type { EntityProfileDoc, MetricDef, RankingDoc } from '../../../contract/types';
import { useAsync, useRepo } from '../../../data/hooks';
import type { SportRepo } from '../../../data/repo';
import { sportBySlug } from '../../../data/sports';
import { demoOn } from '../../state/prefs';
import { registerSchedule } from './scheduleStarts';
import { buildRankingCatalog, nextGame, normalizeRanking, normalizeTeamProfile, scheduleOf } from './normalize';
import type { RankingCatalog, RankingVM, ScheduleEvent, TeamProfile } from './types';

/** The repo for a sport, or nothing in sample mode / when the sport publishes no explorer. */
export function useResearchRepo(slug: string): { repo: SportRepo | undefined; loading: boolean; demo: boolean; explorer: boolean } {
  const demo = demoOn();
  const sport = sportBySlug(slug);
  const r = useRepo(demo ? undefined : sport);
  return { repo: r.data?.hasExplorer ? r.data : undefined, loading: !demo && r.loading, demo, explorer: !!r.data?.hasExplorer };
}

export function useMetricDefs(slug: string) {
  const { repo } = useResearchRepo(slug);
  return useAsync(repo ? `v3r:defs:${slug}` : null, () => repo!.metricMap());
}

export function useSchedule(slug: string): { schedule: ScheduleEvent[]; loading: boolean; next: (participantId: string, now?: number) => ScheduleEvent | null } {
  const { repo } = useResearchRepo(slug);
  const idx = useAsync(repo ? `v3r:idx:${slug}` : null, () => repo!.index());
  const schedule = useMemo(() => (idx.data ? scheduleOf(idx.data) : []), [idx.data]);
  // The league schedule is the start-time authority: tell the slate once it is known (data/research/scheduleStarts.ts).
  useEffect(() => { if (slug && idx.data && schedule.length) registerSchedule(slug, schedule, idx.data); }, [slug, schedule, idx.data]);
  return { schedule, loading: idx.loading, next: (pid, now = Date.now()) => nextGame(schedule, pid, now) };
}

/** participant id of a team code ("DAL"), from the explorer index. */
export function useTeamIndex(slug: string) {
  const { repo, loading: rl } = useResearchRepo(slug);
  const idx = useAsync(repo ? `v3r:idx:${slug}` : null, () => repo!.index());
  const byCode = useMemo(() => new Map((idx.data?.teams ?? []).map((t) => [t.short_name ?? '', t])), [idx.data]);
  const byId = useMemo(() => new Map((idx.data?.teams ?? []).map((t) => [t.participant_id, t])), [idx.data]);
  return { byCode, byId, teams: idx.data?.teams ?? [], asOf: idx.data?.as_of ?? null, loading: rl || idx.loading };
}

/** A team's normalized profile: one document, every statistic and window. */
export function useTeamProfile(slug: string, code: string | null): { profile: TeamProfile | null; loading: boolean; error: boolean; raw: EntityProfileDoc | undefined } {
  const { repo } = useResearchRepo(slug);
  const ti = useTeamIndex(slug);
  const pid = code ? ti.byCode.get(code)?.participant_id ?? null : null;
  const doc = useAsync<EntityProfileDoc>(repo && pid ? `v3r:prof:${slug}:${pid}` : null, () => repo!.profile(pid!));
  const profile = useMemo(() => (doc.data ? normalizeTeamProfile(doc.data, slug) : null), [doc.data, slug]);
  return { profile, loading: ti.loading || doc.loading, error: !!doc.error || (!ti.loading && !!code && !pid && !!repo), raw: doc.data };
}

/** Which ranking is which for a sport, read from one team profile's own list. Cheap: the profile is cached for Team Research. */
export function useRankingCatalog(slug: string): { catalog: RankingCatalog | null; loading: boolean } {
  const { repo } = useResearchRepo(slug);
  const ti = useTeamIndex(slug);
  const first = ti.teams[0]?.participant_id ?? null;
  const doc = useAsync<EntityProfileDoc>(repo && first ? `v3r:prof:${slug}:${first}` : null, () => repo!.profile(first!));
  const catalog = useMemo(() => (doc.data ? buildRankingCatalog([doc.data]) : null), [doc.data]);
  return { catalog, loading: ti.loading || doc.loading };
}

/** One ranking, fetched only when asked for. */
export function useRankingDoc(slug: string, rankingId: string | null): { ranking: RankingVM | null; loading: boolean; error: boolean } {
  const { repo } = useResearchRepo(slug);
  const defs = useMetricDefs(slug);
  const ti = useTeamIndex(slug);
  const doc = useAsync<RankingDoc>(repo && rankingId ? `v3r:rk:${slug}:${rankingId}` : null, () => repo!.ranking(rankingId!));
  const ranking = useMemo(() => {
    if (!doc.data) return null;
    const def: MetricDef | undefined = defs.data?.get(doc.data.metric_id);
    return normalizeRanking(doc.data, def, (id, short) => short ?? ti.byId.get(id)?.short_name ?? id);
  }, [doc.data, defs.data, ti.byId]);
  return { ranking, loading: doc.loading || defs.loading, error: !!doc.error };
}
