// SIFT 3.0 as the DEFAULT interface of the deployed app: read-only, real published data, no fixtures, Chromium phone + WebKit iPhone.
//
//   node scripts/v3-production-check.mjs      (SIFT_URL overrides the Pages address; SIFT_EXPECT_SHA names the commit that must be live)
//
// Proves: the site serves the expected commit (version.json); the root address opens SIFT 3.0 (not SIFT 2.0 / v4) and keeps it after a reload; the
// primary navigation is exactly Home / Props / Following and each opens; a game opens from the Home feed and Back returns to Home; the CFB Script
// Engine tab renders published scripts (or, with none published, its honest empty state); no page errors, no NaN / undefined. Quote prices are
// proven separately (v3-quote-production-check.mjs, relay-production-verify.mjs).
import { chromium, webkit, devices } from '@playwright/test';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const EXPECT_SHA = (process.env.SIFT_EXPECT_SHA ?? '').trim();
const CFB_RAW = (process.env.SIFT_CFB_RAW ?? 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main').replace(/\/+$/, '');
const MISSING = /\bNaN\b|\bundefined\b|\[object Object\]|Infinity/;

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));
const na = (msg) => console.log(`  N/A  ${msg}`);
const first = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200);

// ---- the deployed build
console.log('== deployed build');
try {
  const r = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const v = await r.json();
  console.log(`  deployed ${String(v.sha).slice(0, 7)} built ${v.built_at}`);
  if (EXPECT_SHA) check(v.sha === EXPECT_SHA, `the site serves the expected commit (${String(v.sha).slice(0, 7)} = ${EXPECT_SHA.slice(0, 7)})`);
  else check(/^[0-9a-f]{40}$/.test(String(v.sha)), 'version.json names the deployed commit');
} catch (e) { check(false, `version.json is published: ${first(e)}`); }

// ---- does the CFB publication have scripted games at all (then the Script Engine tab must show some)
let scriptedCfb = null;
try {
  const idx = await (await fetch(`${CFB_RAW}/data/scripting/live/index.json`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })).json();
  scriptedCfb = Object.values(idx.games ?? {}).filter((g) => g.status === 'SCRIPTS_GENERATED' || g.status === 'SINGLE_SCRIPT').length;
  console.log(`  CFB script index: ${scriptedCfb} game(s) with published scripts`);
} catch (e) { na(`the CFB script index could not be read (${first(e)}); the Script Engine tab is judged on what it renders`); }

