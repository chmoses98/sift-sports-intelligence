// Unavailable-data audit. For each SIFT 3.0 screen, each published document it reads is made to fail in each way a document can fail, using the
// real cached documents for everything else: 404 (not published), network failure, a request that never answers (bounded by the app), malformed JSON
// and an empty list. What must hold in EVERY cell:
//   1. no endless spinner: the skeleton gives way to something within a bound (the app's own fetch bound is lowered to 2.5 s here by a test seam);
//   2. the shell survives (no crash, no raw `undefined` / `NaN` / `[object` / `Error:` text);
//   3. real mode never shows sample data or the word "Sample";
//   4. the tab bar still works (the rest of the app is alive).
// Per cell the harness also records whether the screen says something honest and whether it offers Retry; those are written to the report
// (V3_UNAVAIL_REPORT) and asserted for the cells listed in HONEST (the screen's own primary data).
// Run: V3_PROJECTS=v3-phone V3_PORT=5184 V3_UNAVAIL_REPORT=/tmp/x.jsonl npx playwright test -c playwright.v3.config.ts e2e/v3-unavailable.spec.ts
import { appendFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { feedNow, freshQuotes, readFeedCache, useRealFeeds } from './support/realFeeds';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
test.setTimeout(180_000);

type Mode = '404' | 'network' | 'hang' | 'malformed' | 'empty';
const MODES: Mode[] = ['404', 'network', 'hang', 'malformed', 'empty'];

/** Document kinds, by path. Most are under a sport's `app/latest/`; the history kind is the app's own same-origin static data. */
const KIND: Record<string, RegExp> = {
  board: /\/app\/latest\/board\.json/,
  health: /\/app\/latest\/health\.json/,
  recs: /\/app\/latest\/recommendations\.json/,
  theses: /\/app\/latest\/theses\.json/,
  index: /\/app\/latest\/explorer\/index\.json/,
  metrics: /\/app\/latest\/explorer\/metrics\.json/,
  search: /\/app\/latest\/explorer\/search_index\.json/,
  team: /\/app\/latest\/explorer\/teams\/prt_/,
  player: /\/app\/latest\/explorer\/players\/prt_/,
  research: /\/app\/latest\/explorer\/events\/evt_/,
  detail: /\/app\/latest\/event_detail\/evt_/,
  ranking: /\/app\/latest\/explorer\/rankings\//,
  series: /\/app\/latest\/explorer\/series\//,
  proj: /\/projections\/nfl\/(distributions\/)?latest\.json/,
  history: /\/data\/nfl\/history\//,
  feed: /\/live-quotes\/games\/[^/]+\.json/,
};

/** Screens, and the document kinds each one reads. `primary` kinds are the screen's own subject: an honest state is required when they fail. */
interface Screen { name: string; path: string; kinds: string[]; primary: string[]; ready?: string }
const NFL_GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const SCREENS: Screen[] = [
  { name: 'Home', path: '/v3', kinds: ['board', 'health', 'recs', 'detail', 'research', 'index', 'feed'], primary: ['board'] },
  { name: 'Games', path: '/v3/games?sport=nfl&state=upcoming', kinds: ['board', 'health', 'detail', 'index', 'feed'], primary: ['board'] },
  { name: 'Game Detail', path: NFL_GAME, kinds: ['board', 'detail', 'research', 'index', 'feed'], primary: ['detail'] },
  { name: 'Game props', path: `${NFL_GAME}?tab=props`, kinds: ['detail', 'feed'], primary: ['detail'] },
  { name: 'Game matchup', path: `${NFL_GAME}?tab=matchup`, kinds: ['team', 'metrics', 'proj', 'theses'], primary: ['team'] },
  { name: 'Team', path: '/v3/team/nfl/DAL', kinds: ['team', 'index', 'metrics', 'detail'], primary: ['team'] },
  { name: 'Player', path: '/v3/player/nfl/prt_4c661ae8b854ff5f66dd', kinds: ['player', 'index', 'search', 'history', 'detail', 'feed', 'proj'], primary: ['player'] },
  { name: 'Stat', path: '/v3/stat/nfl/off_epa_play', kinds: ['metrics', 'ranking', 'index', 'team'], primary: ['ranking'] },
  { name: 'Prop Discovery', path: '/v3/props?view=list', kinds: ['board', 'detail', 'index', 'ranking', 'team', 'feed', 'history'], primary: ['detail'] },
  { name: 'Explore', path: '/v3/explore', kinds: ['search', 'index', 'board'], primary: ['search'] },
];

const only = process.env.V3_UNAVAIL_ONLY?.split(',');
const modesOnly = process.env.V3_UNAVAIL_MODES?.split(',') as Mode[] | undefined;

const empty = (doc: unknown): unknown => {
  if (Array.isArray(doc)) return [];
  if (!doc || typeof doc !== 'object') return doc;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    out[k] = Array.isArray(v) ? [] : v && typeof v === 'object' && /^(files|players_by_team|by_|entries)/.test(k) ? {} : v;
  }
  return out;
};

