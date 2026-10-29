// Matchup / stat rows for the Matchup and Stats tabs: the publication's own paired observations (real), or a deterministic sample set (demo).
import type { EventResearchDoc, Observation } from '../../contract/types';
import type { V3Game } from '../model/types';

export interface SideStat { value: string; rank: number | null; n: number | null }
export interface StatPair { id: string; name: string; away: SideStat; home: SideStat; gap: number; route?: string }

const side = (o: Observation | null): SideStat => ({
  value: o?.display_value ?? (o?.value != null ? String(Math.round(o.value * 100) / 100) : '—'),
  rank: o?.context?.rank ?? null, n: o?.context?.universe_size ?? null,
});

export function pairsFromResearch(r: EventResearchDoc | null | undefined, g: V3Game): StatPair[] {
  if (!r) return [];
  return (r.matchup ?? []).filter((m) => m.home || m.away).map((m) => {
    const a = side(m.away), h = side(m.home);
    const gap = a.rank != null && h.rank != null && a.n && h.n ? Math.abs(a.rank - h.rank) / (Math.max(a.n, h.n) - 1) : 0;
    const rid = (m.home ?? m.away)?.context?.ranking_id;
    return { id: m.metric_id, name: m.name, away: a, home: h, gap, route: rid ? `/v3/stat/${g.slug}/${encodeURIComponent(rid)}` : undefined };
  }).sort((x, y) => y.gap - x.gap);
}

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const SAMPLE_METRICS = ['Passing efficiency', 'Rushing efficiency', 'Explosive plays', 'Success rate', 'Points per game', 'Yards per play'];

/** Sample rows: ranks derived deterministically from the team codes. Fictional; only ever produced for demo games. */
export function demoPairs(g: V3Game): StatPair[] {
  const n = g.sport === 'NBA' ? 30 : g.sport === 'NFL' ? 32 : 134;
  return SAMPLE_METRICS.map((name, i) => {
    const ar = (hash(`${g.away.id}${i}`) % n) + 1, hr = (hash(`${g.home.id}${i}`) % n) + 1;
    return { id: `sample-${i}`, name, away: { value: `Sample ${(ar / 10).toFixed(1)}`, rank: ar, n }, home: { value: `Sample ${(hr / 10).toFixed(1)}`, rank: hr, n }, gap: Math.abs(ar - hr) / (n - 1), route: `/v3/stat/${g.slug}/sample-${i}` };
  }).sort((x, y) => y.gap - x.gap);
}
