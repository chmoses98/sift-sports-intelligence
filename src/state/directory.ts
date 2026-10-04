// Names for ids, from the explorer index (teams, events) and the search index (players), so any
// screen can label an opponent or a player without fetching their profile.
import type { ExplorerIndexDoc, SearchEntry } from '../contract/types';
import { useAsync } from '../data/hooks';
import type { SportRepo } from '../data/repo';

export interface Directory {
  index: ExplorerIndexDoc;
  team: (id: string | null | undefined) => { name: string; abbr: string | null } | null;
  player: (id: string | null | undefined) => SearchEntry | null;
  teamByAbbr: (abbr: string | null | undefined) => string | null;
  hasEventResearch: (eventId: string) => boolean;
}

export function buildDirectory(index: ExplorerIndexDoc, search: SearchEntry[]): Directory {
  const teams = new Map(index.teams.map((t) => [t.participant_id, { name: t.display_name, abbr: t.short_name }]));
  const abbr = new Map(index.teams.map((t) => [t.short_name ?? '', t.participant_id]));
  const players = new Map(search.filter((e) => e.kind === 'PLAYER').map((e) => [e.id, e]));
  const events = new Set(index.events.map((e) => e.event_id));
  return {
    index,
    team: (id) => (id ? teams.get(id) ?? null : null),
    player: (id) => (id ? players.get(id) ?? null : null),
    teamByAbbr: (a) => (a ? abbr.get(a) ?? null : null),
    hasEventResearch: (id) => events.has(id),
  };
}

export function useDirectory(repo: SportRepo) {
  return useAsync(`dir:${repo.sport.code}:${repo.source.root}`, async () => {
    const [index, si] = await Promise.all([repo.index(), repo.searchIndex()]);
    return buildDirectory(index, si.items);
  });
}
