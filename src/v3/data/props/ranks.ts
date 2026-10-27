// The opponent chip's rankings, read for the rows that show it. A ranking document is one league-wide table for one unit ("pass defense"),
// found through any team's profile (which lists the ranking ids), so the first row of a sport costs a team profile plus one ranking and every
// later row of that unit costs nothing. Previously every unit on the slate was read before the first row could be drawn; now a row draws at
// once with a placeholder chip and the chip fills in when its ranking arrives.
import type { RankingDoc } from '../../../contract/types';
import { buildRankingCatalog } from '../research/normalize';
import { LazyBank } from './lazyBank';
import { settle, sportContext } from './load';
import { matchupOf, pickWindow, rankMap } from './rank';
import type { Matchup, Prop, UnitRank } from './types';

export type RankTable = Map<string, UnitRank>;
export const rankKey = (slug: string, metric: string) => `${slug}:${metric}`;
export const rankKeyOf = (p: Pick<Prop, 'slug' | 'oppUnit'>) => (p.oppUnit ? rankKey(p.slug, p.oppUnit.metric) : null);

async function loadCatalog(slug: string) {
  const c = await sportContext(slug);
  const first = c.index?.teams[0]?.participant_id;
  const prof = first && c.repo ? await settle(c.repo.profile(first)) : null;
  if (!prof || !c.index || !c.repo) return null;
  return { catalog: buildRankingCatalog([prof]), codeById: new Map(c.index.teams.map((t) => [t.participant_id, t.short_name ?? ''])), repo: c.repo };
}
const catalogs = new Map<string, ReturnType<typeof loadCatalog>>();
const catalogFor = (slug: string) => {
  let p = catalogs.get(slug);
  if (!p) {
    p = loadCatalog(slug);
    catalogs.set(slug, p);
    p.then((v) => { if (!v) catalogs.delete(slug); }, () => catalogs.delete(slug));
  }
  return p;
};

export const rankBank = new LazyBank<RankTable>(async (key) => {
  const [slug, metric] = key.split(':');
  const c = await catalogFor(slug);
  if (!c) return null;
  const windows = c.catalog.windows.get(`met_${slug}.${metric}`);
  const w = windows ? pickWindow([...windows.keys()]) : null;
  const id = w ? windows!.get(w) : null;
  if (!id) return null;
  const doc: RankingDoc | null = await settle(c.repo.ranking(id));
  return doc ? rankMap(doc, (eid, short) => c.codeById.get(eid) || short) : null;
}, 2);

/** The ranking tables these rows need (distinct, in order). */
export const rankKeysFor = (props: Prop[]): string[] => [...new Set(props.map(rankKeyOf).filter((k): k is string => !!k))];

type Get = (key: string) => ReturnType<typeof rankBank.get>;

/** A table lookup over the bank plus any tables the universe itself carries (sample data). */
export function rankLookup(own: Map<string, RankTable>, get: Get): { get: (key: string) => RankTable | undefined } {
  return { get: (key) => { const o = own.get(key); if (o) return o; const e = get(key); return e?.state === 'ready' ? e.value : undefined; } };
}

/** What a row's opponent chip can say: a matchup, still loading, or nothing published. */
export type ChipState = { state: 'ready'; m: Matchup } | { state: 'loading' } | { state: 'none' };
export function chipStateOf(p: Prop, own: Map<string, RankTable>, get: Get): ChipState {
  const k = rankKeyOf(p);
  if (!k || !p.opp) return { state: 'none' };
  const m = matchupOf(p, rankLookup(own, get));
  if (m) return { state: 'ready', m };
  if (own.has(k)) return { state: 'none' };
  const e = get(k);
  return !e || e.state === 'loading' ? { state: 'loading' } : { state: 'none' };
}
