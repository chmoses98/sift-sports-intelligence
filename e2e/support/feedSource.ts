// Where the real published documents come from for a browser test, and on which clock. One place, used by e2e/support/realFeeds.ts and
// e2e/support/playerFeeds.ts, so the two helpers cannot drift apart.
//
//   default                        the COMMITTED bundle (fixtures/real: index.json + gzip packs, see fixtures/real/README.md): offline, byte-exact, reproducible.
//   V3_REAL_FEEDS=live             refill a scratch cache from the network (curl, so the environment's proxy applies), journaling URL, status, content
//                                  type, sha256 and fetch time; then `node scripts/v3-fixtures/pack.mjs` turns it into the bundle. Cache: V3_FEED_CACHE
//                                  or ./.v3-feed-cache (gitignored).
//   V3_FEED_CACHE=<dir> (no live)  serve only from that scratch cache (debugging; `unpack.mjs` writes a family out in this layout).
// Nothing is invented: a document the source does not have answers 404, exactly like a document the publisher does not have.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchOne, journal } from '../../scripts/v3-fixtures/capture.mjs';
import { cacheKey, isoZ, openBundle } from '../../scripts/v3-fixtures/lib.mjs';

/** The families of captured documents. They describe different instants and are never merged. */
export type FeedFamily = 'stat' | 'team' | 'game' | 'player' | 'props';
export type FeedMode = 'bundle' | 'cache' | 'live';

export interface FeedDoc { status: number; body: Buffer; contentType: string }
export interface FeedSource {
  family: FeedFamily;
  mode: FeedMode;
  /** The stored/fetched document for a URL, or null when the source does not have it (answer 404). */
  get(url: string): Promise<FeedDoc | null>;
  /** The instant the family's documents describe (the browser clock is pinned to it, or to a fixed offset from it). */
  clock(): Date;
}

export const scratchDir = () => process.env.V3_FEED_CACHE ?? join(process.cwd(), '.v3-feed-cache');

export function feedMode(live?: boolean): FeedMode {
  if (live ?? process.env.V3_REAL_FEEDS === 'live') return 'live';
  return process.env.V3_FEED_CACHE ? 'cache' : 'bundle';
}

/** Request log for recovering which documents a run needs (`V3_FEED_RECORD=file`): lines `HIT <url>` / `MISS <url>`. */
export const recordRequest = (url: string, hit: boolean) => {
  if (process.env.V3_FEED_RECORD) appendFileSync(process.env.V3_FEED_RECORD, `${hit ? 'HIT' : 'MISS'} ${url}\n`);
};

function scratchClock(dir: string): string | null {
  const f = join(dir, 'captured_at.txt');
  if (!existsSync(f)) return null;
  const t = Date.parse(readFileSync(f, 'utf8').trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** The clock pin of a family as an ISO instant: V3_FEED_NOW, else the scratch cache's captured_at.txt (cache/live modes), else the bundle's manifest. */
export function feedClock(family: FeedFamily, live?: boolean): string {
  const env = process.env.V3_FEED_NOW;
  if (env && Number.isFinite(Date.parse(env))) return new Date(env).toISOString();
  const mode = feedMode(live);
  if (mode !== 'bundle') {
    const s = scratchClock(scratchDir());
    if (s) return s;
    if (mode === 'live') return new Date().toISOString(); // a live fetch is as current as it is
  }
  return new Date(openBundle().family(family).clock.captured_at).toISOString();
}

export function feedSource(family: FeedFamily, o: { live?: boolean } = {}): FeedSource {
  const mode = feedMode(o.live);
  const clock = () => new Date(feedClock(family, o.live));
  if (mode === 'bundle') {
    const fam = openBundle().family(family);
    return { family, mode, clock, get: async (url) => { const d = fam.get(url); return d && d.status === 200 ? { status: 200, body: Buffer.from(d.body), contentType: d.contentType } : null; } };
  }
  const dir = scratchDir();
  mkdirSync(dir, { recursive: true });
  return {
    family, mode, clock,
    async get(url) {
      const f = join(dir, cacheKey(url));
      if (!existsSync(f) && mode === 'live') {
        if (!existsSync(join(dir, 'captured_at.txt'))) writeFileSync(join(dir, 'captured_at.txt'), isoZ(new Date()) + '\n');
        const rec = await fetchOne(url, f);
        journal(dir, rec);
      }
      return existsSync(f) ? { status: 200, body: readFileSync(f), contentType: 'application/json' } : null;
    },
  };
}
