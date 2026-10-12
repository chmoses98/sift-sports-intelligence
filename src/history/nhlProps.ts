// NHL PLAYER CONTRACTS AGAINST HIS GAME LOG (backlog 1.4). Kalshi's NHL player contracts are counts ("1+ goals",
// "2+ points", "25+ saves"); the publication's profile ships the last 82 games in `extensions.game_log`. For each
// contract this reads how many of his recent games reached today's count: last 5, last 10 and this season's games.
// History against today's threshold, not a probability, and nothing is shown for a contract the log cannot measure
// (first goalscorer: the log has no goal order).
import type { ResearchMarket } from '../contract/types';
import { logHit, nameKey, num, type BoxRow, type LogHit } from './boxLog';

/** The game-log column each counted NHL contract settles on. */
export const NHL_PROP_COL: Record<string, string> = { player_goals: 'g', player_assists: 'a', player_points: 'p', goalie_saves: 'sv' };

/** The contract's line as a number: the published threshold, else "N+" read as N − 0.5. */
export function nhlLine(m: Pick<ResearchMarket, 'threshold' | 'line' | 'yes_description'>): number | null {
  if (typeof m.threshold === 'number') return m.threshold;
  if (typeof m.line === 'number') return m.line;
  const n = /:\s*(\d+)\+/.exec(m.yes_description ?? '')?.[1];
  return n != null ? Number(n) - 0.5 : null;
}

/** The player a contract names: the publication's player id when joined, else the name before the colon. */
export function nhlSubject(m: Pick<ResearchMarket, 'yes_description'> & { extensions?: unknown }): string | null {
  const ext = (m.extensions ?? null) as { entity_name?: unknown } | null;
  if (typeof ext?.entity_name === 'string' && ext.entity_name) return ext.entity_name;
  const s = /^(?:Full Game: )?(.+?):\s*\d+\+/.exec(m.yes_description ?? '')?.[1];
  return s ?? null;
}

/**
 * This player's contracts in an event. The live NHL feed leaves `player_id` empty on player contracts, so a contract
 * also belongs to him when its named subject is his name (accent and punctuation blind).
 */
export function nhlPlayerMarkets<M extends ResearchMarket>(markets: M[], playerId: string, name: string): M[] {
  const key = nameKey(name);
  return markets.filter((m) => m.player_id === playerId || (!m.player_id && !!key && /^player_|^goalie_|^first_goal/.test(m.market_family) && nameKey(nhlSubject(m)) === key));
}

/** NHL season of a date: the season that starts in the autumn of its year (2026-10-11 → 2026, 2027-03-01 → 2026). */
export function nhlSeasonOf(iso: string): number {
  const d = new Date(iso);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
/** "2026-27". */
export const nhlSeasonLabel = (season: number) => `${season}-${String((season + 1) % 100).padStart(2, '0')}`;

/** A game-log row's season, from its NHL game id (2026020061 → 2026). */
export function rowSeason(r: BoxRow): number | null {
  const s = Number(String(r.game_id ?? '').slice(0, 4));
  return Number.isFinite(s) && s > 1900 ? s : null;
}

/** The kickoff's calendar date in Eastern time (the log's `date` is the local game date). */
function etDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Games before this kickoff that he actually played (a dressed backup goalie with 0 minutes is not a game). */
export function nhlPregame(rows: BoxRow[], kickoffIso: string | null): BoxRow[] {
  const cut = kickoffIso ? etDate(kickoffIso) : null;
  return rows.filter((r) => (cut == null || (typeof r.date === 'string' && r.date < cut)) && (num(r.toi_s) == null || num(r.toi_s)! > 0));
}

export interface NhlContractHistory {
  line: number;
  col: string;
  last5: LogHit;
  last10: LogHit;
  /** This season's games (null when he has none yet). */
  season: LogHit | null;
}

/** His recent games against one contract's count, or null when the log cannot measure the contract. */
export function nhlContractHistory(m: Pick<ResearchMarket, 'market_family' | 'threshold' | 'line' | 'yes_description'>, pregame: BoxRow[], season: number): NhlContractHistory | null {
  const col = NHL_PROP_COL[m.market_family];
  const line = nhlLine(m);
  if (!col || line == null) return null;
  const rows = pregame.filter((r) => num(r[col]) != null);
  if (!rows.length) return null;
  const vals = rows.map((r) => num(r[col])!);
  const cur = rows.filter((r) => rowSeason(r) === season).map((r) => num(r[col])!);
  return { line, col, last5: logHit(vals, line, 5), last10: logHit(vals, line, 10), season: cur.length ? logHit(cur, line, null) : null };
}
