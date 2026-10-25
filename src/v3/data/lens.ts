// SIFT Lens: one concise, sourced observation about a game, taken from what the publication itself states. It is context, never a
// bet signal: no probability, no "pick", no invented confidence. An observation names its source rows and its age; the counter-case
// says what the publication does NOT establish.
import type { EventResearchDoc, MatchupRow, Observation } from '../../contract/types';
import type { V3Game } from '../model/types';
import { DEMO_LIVE } from '../demo/fixtures';

export interface Lens {
  tag: string;
  headline: string;
  body: string;
  rows: { k: string; v: string }[];
  counter: string;
  asOf: string | null;
  /** The in-app route of the ranking behind the observation, when the publication has one: opens its Stat Detail. */
  statRoute?: string;
  demo?: boolean;
}

export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };

const rankOf = (o: Observation | null): { rank: number; n: number } | null =>
  o?.context?.rank != null && o.context.universe_size ? { rank: o.context.rank, n: o.context.universe_size } : null;

/** The matchup row where the two sides sit furthest apart in the league table (by rank, as a share of the field). */
export function widestGap(rows: MatchupRow[]): { row: MatchupRow; gap: number } | null {
  let best: { row: MatchupRow; gap: number } | null = null;
  for (const row of rows) {
    const h = rankOf(row.home), a = rankOf(row.away);
    if (!h || !a || h.n < 8 || a.n < 8) continue;
    const gap = Math.abs(h.rank - a.rank) / (Math.max(h.n, a.n) - 1);
    if (!best || gap > best.gap) best = { row, gap };
  }
  return best;
}

export function lensFromResearch(r: EventResearchDoc | null | undefined, g: V3Game): Lens | null {
  if (!r) return null;
  const w = widestGap(r.matchup ?? []);
  if (!w) return null;
  const { row } = w;
  const h = rankOf(row.home)!, a = rankOf(row.away)!;
  const [top, topT, low, lowT] = h.rank <= a.rank ? [h, g.home, a, g.away] : [a, g.away, h, g.home];
  const obs = (row.home ?? row.away)!;
  const unit = obs.unit ? ` (${obs.unit})` : '';
  return {
    tag: 'Matchup observation',
    headline: `${row.name}: ${topT.nick} ${ordinal(top.rank)}, ${lowT.nick} ${ordinal(low.rank)}`,
    body: `On ${row.name.toLowerCase()}${unit}, ${topT.name} ranks ${ordinal(top.rank)} of ${top.n} and ${lowT.name} ranks ${ordinal(low.rank)} of ${low.n}.`,
    rows: [
      { k: g.away.abbr, v: `${row.away?.display_value ?? '—'} · ${rankOf(row.away) ? `${ordinal(rankOf(row.away)!.rank)} of ${rankOf(row.away)!.n}` : 'unranked'}` },
      { k: g.home.abbr, v: `${row.home?.display_value ?? '—'} · ${rankOf(row.home) ? `${ordinal(rankOf(row.home)!.rank)} of ${rankOf(row.home)!.n}` : 'unranked'}` },
      { k: 'Sample', v: `${row.home?.sample_size ?? '—'} / ${row.away?.sample_size ?? '—'} games` },
      { k: 'Price assessment', v: 'None: observation only' },
    ],
    counter: 'The publication states no counter-case for a matchup observation. A rank gap on one statistic does not account for opponent-adjusted form, injuries or game script.',
    asOf: obs.as_of ?? r.generated_at ?? null,
    statRoute: obs.context?.ranking_id ? `/v3/stat/${g.slug}/${encodeURIComponent(obs.context.ranking_id)}` : undefined,
  };
}

export function demoLens(g: V3Game): Lens | null {
  const d = DEMO_LIVE[g.key]?.lens;
  if (!d) return null;
  return { tag: 'Sample observation', headline: `${g.away.nick} run game vs ${g.home.nick} front`, body: d.text, rows: [...d.evidence.map((e) => ({ k: e.label, v: e.value })), { k: 'Price assessment', v: 'None: observation only' }], counter: d.counter, asOf: null, demo: true };
}
