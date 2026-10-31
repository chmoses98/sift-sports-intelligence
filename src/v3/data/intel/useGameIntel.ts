// The hook behind Matchup Intelligence: the documents Game Detail already holds, the projection authority only for a sport that has an
// approved team-points family (NFL's is held, so NFL never fetches the projection feed here), and the clock. Everything else is
// `buildGameIntel`, which is pure and tested.
import { useMemo } from 'react';
import { useAuthority, useProjections } from '../../../data/projections';
import { cfbTeam } from '../../../lib/cfbTeams';
import { engineFor } from '../../../lib/projectionApprovals';
import { useNow } from '../../../live/hooks';
import type { GameCtx } from '../../screens/GameShared';
import { buildGameIntel, type GameIntel } from './build';
import type { ApprovedTeams } from './projection';

const PROJECTED = new Set(['NFL', 'CFB', 'NBA', 'MLB', 'NHL']);

/** The approved team-points projection for the game, from the one authority; null when the sport has none approved or it did not resolve. */
function useApprovedTeams(ctx: GameCtx): { approved: ApprovedTeams | null; loading: boolean } {
  const { g, startMs } = ctx;
  const code = g.sport.toUpperCase();
  const wanted = g.provenance === 'publication' && PROJECTED.has(code) && engineFor(code, 'team_points') === 'foundation';
  const { authority, ready } = useAuthority(wanted ? code : null);
  const { doc } = useProjections(wanted ? code : null);
  const approved = useMemo<ApprovedTeams | null>(() => {
    if (!wanted || !authority) return null;
    const ids = code === 'CFB' ? { awayId: cfbTeam(g.away.abbr)?.e ?? null, homeId: cfbTeam(g.home.abbr)?.e ?? null } : {};
    const r = authority.resolveTeams({ home: g.home.abbr, away: g.away.abbr, startUtc: startMs != null ? new Date(startMs).toISOString() : null, family: 'team_points', ...ids });
    if (r.kind !== 'authoritative' || r.teams.length !== 2) return null;
    const [a, h] = r.teams;
    return { away: { mean: a.value.mean, p10: a.value.p10, p90: a.value.p90 }, home: { mean: h.value.mean, p10: h.value.p10, p90: h.value.p90 }, asOf: a.value.updatedAt ?? null, version: doc?.modelVersion || null };
  }, [wanted, authority, code, g.away.abbr, g.home.abbr, startMs, doc]);
  return { approved, loading: wanted && !ready };
}

export function useGameIntel(ctx: GameCtx): { intel: GameIntel; loading: boolean } {
  const { g, research, detail } = ctx;
  const { approved, loading } = useApprovedTeams(ctx);
  const now = useNow(60_000);
  const minute = Math.floor(now / 60_000);
  const intel = useMemo(() => buildGameIntel({ g, research, detail, approved, now: minute * 60_000 }), [g, research, detail, approved, minute]);
  return { intel, loading: loading || (g.provenance === 'publication' && ctx.researchLoading && !research) };
}
