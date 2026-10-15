import type { EventResearchDoc } from '../contract/types';
import { useAsync } from '../data/hooks';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { sportByCode } from '../data/sports';

/** NFL event research for the coming week's games (the matchup mismatches), read once and memoised. */
export function useNflResearch(eventIds: string[]) {
  const key = eventIds.join(',');
  return useAsync(key ? `terminal:nfl:${key}` : null, async () => {
    const sport = sportByCode('NFL');
    if (!sport) return [] as EventResearchDoc[];
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return [];
    const out = await Promise.allSettled(eventIds.map((id) => repo.eventResearch(id)));
    return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
  });
}
