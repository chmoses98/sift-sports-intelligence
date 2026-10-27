// Availability (OUT, doubtful, suspended, on IR) for the games whose rows are on screen. Football and basketball publish it in the game's
// event research document (0.4 to 1.3 MB of JSON, 6 to 50 KB on the wire); hockey carries it in the contract document itself and never needs
// this. Reading every game's research document up front cost 19 documents (456 KB on the wire) before the first row could be drawn, so it is
// read for the rows on screen instead, and until then a row SAYS it is "Checking availability": a player the publication lists out is never
// shown as available without that being said, and "Hide out" removes him the moment the document arrives.
import { NotFoundError } from '../../../data/fetcher';
import { LazyBank, type BankState } from './lazyBank';
import { sportRepo } from './load';
import { sidelinedByName } from './parse';
import type { Prop, Universe } from './types';

/** Players the game's availability document lists as sidelined: name key to OUT, DOUBTFUL, SUSPENDED or IR. */
export type Sidelined = Map<string, string>;

export const availKey = (p: Pick<Prop, 'slug' | 'eventId'>) => `${p.slug}|${p.eventId}`;

export const availabilityBank = new LazyBank<Sidelined>(async (key) => {
  const [slug, eventId] = key.split('|');
  const repo = await sportRepo(slug);
  if (!repo || !repo.hasExplorer) return null;
  const doc = await repo.eventResearch(eventId).catch((e: unknown) => { if (e instanceof NotFoundError) return null; throw e; });
  const rows = doc?.context?.injuries;
  return Array.isArray(rows) ? sidelinedByName(rows) : null;
}, 3);

/** The distinct availability documents these props are waiting for. */
export const pendingKeys = (props: Prop[]): string[] => [...new Set(props.filter((p) => p.availPending).map(availKey))];

/**
 * The universe with every game's availability applied where it has been read. A pending prop becomes known (out or listed) when its document
 * arrives, or "not published" when there is none. Returns the same universe object when nothing changed.
 */
export function withAvailability(u: Universe, get: (key: string) => BankState<Sidelined> | undefined, nameKeyOf: (name: string) => string): Universe {
  if (!u.props.some((p) => p.availPending)) return u;
  let changed = false;
  const missing = new Set<string>();
  const waiting = new Set<string>();
  const props = u.props.map((p) => {
    if (!p.availPending) return p;
    const e = get(availKey(p));
    if (e?.state === 'ready') { changed = true; return { ...p, out: e.value.get(nameKeyOf(p.name)) ?? null, availKnown: true, availPending: false }; }
    if (e?.state === 'none') { changed = true; missing.add(p.eventId); return { ...p, availKnown: false, availPending: false }; }
    waiting.add(p.eventId);
    return p;
  });
  if (!changed) return u;
  return { ...u, props, byId: new Map(props.map((p) => [p.id, p])), availPendingGames: waiting.size, availabilityGaps: u.availabilityGaps + missing.size };
}
