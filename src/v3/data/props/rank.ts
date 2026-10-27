// The opponent chip: the opposing team's published rank on the statistic's defensive unit ("PHI pass D · 10th of 28"). Ranks come from
// the sport's own ranking documents with the universe size the publication used (28 NFL teams in the current packet, not 32), fetched
// once per (statistic, window) for the whole league, never per player.
import type { RankingDoc } from '../../../contract/types';
import { ordinal as ord } from '../../../lib/format';
import type { Matchup, Prop, UnitRank } from './types';

/** The window a statistic opens in: the sport's adjusted view, else the whole season, else the latest season-shaped window. */
export function pickWindow(available: string[]): string | null {
  for (const p of ['ADJ_RIDGE', 'SEASON']) if (available.includes(p)) return p;
  const seasons = available.filter((w) => /^\d{4}(-\d{2})?$/.test(w)).sort().reverse();
  return seasons[0] ?? available[0] ?? null;
}

/** One ranking document as team code to rank. `codeOf` maps a published entity to the code the screens use. */
export function rankMap(doc: RankingDoc, codeOf: (entityId: string, short: string | null) => string | null): Map<string, UnitRank> {
  const n = doc.universe?.size ?? doc.entries.length;
  const out = new Map<string, UnitRank>();
  for (const e of doc.entries) {
    const code = codeOf(e.entity_id, e.short_name ?? null);
    if (code && e.rank != null) out.set(code, { rank: e.rank, n, value: e.value ?? null, window: doc.window?.label ?? 'SEASON', rankingId: doc.ranking_id });
  }
  return out;
}

/** The opponent chip for a prop, or null when the statistic has no unit or the ranking does not list the opponent. */
export function matchupOf(p: Pick<Prop, 'slug' | 'oppUnit' | 'opp' | 'team'>, ranks: { get: (key: string) => Map<string, UnitRank> | undefined }): Matchup | null {
  if (!p.oppUnit || !p.opp) return null;
  const r = ranks.get(`${p.slug}:${p.oppUnit.metric}`)?.get(p.opp);
  if (!r) return null;
  return { rank: r.rank, n: r.n, value: r.value, text: `${p.opp} ${p.oppUnit.chip} · ${ord(r.rank)} of ${r.n}`, statId: p.oppUnit.metric, window: r.window, oppCode: p.opp, selfCode: p.team };
}

/** Where the opponent sits on the worst-to-best track: 0 at the worst unit, 100 at the best. */
export const trackPct = (rank: number, n: number) => (n <= 1 ? 50 : (100 * (n - rank)) / (n - 1));

/** "Bottom 3": the three worst units of the ranking. */
export const isBottom = (m: Matchup, count: number) => m.rank >= m.n - count + 1;
export const isTop = (m: Matchup, count: number) => m.rank <= count;
