// Post-deploy production check of the SIFT v4 CFB and NBA projection screens on the LIVE site: no fixtures, no mocks. The numbers the
// phone shows are compared with the published projection feeds (cfb-edge-finder and nba-edge-finder `projection-data`), read here straight
// from raw.githubusercontent.com, not through the app. Read-only. Chromium phone and WebKit iPhone each:
//
//   v4 -> Props -> CFB: games with forecasts; the selected game's projected points (mean and 80% range) equal the feed's team_points rows;
//        college player research is labelled unapproved research and every figure equals its feed row; no ruled-out or blocked player is shown
//   v4 -> Props -> NBA: every listed player's seven stats (points, rebounds, assists, threes, minutes, PRA, FGA) equal the feed's rows with
//        their published 80% ranges; ruled-out and BLOCKed players are absent; one projection per player and stat
//   Game -> Matchups (CFB) and Game -> Players (CFB and NBA) open from "Open game research" and show the same labelled projections
//
// Schedule-aware: a part with no upcoming game in the feed, or a feed older than the app's freshness limit, prints N/A with the reason, never a pass.
//
//   node scripts/v4-projections-production-check.mjs [--no-webkit]
//
// Env: SIFT_URL (default production), SIFT_EXPECT_SHA (the deployed commit, checked against version.json).
import { chromium, webkit } from '@playwright/test';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const FEED_URL = (sport) => `https://raw.githubusercontent.com/chmoses98/${sport}-edge-finder/projection-data/projections/${sport}/latest.json`;
const MAX_AGE_H = { cfb: 192, nba: 48 };
const MISSING = /\bNaN\b|\bundefined\b|\[object|\bInfinity\b/;
const AUTHORITY = /best bet|guaranteed|recommended bet|sure thing|\block\b/i;
const NBA_FAMILIES = ['points', 'rebounds', 'assists', 'threes', 'minutes', 'pra', 'fga'];
const NBA_LABEL = { points: 'PTS', rebounds: 'REB', assists: 'AST', threes: '3PM', minutes: 'MIN', pra: 'PRA', fga: 'FGA' };
const CFB_LABEL = { passing_yards: 'Pass yds', rushing_yards: 'Rush yds', receiving_yards: 'Rec yds', passing_attempts: 'Pass att', carries: 'Carries', receptions: 'Catches' };
const argv = process.argv.slice(2);

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));
const na = (msg) => console.log(`  N/A  ${msg}`);
const first = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200);

