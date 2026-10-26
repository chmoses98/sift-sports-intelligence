// A logged game's Game Detail page. Box-score logs (NBA) carry the published event id; football's history layer does not, so the player's
// team schedule (the explorer team profile, fetched only once a bar is selected) is matched on opponent and date. A game the schedule does
// not list (last season's) has no page: the caller says so rather than linking somewhere else.
import { useCallback, useMemo } from 'react';
import { useTeamIndex, useTeamProfile } from '../../data/research/hooks';
import type { PlayerVM } from '../../data/usePlayer';
import type { Obs } from '../../model/research';
import { eventForObs, type ScheduledGame } from '../../model/playerResearch';

/** `selected`: the one logged game whose page is wanted; `all`: every row is listed (the Log), so the schedule is read as soon as the tab opens. */
export function usePlayerGames(slug: string, vm: PlayerVM | null, selected: Obs | null, all = false): (o: Obs) => string | null {
  const need = (all || (!!selected && !selected.eventId)) && !!vm?.team;
  const { profile } = useTeamProfile(need ? slug : '', need ? vm!.team!.abbr : null);
  const ti = useTeamIndex(need ? slug : '');
  const games = useMemo<ScheduledGame[]>(() => (profile ? profile.games.map((g) => ({ eventId: g.eventId, opponentCode: g.opponentId ? ti.byId.get(g.opponentId)?.short_name ?? null : null, startUtc: g.startUtc, status: g.status })) : []), [profile, ti.byId]);
  return useCallback((o: Obs) => o.eventId ?? eventForObs(games, o), [games]);
}