async function install(page: Page, kind: string, mode: Mode) {
  await page.addInitScript(() => { (window as unknown as { __SIFT_FETCH_TIMEOUT_MS__: number }).__SIFT_FETCH_TIMEOUT_MS__ = 2500; });
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* ignore */ } });
  await useRealFeeds(page);
  await freshQuotes(page);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|raw\.githubusercontent\.com)/, (r) => r.abort());
  await page.clock.setFixedTime(feedNow());
  const re = KIND[kind];
  await page.route((u) => re.test(u.toString()), async (route) => {
    const url = route.request().url();
    const cors = { 'access-control-allow-origin': '*' };
    switch (mode) {
      case '404': return route.fulfill({ status: 404, body: 'not found', headers: cors });
      case 'network': return route.abort('failed');
      case 'hang': return new Promise<void>(() => undefined); // never answers
      case 'malformed': return route.fulfill({ status: 200, body: '{"items": [{"event_id": "evt_', headers: { ...cors, 'content-type': 'application/json' } });
      case 'empty': {
        const body = readFeedCache(url);
        if (!body) return route.fallback();
        try { return route.fulfill({ status: 200, body: JSON.stringify(empty(JSON.parse(body.toString('utf8')))), headers: { ...cors, 'content-type': 'application/json' } }); } catch { return route.fallback(); }
      }
    }
  });
}

const LOADING = '[class*="skel"], [aria-busy="true"], [aria-label*="Loading" i], [role="progressbar"]';
const loadingCount = async (page: Page) => (await page.locator(LOADING).count()) + ((await page.locator('[data-v3-shell]').innerText()).match(/\bLoading\b/i) ? 1 : 0);
const HONEST = /unavailable|not available|could not|couldn.t|can.t be|cannot|not published|isn.t (published|available|listed)|no .{0,40}(listed|published|available|found|yet)|nothing|not in the publication|not on the published|failed|unreadable/i;
const BROKEN = /\bundefined\b|\bNaN\b|\[object |\bnull\b(?!\s*value)|Error:|Something went wrong|TypeError|Cannot read/;

async function measure(page: Page, path: string) {
  const t0 = Date.now();
  await page.goto(`./#${path}`);
  await expect(page.locator('[data-v3-shell]')).toBeVisible();
  let calm = 0;
  // never judge before 9 s: a request starts late on a busy machine and the app's own bound (2.5 s here) only starts then
  while (Date.now() - t0 < 45_000) {
    if ((await loadingCount(page)) === 0) { calm++; if (calm >= 4 && Date.now() - t0 >= 9_000) break; } else calm = 0;
    await page.waitForTimeout(500);
  }
  const settledMs = Date.now() - t0;
  const stillLoading = await loadingCount(page);
  const text = await page.locator('[data-v3-shell]').innerText();
  return { settledMs, stillLoading, text, snippet: text.replace(/\s+/g, ' ').slice(0, 220), retry: await page.getByRole('button', { name: /^Retry$/ }).count(), honest: HONEST.test(text) };
}

const reportFile = process.env.V3_UNAVAIL_REPORT;

for (const screen of SCREENS) {
  if (only && !only.includes(screen.name)) continue;
  test.describe(`unavailable data: ${screen.name} @v3`, () => {
    for (const kind of screen.kinds) {
      for (const mode of MODES) {
        if (modesOnly && !modesOnly.includes(mode)) continue;
        if (mode === 'hang' && !screen.primary.includes(kind)) continue; // the same bound applies to every document; one hang per screen's subject proves it
        test(`${kind} ${mode}`, async ({ page }) => {
          await install(page, kind, mode);
          const r = await measure(page, screen.path);
          const primary = screen.primary.includes(kind);
          const cell = { screen: screen.name, kind, mode, primary, settledMs: r.settledMs, stillLoading: r.stillLoading, honest: r.honest, retry: r.retry, broken: BROKEN.exec(r.text)?.[0] ?? null, sample: /\bSample\b/.test(r.text), len: r.text.length, snippet: r.snippet };
          if (reportFile) appendFileSync(reportFile, `${JSON.stringify(cell)}\n`);
          // 1. no endless spinner
          expect(r.stillLoading, `a skeleton is still on screen after ${r.settledMs} ms`).toBe(0);
          // 2. the shell survives and prints no raw failure
          expect(cell.broken, 'raw failure text on screen').toBeNull();
          // 3. real mode never shows sample data
          expect(cell.sample, 'sample data in real mode').toBe(false);
          // 4. the rest of the app is alive
          await page.getByRole('link', { name: 'Following' }).first().click();
          await expect(page).toHaveURL(/#\/v3\/following/);
          // 5. a failing PRIMARY document is said out loud
          if (primary && mode !== 'empty') expect(r.honest, `no honest unavailable state for the failed ${kind}`).toBe(true);
        });
      }
    }
  });
}