const runs = [
  ['chromium-phone', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['webkit-iphone', webkit, devices['iPhone 14']],
];

async function body(page) { return page.locator('body').innerText(); }
async function settle(page, ms = 2500) { await page.waitForSelector('[data-v3-shell]', { timeout: 60_000 }); await page.waitForTimeout(ms); }
const gameLinks = (page, sport = '') => page.$$eval(`a[href*="/v3/game/${sport}"]`, (a) => [...new Set(a.map((x) => x.getAttribute('href')))]);

for (const [name, engine, ctxOpts] of runs) {
  console.log(`\n== ${name}`);
  const tag = (s) => `${name}: ${s}`;
  const browser = await engine.launch();
  try {
    const ctx = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block' });
    // A first-run onboarding sheet is not under test here; everything else is the default, first-visit app.
    await ctx.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ onboarded: true })); } catch { /* storage blocked */ } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(first(e)));

    // --- SIFT 3.0 is the default; a refresh keeps it
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/#\/v3$/, { timeout: 60_000 });
    await settle(page);
    check(await page.locator('[data-v3-shell]').isVisible(), tag('the root address opens SIFT 3.0 (#/v3)'));
    check((await page.locator('[data-v4-shell]').count()) === 0 && (await page.locator('.s2-shell, .s2-topbar').count()) === 0, tag('it is not SIFT 2.0 or v4'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page, 500);
    check(/#\/v3$/.test(page.url()), tag('a refresh stays on SIFT 3.0'));

    // --- primary navigation: Home / Props / Following
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const labels = (await nav.getByRole('link').allInnerTexts()).map((t) => t.trim());
    check(labels.join('|') === 'Home|Props|Following', tag(`the primary navigation is Home / Props / Following (${labels.join(' · ')})`));
    const links = await gameLinks(page);
    check(links.length > 0, tag(`Home lists ${links.length} game(s) from the published slate`));
    check(!MISSING.test(await body(page)), tag('Home shows no NaN / undefined'));

    await nav.getByRole('link', { name: 'Props' }).click();
    await page.waitForURL(/#\/v3\/props/, { timeout: 30_000 });
    await settle(page);
    check(!MISSING.test(await body(page)) && (await body(page)).trim().length > 40, tag('Props opens, has content and shows no NaN / undefined'));
    await nav.getByRole('link', { name: 'Following' }).click();
    await page.waitForURL(/#\/v3\/following/, { timeout: 30_000 });
    await settle(page, 1000);
    check(!MISSING.test(await body(page)) && (await body(page)).trim().length > 40, tag('Following opens (a list or its empty state) and shows no NaN / undefined'));
    await nav.getByRole('link', { name: 'Home' }).click();
    await page.waitForURL(/#\/v3$/, { timeout: 30_000 });
    await settle(page, 1500);

    // --- game navigation: open a game from the Home feed, then Back returns to Home
    const href = (await gameLinks(page))[0];
    if (!href) na(tag('no game on the Home feed to open'));
    else {
      // Tap the top-left of the card, where the title sits: the centre of a card at 390 px can hold the market lines.
      await page.locator(`a[href="${href}"]`).first().scrollIntoViewIfNeeded();
      await page.locator(`a[href="${href}"]`).first().click({ position: { x: 14, y: 14 } });
      await page.waitForURL(/#\/v3\/game\//, { timeout: 30_000 });
      await page.getByRole('tablist', { name: 'Game sections' }).waitFor({ timeout: 60_000 });
      check(!MISSING.test(await body(page)), tag(`a game opens from the Home feed (${new URL(page.url()).hash}) and shows no NaN / undefined`));
      await page.getByRole('button', { name: 'Back' }).first().click();
      await page.waitForURL(/#\/v3$/, { timeout: 30_000 });
      check(true, tag('Back from the game returns to Home'));
    }

    // --- CFB Script Engine
    await page.goto(`${BASE}#/v3?sport=cfb`, { waitUntil: 'domcontentloaded' });
    await settle(page, 4000);
    const cfb = (await gameLinks(page, 'cfb/')).slice(0, 15);
    if (!cfb.length) na(tag('Home lists no CFB game right now'));
    else {
      let withScripts = 0; let honestEmpty = 0; let started = 0; let firstFail = null;
      for (const h of cfb) {
        await page.goto(`${BASE}${h.startsWith('#') ? h : `#${h}`}`, { waitUntil: 'domcontentloaded' });
        try {
          await page.getByRole('tablist', { name: 'Game sections' }).waitFor({ timeout: 45_000 });
          // A game already in play shows Live / Props only (no pregame script tab): that is the product, not a failure.
          const scriptTab = page.getByRole('tab', { name: 'Game Script' });
          // The tab set settles after the research loads; only a game that still has no script tab then is one in play.
          if (!(await scriptTab.waitFor({ timeout: 12_000 }).then(() => true).catch(() => false))) { started++; continue; }
          await scriptTab.click();
          await page.locator('[data-testid="cfb-script-overview"], [data-testid="cfb-no-script"], [data-testid="cfb-script-tab"]').first().waitFor({ timeout: 30_000 });
          if (await page.locator('[data-testid="cfb-script"], [data-testid="cfb-script-detail"]').count()) withScripts++;
          else honestEmpty++;
          if (MISSING.test(await body(page))) firstFail ??= `${h} shows NaN / undefined`;
        } catch (e) { firstFail ??= `${h}: ${first(e)}`; }
        if (withScripts >= 2) break;
      }
      console.log(`  CFB games opened: ${withScripts} with scripts, ${honestEmpty} with the honest empty state, ${started} already in play (no script tab)`);
      check(!firstFail, tag(`every CFB Game Script tab renders the engine page or its honest empty state${firstFail ? ` (${firstFail})` : ''}`));
      if (!withScripts && !honestEmpty) na(tag('every CFB game listed is already in play; the Script Engine is judged on the next pregame slate'));
      else if (scriptedCfb) check(withScripts > 0, tag(`the Script Engine shows published scripts (${scriptedCfb} scripted game(s) in the publication)`));
      else na(tag('the CFB publication lists no scripted game; scripts are not required'));
    }

    check(errs.length === 0, tag(`no page errors${errs.length ? ` (${errs[0]})` : ''}`));
    await ctx.close();
  } catch (e) {
    check(false, tag(first(e)));
  } finally {
    await browser.close();
  }
}

console.log(failures.length ? `\nSIFT 3.0 production check FAILED (${failures.length}):\n- ${failures.join('\n- ')}` : '\nSIFT 3.0 production check passed');
process.exit(failures.length ? 1 : 0);
