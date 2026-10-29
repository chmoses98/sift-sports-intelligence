// What the v4 NBA surfaces (Game → Players, Props → NBA) show for one game: ONE projection for each player and stat, taken from SIFT's approved
// projection authority (projectionAuthority.ts), never from the raw Projection Foundation rows. Pure: the panels render it, the tests exercise it.
//
// For each player and stat the authority says one of three things, and so does this model:
//   projection   the approved SIFT projection (Projection Foundation model, promoted 2026-10-23): value, 80% range, reliability, availability
//   established  the approved fallback: the feed is unavailable, stale or has not published the game, and the established model's number passed its
//                own freshness, availability and quality checks (projectionFallback.ts). Labelled as such, and shown INSTEAD of a projection, never beside it
//   withheld     no number at all, with the reason: ruled out, blocked by the quality gate, incoherent, not validated, outside the model's population, or
//                stale / unpublished with no usable established number
//
// Reliability describes data quality, never betting value. A projection is not a bet recommendation and a gap to a market price is not an edge.
import { fmtAge, type PlayerProjection, type ProjectionDoc } from './projections';
import type { AuthoritativeValue, ProjectionAuthority, WithheldCode } from './projectionAuthority';
import type { LegacyCandidate } from './projectionFallback';

export const NBA_STATS = ['points', 'rebounds', 'assists', 'threes', 'minutes', 'pra', 'fga'] as const;
export type NbaStatName = (typeof NBA_STATS)[number];
export const NBA_STAT_LABEL: Record<NbaStatName, string> = { points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', minutes: 'MIN', pra: 'PRA', fga: 'FGA' };
const IS_NBA_STAT = new Set<string>(NBA_STATS);

/** The label and wording the owner approved for the established-model fallback. */
export const ESTABLISHED_LABEL = 'Established projection';
export const ESTABLISHED_TEXT = 'The current SIFT forecast is unavailable or not yet published. Showing the established model’s projection instead.';

/**
 * One established-model projection for one player and stat, as the established NBA publication would give it. NO such rows are published today
 * (nba-edge-finder `app/latest` carries `model_prices: 0` on 2026-10-23), so the fallback is approved, implemented and tested but has nothing to show
 * in production until the publication carries them; wiring a loader for them is the only change then needed (see `NBA_ESTABLISHED_ROWS`).
 */
export interface EstablishedNbaRow {
  playerId: string; name: string; team: string; opponent: string;
  family: NbaStatName;
  mean: number | null; p10: number | null; p90: number | null;
  /** when the established publication was generated */
  generatedAt: string | null;
  /** the injury designation the publication lists for the player; null = none listed */
  designation: string | null;
}
/** Today's established NBA per-player projections: none. */
export const NBA_ESTABLISHED_ROWS: readonly EstablishedNbaRow[] = [];

export type NbaStat =
  | { kind: 'projection'; family: NbaStatName; value: AuthoritativeValue }
  | { kind: 'established'; family: NbaStatName; mean: number; p10: number | null; p90: number | null; updatedAt: string | null; trigger: string; reason: string }
  | { kind: 'withheld'; family: NbaStatName; code: WithheldCode; reason: string };

export interface NbaPlayer {
  playerId: string; name: string; team: string;
  /** every stat in NBA_STATS order, shown or withheld */
  stats: NbaStat[];
  /** the stats with a number (projection or established) */
  shown: NbaStat[];
}
export interface NbaGameProjections {
  players: NbaPlayer[];
  /** players with at least one number, best-known minutes first */
  listed: NbaPlayer[];
  /** how many stat forecasts were withheld, by the reason code */
  withheld: Partial<Record<WithheldCode, number>>;
  withheldTotal: number;
}

const candidateOf = (e: EstablishedNbaRow): LegacyCandidate => ({
  mean: e.mean,
  interval: e.p10 != null && e.p90 != null ? { lo: e.p10, hi: e.p90 } : null,
  generatedAt: e.generatedAt,
  designation: e.designation,
});

/** Plain words for why stat forecasts were withheld. */
export const WITHHELD_WORDS: Record<WithheldCode, string> = {
  OUT: 'player ruled out', GATE_BLOCK: 'blocked by the quality gate', INCOHERENT: 'range failed a coherence check', STALE: 'inputs too old',
  FEED_UNAVAILABLE: 'forecast feed unavailable', NOT_PUBLISHED: 'not yet published for this game', NOT_PROJECTED: 'outside the model’s population',
  FAMILY_NOT_READY: 'stat not currently validated', FAMILY_NOT_PUBLISHED: 'stat not published',
};

/**
 * Resolve one game. `rows` are the Projection Foundation rows of the game (from the feed `doc`, matched to the game by the caller); `established` are the
 * established model's rows for the same game (none today). The union of players and stats is resolved through the authority, so a stat that is withheld
 * for a ruled-out, blocked or incoherent row can never be replaced by an established number, whatever `established` holds.
 */
export function nbaGameProjections(authority: ProjectionAuthority | null, doc: ProjectionDoc | null, gameId: string, established: readonly EstablishedNbaRow[] = NBA_ESTABLISHED_ROWS): NbaGameProjections {
  const rows = new Map<string, PlayerProjection>();
  for (const p of doc?.players ?? []) {
    if (!gameId || p.gameId !== gameId || !IS_NBA_STAT.has(p.family)) continue;
    const k = `${p.playerId}|${p.family}`;
    if (!rows.has(k)) rows.set(k, p);                                            // one row per player and stat, whatever the feed holds
  }
  const est = new Map<string, EstablishedNbaRow>();
  for (const e of established) if (!est.has(`${e.playerId}|${e.family}`)) est.set(`${e.playerId}|${e.family}`, e);
  const who = new Map<string, { playerId: string; name: string; team: string; opponent: string }>();
  for (const p of rows.values()) who.set(p.playerId, { playerId: p.playerId, name: p.name, team: p.team, opponent: p.opponent });
  for (const e of est.values()) if (!who.has(e.playerId)) who.set(e.playerId, { playerId: e.playerId, name: e.name, team: e.team, opponent: e.opponent });

  const withheld: Partial<Record<WithheldCode, number>> = {};
  let withheldTotal = 0;
  const players: NbaPlayer[] = [...who.values()].map((w) => {
    const stats: NbaStat[] = [];
    for (const family of NBA_STATS) {
      const k = `${w.playerId}|${family}`;
      const row = rows.get(k);
      const e = est.get(k);
      if (!row && !e) continue;
      const q = { stat: family, playerId: w.playerId, name: w.name, team: w.team, opponent: w.opponent, gameId: gameId || null };
      const res = authority ? authority.resolve(q, e ? candidateOf(e) : null) : null;
      let s: NbaStat;
      if (res?.kind === 'authoritative') s = { kind: 'projection', family, value: res.value };
      else if (res?.kind === 'fallback' && e && e.mean != null) s = { kind: 'established', family, mean: e.mean, p10: e.p10, p90: e.p90, updatedAt: e.generatedAt, trigger: res.trigger, reason: res.reason };
      else if (res?.kind === 'withheld') s = { kind: 'withheld', family, code: res.code, reason: res.reason };
      else s = { kind: 'withheld', family, code: 'FEED_UNAVAILABLE', reason: res?.kind === 'legacy' ? 'this stat is switched to the established projection, which is not published for NBA players' : 'SIFT’s projection authority is not available' };
      if (s.kind === 'withheld') { withheld[s.code] = (withheld[s.code] ?? 0) + 1; withheldTotal += 1; }
      stats.push(s);
    }
    return { playerId: w.playerId, name: w.name, team: w.team, stats, shown: stats.filter((x) => x.kind !== 'withheld') };
  }).filter((p) => p.stats.length > 0);
  const minutes = (p: NbaPlayer) => { const m = p.stats.find((x) => x.family === 'minutes'); return m?.kind === 'projection' ? m.value.mean : m?.kind === 'established' ? m.mean : 0; };
  const listed = players.filter((p) => p.shown.length > 0).sort((a, b) => minutes(b) - minutes(a) || a.name.localeCompare(b.name));
  return { players, listed, withheld, withheldTotal };
}

/** "6 stat forecasts withheld: 4 player ruled out, 2 blocked by the quality gate" */
export function withheldSentence(r: Pick<NbaGameProjections, 'withheld' | 'withheldTotal'>): string | null {
  if (r.withheldTotal === 0) return null;
  const parts = (Object.entries(r.withheld) as [WithheldCode, number][]).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${WITHHELD_WORDS[c]}`);
  return `${r.withheldTotal} stat forecast${r.withheldTotal === 1 ? '' : 's'} withheld: ${parts.join(', ')}.`;
}

/** Age words for a projection or established row ("3h 10m old"), or null when undated. */
export const ageWords = (iso: string | null, nowMs: number): string | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? fmtAge((nowMs - t) / 3.6e6) : null;
};
