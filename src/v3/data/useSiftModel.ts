// The SIFT model lane's source: the approved model publication, read through the app's one projection authority
// (lib/projectionAuthority.ts, which applies the approval ledger lib/projectionApprovals.ts and the publication's own quality gate).
// A value is returned only when the authority resolves "authoritative" for this player, stat and game; every other state (not approved,
// withheld by a check, not yet published, no feed for the sport) comes back as a Resolution the lane turns into "—" with its reason.
// Nothing here estimates, rounds up from History or back-fills from Market, and the established simulation is never the SIFT lane.
import { useCallback, useMemo } from 'react';
import { useAuthority, useProjections } from '../../data/projections';
import { teamKey, type Participation, type ProjSport } from '../../lib/projections';
import type { Resolution, ProjectionAuthority } from '../../lib/projectionAuthority';
import { projectionStat } from '../model/playerResearch';
import type { PlayerVM } from './usePlayer';

const PROJECTED = new Set(['NFL', 'CFB', 'NBA', 'MLB', 'NHL']);

/** What the SIFT model lane needs from the approval ledger and the model publication. */
export interface SiftModel {
  /** The feed has been read (or the sport has none): lanes may render their final text. */
  ready: boolean;
  /** The resolution for one of this player's statistics in the coming game; null when the sport has no projection feed or sample data is shown. */
  resolve: (stat: string) => Resolution | null;
  authority: ProjectionAuthority | null;
  /** The availability call published beside his projection (the "Likely active" chip), when the feed has one. */
  availability: { status: Participation; words: string } | null;
}

const CHIP: Record<Participation, string | null> = {
  CONFIRMED_ACTIVE: 'Confirmed active', LIKELY_ACTIVE: 'Likely active', UNCERTAIN: 'Uncertain', LIKELY_OUT: 'Likely out', CONFIRMED_OUT: 'Out', UNVERIFIED: null,
};

export function useSiftModel(vm: PlayerVM | null): SiftModel {
  const sport = vm && vm.provenance === 'publication' && PROJECTED.has(vm.sport) ? (vm.sport as ProjSport) : null;
  const { authority, ready } = useAuthority(sport);
  const { doc } = useProjections(sport);
  const resolve = useCallback((stat: string): Resolution | null => {
    if (!vm || !sport || !authority) return null;
    return authority.resolve({ stat: projectionStat(sport, stat), playerId: vm.extId, name: vm.name, team: vm.team?.abbr ?? null, opponent: vm.opp?.abbr ?? null });
  }, [vm, sport, authority]);
  const availability = useMemo(() => {
    if (!vm || !doc) return null;
    // Any of his rows carries the same availability call; take the one for the coming opponent.
    const row = doc.players.find((p) => (vm.extId ? p.playerId === vm.extId : false) && (!vm.opp || !p.opponent || teamKey(p.opponent) === teamKey(vm.opp.abbr)));
    const st = row?.participation?.status;
    return st && CHIP[st] ? { status: st, words: CHIP[st]! } : null;
  }, [vm, doc]);
  return { ready: !sport || ready, resolve, authority, availability };
}

