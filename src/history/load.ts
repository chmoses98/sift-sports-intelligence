// Reading the history layer. Same fetch cache as research documents (memo + background revalidation);
// the files are same-origin static JSON written by scripts/history/build-nfl-history.mjs.
import { getJson, joinUrl, NotFoundError } from '../data/fetcher';
import { useAsync } from '../data/hooks';
import type { HistoryIndexDoc, PlayerHistoryDoc, TeamHistoryDoc } from './types';

const SUPPORTED = new Set(['NFL']);
let base = `${import.meta.env.BASE_URL}data/nfl/history`;

/** Tests point the history layer at a disk reader. */
export function setHistoryBase(b: string): void {
  base = b;
}

export const historyAvailable = (sportCode: string) => SUPPORTED.has(sportCode.toUpperCase());

export function historyIndex(): Promise<HistoryIndexDoc> {
  return getJson<HistoryIndexDoc>(joinUrl(base, 'index.json'));
}

export function teamHistory(): Promise<TeamHistoryDoc> {
  return getJson<TeamHistoryDoc>(joinUrl(base, 'teams.json'));
}

/** A player's game log, or null when the history has no rows for them (rookie, no snaps, other sport). */
export async function playerHistory(gsis: string): Promise<PlayerHistoryDoc | null> {
  try {
    return await getJson<PlayerHistoryDoc>(joinUrl(base, `players/${gsis}.json`));
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export function usePlayerHistory(sportCode: string, gsis: string | null | undefined) {
  return useAsync(gsis && historyAvailable(sportCode) ? `hist:p:${gsis}` : null, () => playerHistory(gsis!));
}

export function useTeamHistory(sportCode: string) {
  return useAsync(historyAvailable(sportCode) ? 'hist:teams' : null, () => teamHistory().catch(() => null));
}

export function useHistoryIndex(sportCode: string) {
  return useAsync(historyAvailable(sportCode) ? 'hist:index' : null, () => historyIndex().catch(() => null));
}
