// Prop Discovery's first-screen load budget, on the REAL cached documents under the fixed browser clock (e2e/support/realFeeds.ts).
// Before the hardening the list read 22 contract documents, 19 injury documents, 8 identity/ranking tables and the model feeds before
// the first row was drawn (89 documents, 2.1 MB on the wire in all, 1.07 MB of it Prop Discovery's own). The budget below is what the first
// screen may read now; a change that reads more fails here. "Wire bytes" are the gzip size of each served document (what GitHub sends;
// scripts/v3-qa/props-perf.mjs measures the browser's own bytes under the phone throttle and its numbers are in IMPLEMENTATION_STATUS.md).
// The limits are stated relative to what the capture holds (the games inside 48 hours of the family's clock and the wire size of their contract documents,
// read from the family's own boards: e2e/support/propsFixture.ts), so they follow a refreshed capture instead of being numbers of one slate. What is added
// to that base is the fixed overhead measured on the 2026-10-28 capture (26 games, 677 KB of contract documents): list 8 other own documents and 365 KB,
// home 13 and 266 KB, shell 31 documents (1,182 KB beyond the contracts in all); the limits keep the margins the previous capture's limits had over its measurement.
import { test, expect, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds } from './support/realFeeds';
import { fixtureGames, within } from './support/propsFixture';

const FAMILY = 'props' as const; // the committed `props` fixture family (fixtures/real)

test.setTimeout(180_000);

