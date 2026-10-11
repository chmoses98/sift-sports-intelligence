// Game logs and hit rates for a set of props: each prop's CURRENT main line against the player's games played before
// this kickoff (history/hitRate.ts). Same history fetch and name|team matching as the game page's prop cards.
import { useMemo } from 'react';
import { useAsync } from '../../data/hooks';
import { hitRate, type HitRate, type HitWindow } from '../../history/hitRate';
import { historyAvailable, playerHistory, useHistoryIndex } from '../../history/load';
import { pregameRows, statDef } from '../../history/stats';
import type { PlayerHistoryDoc } from '../../history/types';
import { nameKey } from '../../insights/context';
import type { PropRow } from '../../insights/propBoard';

export const histKey = (name: string, team: string) => `${nameKey(name)}|${team}`;

export function hitFor(doc: PlayerHistoryDoc | null | undefined, row: Pick<PropRow, 'def' | 'line'>, kickoff: string, w: HitWindow): HitRate | null {
  const def = statDef(row.def.stat);
  if (!doc || !def || row.line == null) return null;
  return hitRate(pregameRows(doc, kickoff, null), def, row.line, w);
}

/**
 * Game logs for publication players, matched to the history layer by name and team (the same rule as the game
 * page's prop cards), with a loading flag so a screen can say "loading" rather than "no game log" while they arrive.
 */
export function usePlayerHistories(sportCode: string, players: { name: string; team: string }[]) {
  const index = useHistoryIndex(sportCode);
  const ids = useMemo(() => {
    if (!index.data) return [] as (string | null)[];
    const byName = new Map(Object.entries(index.data.players).map(([gsis, p]) => [histKey(p.name, p.team), gsis]));
    return players.map((p) => byName.get(histKey(p.name, p.team)) ?? null);
  }, [index.data, players]);
  const key = ids.filter(Boolean).join(',');
  const docs = useAsync(key && historyAvailable(sportCode) ? `hist:many:${key}` : null, () => Promise.all(ids.map((id) => (id ? playerHistory(id).catch(() => null) : Promise.resolve(null)))));
  const map = useMemo(() => {
    const m = new Map<string, PlayerHistoryDoc | null>();
    players.forEach((p, i) => m.set(histKey(p.name, p.team), docs.data?.[i] ?? null));
    return m;
  }, [docs.data, players]);
  return { docs: map, loading: historyAvailable(sportCode) && (index.loading || docs.loading) };
}

export function usePropHits(sportCode: string, rows: PropRow[], kickoff: string | null, w: HitWindow) {
  const players = useMemo(() => {
    const seen = new Map<string, { name: string; team: string }>();
    for (const r of rows) seen.set(histKey(r.name, r.team.abbr), { name: r.name, team: r.team.abbr });
    return [...seen.values()];
  }, [rows]);
  const { docs, loading } = usePlayerHistories(sportCode, players);
  const hits = useMemo(() => {
    const m = new Map<string, HitRate | null>();
    if (!kickoff) return m;
    for (const r of rows) m.set(r.id, hitFor(docs.get(histKey(r.name, r.team.abbr)), r, kickoff, w));
    return m;
  }, [docs, rows, kickoff, w]);
  return { docs, hits, loading };
}