const getJson = async (url) => {
  const r = await fetch(`${url}?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
// What the app prints: one decimal for a mean, whole numbers for the published 80% range.
const dec = (n) => n.toFixed(1);
const rng = (lo, hi) => (lo != null && hi != null ? `${Math.round(lo)}–${Math.round(hi)}` : 'Not published');
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const settled = (page) => page.waitForFunction(() => document.querySelector('[data-v4-shell]') && !document.querySelector('.v4-skel, [aria-label^="Loading"]'), null, { timeout: 60_000 });
const ageH = (feed) => (Date.now() - Date.parse(feed.data_asof_utc ?? feed.generated_utc)) / 3.6e6;
const isOut = (p) => ['CONFIRMED_OUT', 'LIKELY_OUT'].includes(p.participation?.status);

async function deployment() {
  console.log('\n== deployment');
  const v = await getJson(`${BASE}version.json`).catch((e) => ({ error: first(e) }));
  check(!!v.sha, `version.json is served (${v.sha ? v.sha.slice(0, 7) : v.error})`);
  if (process.env.SIFT_EXPECT_SHA) check(v.sha === process.env.SIFT_EXPECT_SHA, `the deployed commit is the intended one (${String(v.sha).slice(0, 7)} vs ${process.env.SIFT_EXPECT_SHA.slice(0, 7)})`);
}

async function newPage(browser, device) {
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(first(e)));
  return { ctx, page, errs };
}

const chip = (page, re) => page.getByRole('group', { name: 'Sport' }).getByRole('button', { name: re });
const gameButtons = (page) => page.getByRole('list', { name: 'Choose a projected game' }).getByRole('button');

async function openProps(page, sport) {
  await page.goto(`${BASE}#/v4/props`, { waitUntil: 'domcontentloaded' });
  await chip(page, new RegExp(`^${sport.toUpperCase()}`)).click({ timeout: 60_000 });
  await settled(page);
  await page.waitForTimeout(1500);
}

// ------------------------------------------------------------------ CFB

async function cfb(browser, device, name, feed) {
  const tag = (m) => `${name}: ${m}`;
  console.log(`\n== ${name}: CFB`);
  const now = Date.now();
  const upcoming = feed.games.filter((g) => Date.parse(g.start_utc) >= now - 2 * 3600_000).sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc));
  const jmu = upcoming.find((g) => /James Madison/.test(`${g.away}${g.home}`) && /App State/.test(`${g.away}${g.home}`));
  const targets = [...new Set([jmu, upcoming[0], upcoming[upcoming.length > 3 ? 3 : upcoming.length - 1]].filter(Boolean))];
  if (ageH(feed) > MAX_AGE_H.cfb) return na(tag(`the CFB feed is ${ageH(feed).toFixed(0)} h old, past the app's ${MAX_AGE_H.cfb} h limit: the app withholds it by design`));
  if (!targets.length) return na(tag('the CFB feed has no upcoming game'));
  const { ctx, page, errs } = await newPage(browser, device);
  try {
    await openProps(page, 'cfb');
    check((await gameButtons(page).count()) > 0, tag('Props -> CFB lists games with forecasts'));
    for (const g of targets) {
      const label = `${g.away} @ ${g.home}`;
      const row = page.getByRole('list', { name: 'Choose a projected game' }).getByRole('button').filter({ hasText: new RegExp(g.away.split(' ')[0]) });
      const match = (await row.count()) ? row.filter({ hasText: new RegExp(g.home.split(' ')[0]) }).first() : null;
      if (!match || !(await match.count())) { na(tag(`${label}: the app's game list does not carry this matchup (different team naming or outside its window)`)); continue; }
      await match.click();
      await page.waitForTimeout(500);
      const card = page.getByRole('region', { name: 'College football projected points' });
      await card.waitFor({ timeout: 30_000 });
      const text = await card.innerText();
      const tp = g.teams.filter((t) => t.family === 'team_points');
      const blocked = tp.some((t) => (t.gate?.status ?? g.gate_status) === 'BLOCK');
      if (blocked) { check(/Team projection unavailable/.test(text), tag(`${label}: a publisher-BLOCKed team forecast is withheld, not shown`)); continue; }
      for (const t of tp) {
        check(text.includes(dec(t.mean)) && text.includes(`80% range ${rng(t.p10, t.p90)}`), tag(`${label}: ${t.team} projected points ${dec(t.mean)} (80% range ${rng(t.p10, t.p90)}) match the feed`));
      }
      check(/A model score is not a validated betting edge/.test(text), tag(`${label}: the team forecast says it is not a betting edge`));
      const players = page.getByRole('region', { name: 'College player projection research' });
      const ptext = await players.innerText();
      check(/Research preview · player availability unverified/.test(ptext) && /not approved SIFT player projections/.test(ptext), tag(`${label}: player figures are labelled unapproved research, availability unverified`));
      // every shown player's lead number equals its feed row
      const shown = await players.locator('details').evaluateAll((els) => els.map((d) => ({ name: d.querySelector('summary b')?.textContent ?? '', lead: d.querySelector('summary .num b')?.textContent ?? '', leadLabel: d.querySelector('summary .num .meta')?.textContent ?? '', kv: [...d.querySelectorAll('.v4-kv')].map((k) => [k.querySelector('.v4-kv__k')?.textContent ?? '', k.querySelector('.v4-kv__v')?.textContent ?? '']) })));
      const rows = feed.players.filter((p) => p.game_id === g.game_id);
      let bad = [];
      for (const s of shown) {
        const mine = rows.filter((p) => p.name === s.name);
        for (const [k, v] of s.kv) {
          const fam = Object.keys(CFB_LABEL).find((f) => CFB_LABEL[f] === k);
          const r = mine.find((p) => p.family === fam);
          if (!r || !v.startsWith(dec(r.mean)) || !v.includes(`80% range ${rng(r.p10, r.p90)}`)) bad.push(`${s.name} ${k} "${v}"`);
        }
        if (mine.some((p) => isOut(p) || p.gate?.status === 'BLOCK') && !mine.some((p) => !isOut(p) && p.gate?.status !== 'BLOCK')) bad.push(`${s.name} is ruled out or blocked`);
      }
      check(shown.length > 0 ? bad.length === 0 : true, tag(`${label}: ${shown.length} player rows equal the feed${bad.length ? ` (mismatch: ${bad.slice(0, 3).join('; ')})` : ''}`));
      if (g === targets[0]) {
        await page.getByRole('link', { name: 'Open game research' }).click();
        await page.waitForURL(/#\/v4\/game\/cfb\//, { timeout: 30_000 });
        await settled(page);
        await page.getByRole('tab', { name: 'Matchups' }).waitFor({ timeout: 30_000 });
        const m = await page.getByRole('region', { name: 'College football projected points' }).innerText();
        check(tp.every((t) => m.includes(dec(t.mean))), tag(`${label}: Game -> Matchups shows the approved team projected points`));
        await page.getByRole('tab', { name: 'Players' }).click();
        await page.getByRole('region', { name: 'College player projection research' }).waitFor({ timeout: 30_000 });
        check(/Research preview/.test(await page.locator('[role=tabpanel]').innerText()), tag(`${label}: Game -> Players is labelled research`));
        const d = page.locator('[role=tabpanel] details').first();
        if (await d.count()) { await d.locator('summary').click(); check(await d.evaluate((e) => e.open), tag(`${label}: player detail expands`)); }
        await openProps(page, 'cfb');
      }
    }
    const body = await page.locator('main').innerText();
    check(!MISSING.test(body) && !AUTHORITY.test(body), tag('no NaN/undefined and no betting-authority wording'));
    check((await overflow(page)) <= 1, tag('no horizontal overflow on a phone'));
    await page.screenshot({ path: `production-v4-projections-${name}-cfb.png`, fullPage: true });
  } catch (e) { check(false, tag(`CFB: ${first(e)}`)); await page.screenshot({ path: `production-v4-projections-${name}-cfb-failure.png` }).catch(() => {}); }
  check(errs.length === 0, tag(`no page errors on CFB${errs.length ? ` (${errs[0]})` : ''}`));
  await ctx.close();
}

