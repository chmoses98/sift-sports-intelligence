// Prop Discovery's own early start (called from `v3/data/early.ts` for a `#/v3/props...` address, after the slate's documents have been asked for).
//
// What the first rows wait for, in order: the slate (every sport's health, board and recommendations), then the soonest games' contract documents, their
// sports' explorer indexes (NBA's is 450 KB) and, for a sport with an approved model, its projection feed (CFB's is 180 KB), then those games' parse.
// Without this the chain runs one step after the other: the soonest games' documents are only asked for after the whole slate has settled and React has
// rendered, and the projection feed only once the game that needs it has started, so the first rows paint a whole round trip and a 700 KB transfer later
// than they need to. Everything here is a READ the screen makes anyway, started sooner and through the same memoised readers (`getJson` by URL,
// `SportRepo`), so nothing is read twice and nothing is rendered or stored; a failed early read is not remembered and the screen simply asks again.
//
// Bounded on purpose: for the few soonest games inside the default 48-hour horizon, their contract documents, their sport's explorer index and projection
// feed. It never reads a game the list would not read for the default horizon, so a slate with no games in 48 hours costs nothing.
import type { BoardItem } from '../../../contract/types';
import { getJson } from '../../../data/fetcher';
import { distributionsUrl, projectionsUrl } from '../../../lib/projections';
import { SportRepo } from '../../../data/repo';
import { resolveSource } from '../../../data/source';
import { explorable, SPORTS, type SportConfig } from '../../../data/sports';
import { isReady } from '../../model/capabilities';
import { HORIZON_MS } from './horizon';
import { projSportOf, sportHasApprovedModel } from './model';

const none = () => undefined;
/** How many of the soonest games' contract documents are asked for early (the list reads the first few at once, then the rest). */
export const EARLY_GAMES = 6;

export interface EarlyCandidate { sport: SportConfig; repo: SportRepo; row: BoardItem; startMs: number }

/** The soonest games a default (48-hour) list would read first, from the boards alone: not started, a market listed, inside the horizon. Pure; exported for tests. */
export function soonestWithin(boards: { sport: SportConfig; repo: SportRepo; items: BoardItem[] }[], now: number, max = EARLY_GAMES): EarlyCandidate[] {
  const out: EarlyCandidate[] = [];
  for (const b of boards) {
    for (const row of b.items) {
      const startMs = Date.parse(row.start_time_utc);
      if (!Number.isFinite(startMs) || startMs <= now || startMs - now > HORIZON_MS['48h'] || !((row.markets_available ?? 1) > 0)) continue;
      out.push({ sport: b.sport, repo: b.repo, row, startMs });
    }
  }
  return out.sort((a, c) => a.startMs - c.startMs).slice(0, max);
}

export async function warmProps(now = Date.now()): Promise<void> {
  // Each prop sport's board (already in flight from the slate's early start), then the soonest games' documents and those sports' explorer indexes.
  const boards = (await Promise.all(SPORTS.filter((s) => explorable(s) && isReady(s.slug, 'propPrices')).map(async (sport) => {
    try {
      const repo = new SportRepo(await resolveSource(sport));
      if (!repo.source.root) return null;
      return { sport, repo, items: (await repo.board()).items };
    } catch { return null; }
  }))).filter((b): b is { sport: SportConfig; repo: SportRepo; items: BoardItem[] } => !!b);
  const first = soonestWithin(boards, now);
  const indexed = new Set<string>();
  for (const c of first) {
    void c.repo.doc(c.row.detail_path).catch(none);
    if (indexed.has(c.sport.slug)) continue;
    indexed.add(c.sport.slug);
    if (c.repo.hasExplorer) void c.repo.index().catch(none);
    // the projection feed (and its distribution artifact) `loadProjectionDoc` reads for a sport with an approved model
    const code = sportHasApprovedModel(c.sport.slug) ? projSportOf(c.sport.slug) : null;
    if (code) { void getJson(projectionsUrl(code)).catch(none); const du = distributionsUrl(code); if (du) void getJson(du).catch(none); }
  }
}