const kindOf = (u: string): string => {
  if (/\/event_detail\//.test(u)) return 'contracts';
  if (/\/explorer\/events\//.test(u)) return 'availability';
  if (/\/explorer\/rankings\//.test(u)) return 'ranking';
  if (/\/explorer\/teams\//.test(u)) return 'team-profile';
  if (/\/explorer\/players\/|\/history\/players\//.test(u)) return 'game-log';
  if (/projections\//.test(u)) return 'projection';
  if (/live-quotes\//.test(u)) return 'quotes';
  return 'shell';
};

async function useSetup(page: Page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  await page.clock.setFixedTime(feedNow(FAMILY));
  // eslint-disable-next-line react-hooks/rules-of-hooks -- a Playwright helper, not a React hook
  const log = await useRealFeeds(page, { family: FAMILY });
  await freshQuotes(page, { family: FAMILY });
  return log;
}

const wire = async (urls: string[]) => { let n = 0; for (const u of urls) { const b = await readFeedCache(FAMILY, u); n += b ? gzipSync(b, { level: 6 }).length : 0; } return n; };
const tally = (urls: string[]) => {
  const o: Record<string, number> = {};
  for (const u of urls) { const k = kindOf(u); o[k] = (o[k] ?? 0) + 1; }
  return o;
};
const documents = (served: string[]) => [...new Set(served)];
/** The games the 48-hour list reads, and what their contract documents weigh on the wire (gzip), from the family's own documents. */
async function horizon48() {
  const games = within(await fixtureGames(FAMILY), FAMILY, '48h');
  return { n: games.length, wire: await wire(games.map((g) => `${g.base}event_detail/${g.eventId}.json`)) };
}

test('the first screen of the list stays inside its document and byte budget', async ({ page }) => {
  const log = await useSetup(page);
  const h = await horizon48();
  await page.goto('./#/v3/props?view=list');
  await page.waitForSelector('.pd-row', { timeout: 90_000 });
  await page.waitForTimeout(5000); // lazy reads that follow the first paint (availability for rows near the top, rankings) are part of the screen
  const docs = documents(log.served);
  const by = tally(docs);
  const bytes = await wire(docs);
  const own = docs.filter((u) => kindOf(u) !== 'shell');
  console.log(JSON.stringify({ documents: docs.length, wireKB: Math.round(bytes / 1024), propsOwn: own.length, propsOwnKB: Math.round((await wire(own)) / 1024), by }));
  // What was read before: 19 availability documents. Now only the games of the rows near the top (and the few ahead of them).
  expect(by.availability ?? 0, 'availability documents are read for the games near the top only').toBeLessThanOrEqual(8);
  expect(by.ranking ?? 0, 'ranking tables are read for the rows that show them').toBeLessThanOrEqual(3);
  expect(by['team-profile'] ?? 0).toBeLessThanOrEqual(2);
  expect(by['game-log'] ?? 0, 'no player game log is read for the first screen').toBe(0);
  // One contract document per game that starts inside 48 hours, never more.
  expect(by.contracts ?? 0).toBeLessThanOrEqual(h.n);
  expect(own.length, 'documents Prop Discovery reads itself').toBeLessThanOrEqual(h.n + 12);
  expect(await wire(own), 'wire bytes of those documents').toBeLessThanOrEqual(h.wire + 450_000);
  expect(docs.length, 'every document, shell included').toBeLessThanOrEqual(h.n + 48);
  expect(bytes, 'every document, shell included').toBeLessThanOrEqual(h.wire + 1_450_000);
  // No document is read twice.
  expect(log.served.length - docs.length).toBeLessThanOrEqual(2);
});

test('the first screen of the home stays inside the same budget', async ({ page }) => {
  const log = await useSetup(page);
  const h = await horizon48();
  await page.goto('./#/v3/props');
  await page.waitForSelector('.pd-card', { timeout: 90_000 });
  await page.waitForTimeout(5000);
  const docs = documents(log.served);
  const by = tally(docs);
  const own = docs.filter((u) => kindOf(u) !== 'shell');
  console.log(JSON.stringify({ documents: docs.length, propsOwn: own.length, propsOwnKB: Math.round((await wire(own)) / 1024), by }));
  expect(by.availability ?? 0, 'availability for the shelf candidates only').toBeLessThanOrEqual(10);
  expect(by['game-log'] ?? 0).toBeLessThanOrEqual(8);
  expect(own.length).toBeLessThanOrEqual(h.n + 18);
  expect(await wire(own)).toBeLessThanOrEqual(h.wire + 450_000);
});

test('a longer horizon reads only the extra games, once each, and says what it costs', async ({ page }) => {
  const log = await useSetup(page);
  await page.goto('./#/v3/props?view=list');
  await page.waitForSelector('.pd-row', { timeout: 90_000 });
  await page.waitForTimeout(4000);
  const before = documents(log.served).filter((u) => kindOf(u) === 'contracts');
  const bar = page.locator('.pd-hz');
  await expect(bar.getByRole('button', { name: /^48 hours/ })).toHaveAttribute('aria-pressed', 'true');
  // The cost is stated before the longer horizon is chosen.
  await expect(bar.locator('.pd-hz__st')).toContainText(/7 days adds \d+ games \(about [\d.]+ (MB|KB)\)/);
  const statedText = await bar.locator('.pd-hz__st').textContent();
  const adds = Number(/7 days adds (\d+) games/.exec((await bar.locator('.pd-hz__st').textContent()) ?? '')?.[1]);
  expect(adds).toBeGreaterThan(0);
  const histBefore = await page.evaluate(() => history.length);
  await bar.getByRole('button', { name: /^7 days/ }).click();
  // In the address, replacing history (Back leaves the list rather than undoing the horizon).
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('hz=7d');
  expect(await page.evaluate(() => history.length)).toBe(histBefore);
  // An explicit loading state with a progress count while the extra games are read.
  await expect(bar.locator('.pd-hz__st')).toContainText(/Reading games: \d+ of \d+/, { timeout: 15_000 }).catch(() => undefined);
  await expect(bar.locator('.pd-hz__st')).toContainText(/game(s)? starting within 7 days/, { timeout: 120_000 });
  const after = documents(log.served).filter((u) => kindOf(u) === 'contracts');
  const fresh = after.filter((u) => !before.includes(u));
  expect(fresh.length, 'only the extra games are read').toBe(adds);
  // The stated cost is an estimate from the board rows: it must be of the right size (within 40% of what was really read).
  const stated = /7 days adds \d+ games \(about ([\d.]+) (MB|KB)\)/.exec(statedText ?? '');
  const statedBytes = Number(stated?.[1]) * (stated?.[2] === 'MB' ? 1_000_000 : 1000);
  const actual = await wire(fresh);
  console.log(JSON.stringify({ stated: statedBytes, actual }));
  expect(Math.abs(statedBytes - actual) / actual, 'the stated cost is close to the cost').toBeLessThan(0.4);
  expect(log.served.filter((u) => before.includes(u) && kindOf(u) === 'contracts').length, 'the first games are not read again').toBe(before.length);
  // Back from a sheet or a detail keeps the horizon: it is part of the address.
  await page.reload();
  await page.waitForSelector('.pd-row', { timeout: 90_000 });
  await expect(bar.getByRole('button', { name: /^7 days/ })).toHaveAttribute('aria-pressed', 'true');
});
