// Game logs and hit rates for a set of props: each prop's CURRENT main line against the player's games played before
// this kickoff (history/hitRate.ts). Same history fetch and name|team matching as the game page's prop cards.
import { useMemo } from 'react';
import { hitRate, type HitRate, type HitWindow } from '../../history/hitRate';
import { pregameRows, statDef } from '../../history/stats';
import type { PlayerHistoryDoc } from '../../history/types';
import { nameKey } from '../../insights/context';
import type { PropRow } from '../../insights/propBoard';
import { usePropHistories } from '../game/matters';

export const histKey = (name: string, team: string) => `${nameKey(name)}|${team}`;

export function hitFor(doc: PlayerHistoryDoc | null | undefined, row: Pick<PropRow, 'def' | 'line'>, kickoff: string, w: HitWindow): HitRate | null {
  const def = statDef(row.def.stat);
  if (!doc || !def || row.line == null) return null;
  return hitRate(pregameRows(doc, kickoff, null), def, row.line, w);
}

export function usePropHits(sportCode: string, rows: PropRow[], kickoff: string | null, w: HitWindow) {
  const players = useMemo(() => {
    const seen = new Map<string, { name: string; team: string }>();
    for (const r of rows) seen.set(histKey(r.name, r.team.abbr), { name: r.name, team: r.team.abbr });
    return [...seen.values()];
  }, [rows]);
  const docs = usePropHistories(sportCode, players);
  const hits = useMemo(() => {
    const m = new Map<string, HitRate | null>();
    if (!kickoff) return m;
    for (const r of rows) m.set(r.id, hitFor(docs.get(histKey(r.name, r.team.abbr)), r, kickoff, w));
    return m;
  }, [docs, rows, kickoff, w]);
  return { docs, hits };
}