// ------------------------------------------------------------------ NBA

async function nba(browser, device, name, feed) {
  const tag = (m) => `${name}: ${m}`;
  console.log(`\n== ${name}: NBA`);
  const now = Date.now();
  const upcoming = feed.games.filter((g) => Date.parse(g.start_utc) >= now - 2 * 3600_000).sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc));
  if (ageH(feed) > MAX_AGE_H.nba) return na(tag(`the NBA feed is ${ageH(feed).toFixed(0)} h old, past the app's ${MAX_AGE_H.nba} h limit: the app withholds it by design`));
  if (!upcoming.length) return na(tag('the NBA feed has no upcoming game'));
  const { ctx, page, errs } = await newPage(browser, device);
  try {
    await openProps(page, 'nba');
    const n = await gameButtons(page).count();
    check(n > 0, tag(`Props -> NBA lists ${n} games with forecasts`));
    for (let i = 0; i < Math.min(n, 2); i++) {
      await gameButtons(page).nth(i).click();
      await page.waitForTimeout(500);
      const sec = page.getByRole('region', { name: 'NBA player projections' });
      await sec.waitFor({ timeout: 30_000 });
      const title = (await gameButtons(page).nth(i).innerText()).split('\n')[0];
      const banner = await sec.innerText();
      check(/Research preview|SIFT model/.test(banner), tag(`${title}: the projections carry a quality label`));
      const shown = await sec.locator('details').evaluateAll((els) => els.map((d) => { d.open = true; return { name: d.querySelector('summary b')?.textContent ?? '', team: (d.querySelector('summary .meta')?.textContent ?? '').split('·')[0].trim(), kv: [...d.querySelectorAll('.v4-kv')].map((k) => [k.querySelector('.v4-kv__k')?.textContent ?? '', k.querySelector('.v4-kv__v')?.textContent ?? '']) }; }));
      const names = shown.map((s) => `${s.team}|${s.name}`);
      check(new Set(names).size === names.length, tag(`${title}: one entry per player (${names.length})`));
      const bad = [];
      let seenStats = new Set();
      for (const s of shown) {
        const rows = feed.players.filter((p) => p.name === s.name && p.team === s.team && upcoming.some((g) => g.game_id === p.game_id));
        if (!rows.length) { bad.push(`${s.name}: not in the feed for this team`); continue; }
        const labels = s.kv.map(([k]) => k);
        if (new Set(labels).size !== labels.length) bad.push(`${s.name}: a statistic is listed twice`);
        for (const [k, v] of s.kv) {
          const fam = NBA_FAMILIES.find((f) => NBA_LABEL[f] === k);
          const r = rows.find((p) => p.family === fam);
          seenStats.add(fam);
          if (!r || !v.startsWith(dec(r.mean)) || !v.includes(`80% range ${rng(r.p10, r.p90)}`)) bad.push(`${s.name} ${k} "${v}" vs ${r ? `${dec(r.mean)} ${rng(r.p10, r.p90)}` : 'no row'}`);
          if (r && (r.gate?.status === 'BLOCK' || isOut(r))) bad.push(`${s.name} ${k} is ruled out or blocked but shown`);
        }
      }
      check(bad.length === 0, tag(`${title}: every figure and 80% range equals its feed row${bad.length ? ` (mismatch: ${bad.slice(0, 3).join('; ')})` : ''}`));
      check(NBA_FAMILIES.every((f) => seenStats.has(f)), tag(`${title}: all seven families appear (${[...seenStats].map((f) => NBA_LABEL[f]).join(' ')})`));
      if (i === 0) {
        const d = sec.locator('details').first();
        await d.locator('summary').click();
        await page.getByRole('link', { name: 'Open game research' }).click();
        await page.waitForURL(/#\/v4\/game\/nba\//, { timeout: 30_000 });
        await settled(page);
        await page.getByRole('tab', { name: 'Players' }).click();
        await page.getByRole('region', { name: 'NBA player projections' }).waitFor({ timeout: 30_000 });
        check(/Research preview|SIFT model/.test(await page.locator('[role=tabpanel]').innerText()), tag(`${title}: Game -> Players shows the labelled forecasts`));
        const d2 = page.locator('[role=tabpanel] details').first();
        await d2.locator('summary').click();
        check(await d2.evaluate((e) => e.open), tag(`${title}: player detail expands`));
        await openProps(page, 'nba');
      }
    }
    const body = await page.locator('main').innerText();
    check(!MISSING.test(body) && !AUTHORITY.test(body), tag('no NaN/undefined and no betting-authority wording'));
    check((await overflow(page)) <= 1, tag('no horizontal overflow on a phone'));
    await page.screenshot({ path: `production-v4-projections-${name}-nba.png`, fullPage: true });
  } catch (e) { check(false, tag(`NBA: ${first(e)}`)); await page.screenshot({ path: `production-v4-projections-${name}-nba-failure.png` }).catch(() => {}); }
  check(errs.length === 0, tag(`no page errors on NBA${errs.length ? ` (${errs[0]})` : ''}`));
  await ctx.close();
}

// ------------------------------------------------------------------ run

await deployment();
const feeds = { cfb: await getJson(FEED_URL('cfb')), nba: await getJson(FEED_URL('nba')) };
console.log(`\nfeeds: CFB ${feeds.cfb.games.length} games / ${feeds.cfb.players.length} rows (inputs ${ageH(feeds.cfb).toFixed(1)} h old); NBA ${feeds.nba.games.length} games / ${feeds.nba.players.length} rows (inputs ${ageH(feeds.nba).toFixed(1)} h old)`);
const devices = [['chromium-phone', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]];
if (!argv.includes('--no-webkit')) devices.push(['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]);
for (const [name, type, device] of devices) {
  const browser = await type.launch(process.env.SIFT_CHROMIUM_ARGS && type === chromium ? { args: JSON.parse(process.env.SIFT_CHROMIUM_ARGS) } : {});
  try {
    await cfb(browser, device, name, feeds.cfb);
    await nba(browser, device, name, feeds.nba);
  } finally { await browser.close(); }
}
console.log(failures.length ? `\nv4 projections production check FAILED (${failures.length}):\n- ${failures.join('\n- ')}` : '\nv4 projections production check passed');
process.exit(failures.length ? 1 : 0);
