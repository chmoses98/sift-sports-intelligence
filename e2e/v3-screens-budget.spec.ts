// Documents and bytes each SIFT 3.0 screen reads for its first screen, on the committed fixture families (fixtures/real) under their fixed clocks.
// Before the mobile-performance hardening every screen, whatever it was, read the explorer index of every sport (8 documents, 830 KB on the wire:
// one league's alone is 450 KB), polled one live-quote file per candidate game of every sport (33 to 51 files), and the Home read injury documents
// below the fold. The budgets below are what a first screen may read now; a change that reads more fails here. "Wire bytes" are the gzip size of each
// served document (what GitHub sends; scripts/v3-qa/screens-perf.mjs measures the browser's own bytes under the phone throttle, and its numbers are in
// docs/sift3/IMPLEMENTATION_STATUS.md). HEAD requests (the existence probe of a sport's explorer) carry no body and are counted apart.
import { test, expect, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds, type FeedFamily } from './support/realFeeds';
import { usePlayerFeeds } from './support/playerFeeds';

test.setTimeout(180_000);

const kindOf = (u: string): string => {
  if (/\/event_detail\//.test(u)) return 'contracts';
  if (/\/explorer\/events\//.test(u)) return 'availability';
  if (/\/explorer\/rankings\//.test(u)) return 'ranking';
  if (/\/explorer\/teams\//.test(u)) return 'team-profile';
  if (/\/explorer\/players\/|\/history\/players\//.test(u)) return 'game-log';
  if (/\/explorer\/index\.json/.test(u)) return 'index';
  if (/\/explorer\/search_index\.json/.test(u)) return 'search-index';
  if (/\/explorer\/metrics\.json/.test(u)) return 'metrics';
  if (/projections\//.test(u)) return 'projection';
  if (/live-quotes\//.test(u)) return 'quotes';
  return 'slate';
};

interface Seen { get: string[]; head: string[] }

async function setup(page: Page, family: FeedFamily, o: { player?: boolean; follows?: unknown } = {}): Promise<Seen> {
  const seen: Seen = { get: [], head: [] };
  page.on('request', (r) => {
    if (!/^https:\/\/raw\.githubusercontent\.com\//.test(r.url())) return;
    (r.method() === 'HEAD' ? seen.head : seen.get).push(r.url());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript((follows) => {
    try {
      localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true }));
      if (follows) localStorage.setItem('sift3.follows', JSON.stringify(follows));
    } catch { /* storage may be blocked */ }
  }, o.follows ?? null);
  if (o.player) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a Playwright helper, not a React hook
    await usePlayerFeeds(page);
  } else {
    await page.clock.setFixedTime(feedNow(family));
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a Playwright helper, not a React hook
    await useRealFeeds(page, { family });
    await freshQuotes(page, { family });
  }
  return seen;
}

const wire = async (family: FeedFamily, urls: string[]) => { let n = 0; for (const u of urls) { const b = await readFeedCache(family, u); n += b ? gzipSync(b, { level: 6 }).length : 0; } return n; };
const tally = (urls: string[]) => { const o: Record<string, number> = {}; for (const u of urls) { const k = kindOf(u); o[k] = (o[k] ?? 0) + 1; } return o; };

/** What the screen read once it had settled: unique GET documents (a repeat is counted: no document is read twice), by kind, and their wire size. */
async function report(family: FeedFamily, seen: Seen, label: string) {
  const docs = [...new Set(seen.get)];
  const by = tally(docs);
  const bytes = await wire(family, docs);
  // Live-quote files are revalidated by design (the store asks again whenever a new contract of the game is shown), so they are not repeats.
  const reads = seen.get.filter((u) => kindOf(u) !== 'quotes');
  const out = { documents: docs.length, repeats: reads.length - new Set(reads).size, probes: seen.head.length, wireKB: Math.round(bytes / 1024), by };
  const dup = reads.filter((u, i) => reads.indexOf(u) !== i).map((u) => u.replace(/^https:\/\/raw\.githubusercontent\.com\/chmoses98\//, ''));
  console.log(`${label} ${JSON.stringify(out)}${dup.length ? ` repeated: ${dup.join(' ')}` : ''}`);
  return { docs, bytes, ...out };
}

async function settle(page: Page, ready: string) {
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  await page.waitForSelector(ready, { timeout: 60_000 });
  await page.waitForTimeout(5000); // lazy reads that follow the first paint belong to the screen
}

// ---- budgets (documents are unique GETs; each is the measured count plus a little room)
test('Home (default sport): the slate plus the cards in view', async ({ page }) => {
  const seen = await setup(page, 'game');
  await page.goto('./#/v3');
  await settle(page, '.v3-gc__h');
  const r = await report('game', seen, 'home');
  const cards = await page.locator('.v3-gc').count();
  expect(r.by.quotes ?? 0, 'at most one live-quote file per game card shown (not one per candidate game of every sport)').toBeLessThanOrEqual(cards);
  expect(r.by.contracts ?? 0).toBeLessThanOrEqual(cards);
  expect(r.by['game-log'] ?? 0).toBe(0);
  expect(r.by.index ?? 0, 'one league schedule per league shown').toBeLessThanOrEqual(1);
  expect(r.by['search-index'] ?? 0).toBe(0);
  expect(r.by.metrics ?? 0, 'no settled-record documents: the slate prints no opportunity').toBe(0);
  expect(r.probes, 'one existence probe per sport, no more').toBeLessThanOrEqual(8);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(40);
  expect(r.bytes).toBeLessThanOrEqual(700_000); // measured 609 KB: the default sport that day is a college sport, whose schedule document dates its games
});

test('Home (NFL day): the slate plus the cards in view', async ({ page }) => {
  const seen = await setup(page, 'game');
  await page.goto('./#/v3?sport=nfl&date=2026-10-27');
  await settle(page, '.v3-gc__h');
  const r = await report('game', seen, 'games');
  const cards = await page.locator('.v3-gc').count();
  expect(r.by.quotes ?? 0, 'one live-quote file per game card shown (not one per candidate game of every sport)').toBeLessThanOrEqual(cards);
  expect(r.by.contracts ?? 0).toBeLessThanOrEqual(cards);
  expect(r.by.index ?? 0, 'one schedule per league shown').toBeLessThanOrEqual(1);
  expect(r.by['game-log'] ?? 0).toBe(0);
  expect(r.by.availability ?? 0).toBe(0);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(32); // measured 29; before: 75
  expect(r.bytes).toBeLessThanOrEqual(320_000); // measured 287 KB; before: 1,047 KB
});

test('Game Detail (overview): this game only', async ({ page }) => {
  const seen = await setup(page, 'game');
  await page.goto('./#/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3');
  await settle(page, '.mx-win .num');
  const r = await report('game', seen, 'game');
  expect(r.by.quotes ?? 0, 'this game\'s own quote file (plus the player-prop contracts it lists)').toBeLessThanOrEqual(3);
  expect(r.by.contracts ?? 0).toBe(1);
  expect(r.by['game-log'] ?? 0, 'no player game log until a row needs one').toBe(0);
  expect(r.by.availability ?? 0).toBeLessThanOrEqual(1);
  expect(r.by.index ?? 0).toBeLessThanOrEqual(1);
  expect(r.by['team-profile'] ?? 0, 'team profiles belong to the Matchup tab').toBe(0);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(33); // measured 30; before: 72
  expect(r.bytes).toBeLessThanOrEqual(340_000); // measured 304 KB; before: 1,166 KB
});

test('Player (Lamb): the player, their game, their prices', async ({ page }) => {
  const seen = await setup(page, 'player', { player: true });
  await page.goto('./#/v3/player/nfl/prt_4c661ae8b854ff5f66dd');
  await settle(page, '.v3p-lane');
  const r = await report('player', seen, 'player');
  expect(r.by.quotes ?? 0).toBeLessThanOrEqual(2);
  expect(r.by['game-log'] ?? 0, 'the Overview reads no game log of another player').toBeLessThanOrEqual(1);
  expect(r.by.availability ?? 0).toBe(0);
  expect(r.by.index ?? 0).toBeLessThanOrEqual(1);
  expect(r.by['search-index'] ?? 0).toBeLessThanOrEqual(1);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(36); // measured 33; before: 83
  expect(r.bytes).toBeLessThanOrEqual(355_000); // measured 317 KB; before: 1,188 KB
});

test('Team (DAL): the profile and nothing of the other sports', async ({ page }) => {
  const seen = await setup(page, 'team');
  await page.goto('./#/v3/team/nfl/DAL');
  await settle(page, '.tm-card');
  const r = await report('team', seen, 'team');
  expect(r.by.index ?? 0).toBeLessThanOrEqual(1);
  expect(r.by['team-profile'] ?? 0).toBeLessThanOrEqual(2);
  expect(r.by['game-log'] ?? 0).toBe(0);
  expect(r.by['search-index'] ?? 0).toBe(0);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(33); // measured 30; before: 82
  expect(r.bytes).toBeLessThanOrEqual(315_000); // measured 280 KB; before: 1,142 KB
});

test('Statistic (adj_off_epa): the ranking and nothing else', async ({ page }) => {
  const seen = await setup(page, 'stat');
  await page.goto('./#/v3/stat/nfl/adj_off_epa');
  await settle(page, '.st-rkr');
  const r = await report('stat', seen, 'stat');
  expect(r.by.quotes ?? 0).toBe(0);
  expect(r.by.index ?? 0).toBeLessThanOrEqual(1);
  expect(r.by.ranking ?? 0).toBeLessThanOrEqual(2);
  expect(r.by['game-log'] ?? 0).toBe(0);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(33); // measured 30; before: 72
  expect(r.bytes).toBeLessThanOrEqual(230_000); // measured 205 KB; before: 1,064 KB
});

test('Following (a team and a player followed): the slate and the one league the player is in', async ({ page }) => {
  const seen = await setup(page, 'game', { follows: { teams: ['nfl:DAL'], players: ['nfl:prt_4c661ae8b854ff5f66dd'], games: [] } });
  await page.goto('./#/v3/following');
  await settle(page, '.v3-fgs li');
  const r = await report('game', seen, 'following');
  expect(r.by.quotes ?? 0).toBe(0);
  expect(r.by.index ?? 0, 'only the league of a followed player').toBeLessThanOrEqual(1);
  expect(r.by['search-index'] ?? 0).toBeLessThanOrEqual(1);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(31); // measured 28; before: 73 (nobody followed)
  expect(r.bytes).toBeLessThanOrEqual(300_000); // measured 280 KB (192 KB + the followed player's profile, game log and coming-game document, read for his card; no quote); before: 1,051 KB
});

test('Search: the slate plus the four search indexes the search needs (and no quote)', async ({ page }) => {
  const seen = await setup(page, 'game');
  await page.goto('./#/v3/search');
  await settle(page, '.v3-explore .v3-hit');
  const r = await report('game', seen, 'explore');
  expect(r.by.quotes ?? 0).toBe(0);
  expect(r.by.contracts ?? 0).toBe(0);
  // The search covers NFL, NBA, NHL and MLB: each needs its explorer index (the file table) to find its search index. Nothing else is read.
  expect(r.by.index ?? 0).toBeLessThanOrEqual(4);
  expect(r.by['search-index'] ?? 0).toBeLessThanOrEqual(4);
  expect(r.by.metrics ?? 0, 'no settled-record documents').toBe(0);
  expect(r.repeats).toBe(0);
  expect(r.documents).toBeLessThanOrEqual(37); // measured 34; before: 73
  expect(r.bytes).toBeLessThanOrEqual(740_000); // measured 677 KB (the four indexes are 600 KB of it); before: 1,051 KB
});

test('a sport\'s explorer is asked about with HEAD, never read for the source decision', async ({ page }) => {
  const seen = await setup(page, 'game');
  await page.goto('./#/v3');
  await settle(page, '.v3-gc__h');
  const r = await report('game', seen, 'probe');
  expect(r.probes, 'every sport is probed').toBeGreaterThanOrEqual(7);
  expect(seen.head.every((u) => /\/explorer\/index\.json$/.test(u))).toBe(true);
  // The leagues no card is showing have no explorer index read at all.
  const read = seen.get.filter((u) => kindOf(u) === 'index');
  expect(read.length, 'at most the leagues of the cards shown').toBeLessThanOrEqual(1);
});
