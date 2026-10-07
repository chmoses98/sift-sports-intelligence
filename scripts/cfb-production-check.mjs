// CFB production smoke: the LIVE site on GitHub Pages against the LIVE cfb-edge-finder publication, in real
// Chromium and WebKit. No fixtures, no pinned game. Read-only.
//
//   node scripts/cfb-production-check.mjs
//
// 1. Upstream: from the live script index (data/scripting/live/index.json) and the live explorer export, pick
//    the earliest upcoming SCRIPTS_GENERATED, SINGLE_SCRIPT and NO_SCRIPT_CLEARED_EVIDENCE games whose exported
//    payload agrees with the index (scripts/cfb/select.mjs). A disagreement is an upstream export failure.
// 2. Production: open each game on the live site, as a deep link and from the CFB slate, and require
//      positive -> the CFB Script Engine page, exactly the published scripts (titles and count), no empty state
//      negative -> the honest empty state and no script card
//      every game -> both teams' committed CFB logos loaded in the hero
// 3. Freshness: the deployed build's SHA (version.json) when SIFT_EXPECT_SHA is set, and the publication's age.
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { NEGATIVE, selectGames, upcoming } from './cfb/select.mjs';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const CFB_RAW = (process.env.SIFT_CFB_RAW ?? 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main').replace(/\/+$/, '');
const APP = `${CFB_RAW}/app/latest`;
const EXPECT_SHA = (process.env.SIFT_EXPECT_SHA ?? '').trim();
const EMPTY = 'No script cleared its evidence requirement';
/** The committed CFB identity map this build ships (team code -> ESPN id -> public/teams/cfb/<id>.webp). */
const CFB_TEAMS = JSON.parse(readFileSync(new URL('../src/lib/cfb-teams.json', import.meta.url), 'utf-8')).teams;
const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// ------------------------------------------------------------------ 1. upstream
console.log('CFB publication');
const [board, explorerIndex, scriptIndex, health] = await Promise.all([
  getJson(`${APP}/board.json`),
  getJson(`${APP}/explorer/index.json`),
  getJson(`${CFB_RAW}/data/scripting/live/index.json`),
  getJson(`${APP}/health.json`).catch(() => null),
]);
const ageH = (iso) => (Date.now() - Date.parse(iso ?? '')) / 3600e3;
console.log(`  board generated ${board.generated_at} (${ageH(board.generated_at).toFixed(1)} h ago) · explorer built ${explorerIndex.generated_at ?? explorerIndex.built_at ?? '?'} · script index ${scriptIndex.methodology_version} counts ${JSON.stringify(scriptIndex.counts)}`);
console.log(`  health ${health?.overall_status ?? '?'} generated ${health?.generated_at ?? '?'}`);
const nUpcoming = upcoming(board, Date.now()).length;
const { picked, problems, scanned } = await selectGames({
  board, explorerIndex, scriptIndex, nowMs: Date.now(), readDoc: (p) => getJson(`${APP}/${p}`), maxScan: Infinity,
});
console.log(`  ${nUpcoming} upcoming games, scanned ${scanned}`);
for (const p of problems) check(false, `upstream export: ${p}`);
for (const k of ['SCRIPTS_GENERATED', 'SINGLE_SCRIPT', NEGATIVE]) {
  const g = picked[k];
  if (g) console.log(`  ${k.padEnd(27)} ${g.gameKey} ${g.eventId} ${g.away} @ ${g.home} ${g.start} · scripts ${g.scripts.map((s) => `${s.role}:${s.title}`).join(' | ') || '—'}`);
  else console.log(`  ${k.padEnd(27)} NOT_APPLICABLE — no upcoming game has this status`);
}
// A slate with games must put at least one real script in front of the reader; an empty slate (off-season) is
// reported, not failed.
if (nUpcoming) check(!!(picked.SCRIPTS_GENERATED || picked.SINGLE_SCRIPT), 'upstream: at least one upcoming game carries published scripts');
else console.log('  no upcoming CFB game: page assertions NOT_APPLICABLE');

// ------------------------------------------------------------------ 2. production
async function deployedSha() {
  try {
    const r = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    return r.ok ? (await r.json()).sha ?? null : null;
  } catch {
    return null;
  }
}

/** The Pages CDN can answer with the previous build for a few minutes after a deploy: wait up to 10 for the new one. */
async function awaitSha(want) {
  let sha = await deployedSha();
  for (let i = 0; i < 20 && sha !== want; i++) {
    await new Promise((r) => setTimeout(r, 30_000));
    sha = await deployedSha();
  }
  return sha;
}

/** What the open game page shows: engine page, script cards, empty state, hero logos. */
async function readGame(page) {
  await page.locator('.game').first().waitFor({ timeout: 60_000 });
  await page.locator('.skel').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  // The hero logos are held images: wait until both have loaded (or the page settles without them).
  await page.waitForFunction(() => document.querySelectorAll('.gh .teammark--logo img, .gh img.teammark--logo').length >= 2 && [...document.querySelectorAll('.gh img.teammark--logo')].every((i) => i.complete), null, { timeout: 20_000 }).catch(() => {});
  return page.evaluate((empty) => ({
    engine: !!document.querySelector('.game--engine'),
    cards: [...document.querySelectorAll('.ov--engine .eng-scard .scard__name, .stab__pick .eng-scard .scard__name')].map((e) => e.textContent?.trim() ?? ''),
    empty: document.body.innerText.includes(empty),
    logos: [...document.querySelectorAll('.gh img.teammark--logo')].map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })),
    textMarks: [...document.querySelectorAll('.gh .teammark--text')].map((e) => e.textContent?.trim()),
  }), EMPTY);
}

/** Logo files the site has served in this browser context (held images are re-used as blob: URLs after). */
const served = new Set();

function judge(label, kind, g, seen) {
  const titles = g.scripts.map((s) => s.title);
  console.log(`  ${label}: engine=${seen.engine} cards=[${seen.cards.join(' | ')}] empty=${seen.empty} logos=${seen.logos.map((l) => `${l.src.split('/').slice(-2).join('/')}${l.ok ? '' : '(not loaded)'}`).join(',') || '—'} text-marks=[${seen.textMarks.join(',')}]`);
  check(seen.engine, `${label}: renders the CFB Script Engine page`);
  if (kind === NEGATIVE) {
    check(seen.empty, `${label}: shows the honest empty state`);
    check(seen.cards.length === 0, `${label}: shows no script card`);
  } else {
    check(!seen.empty, `${label}: does not show "${EMPTY}"`);
    check(seen.cards.length === titles.length, `${label}: shows ${titles.length} script card(s) (got ${seen.cards.length})`);
    check(titles.every((t) => seen.cards.includes(t)), `${label}: shows the published script titles`);
  }
  const files = [g.away, g.home].map((c) => (CFB_TEAMS[c]?.l ? `teams/cfb/${CFB_TEAMS[c].e}.webp` : null));
  check(files.every(Boolean), `${label}: both teams (${g.away}, ${g.home}) have a committed CFB logo in the identity map`);
  check(seen.logos.length === 2 && seen.logos.every((l) => l.ok) && seen.textMarks.length === 0, `${label}: two loaded logo marks in the hero, no text initials`);
  check(files.every((f) => f && [...served].some((u) => u.endsWith(`/${f}`))), `${label}: the site served ${files.join(' and ')}`);
}

console.log('\nproduction');
const sha = EXPECT_SHA ? await awaitSha(EXPECT_SHA) : await deployedSha();
console.log(`  deployed build: ${sha ?? '(no version.json)'}${EXPECT_SHA ? ` · expected ${EXPECT_SHA}` : ''}`);
if (EXPECT_SHA) check(sha === EXPECT_SHA, `the deployed build is ${EXPECT_SHA.slice(0, 7)} (got ${sha ?? 'none'})`);

const BROWSERS = [['chromium-phone', chromium, { viewport: { width: 390, height: 844 } }], ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]]
  .filter(([n]) => !process.env.SIFT_BROWSERS || process.env.SIFT_BROWSERS.split(',').some((b) => n.startsWith(b)));
for (const [name, type, device] of BROWSERS) {
  console.log(`\n${name}`);
  const browser = await type.launch();
  const ctx = await browser.newContext(device);
  // SIFT_BRIDGE_RAW=1 (sandboxes whose browser cannot reach raw.githubusercontent.com directly): the browser's
  // live-publication requests are answered by this process's own fetch of the same URL. Still live data.
  if (process.env.SIFT_BRIDGE_RAW === '1') {
    await ctx.route(/^https:\/\/raw\.githubusercontent\.com\//, async (route) => {
      const r = await fetch(route.request().url()).catch(() => null);
      if (!r) return route.abort();
      return route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') ?? 'application/json', 'access-control-allow-origin': '*' } });
    });
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const research = [];
  served.clear();
  page.on('response', (r) => r.ok() && r.url().includes('/teams/cfb/') && served.add(r.url().split('?')[0]));
  page.on('response', (r) => /cfb-edge-finder\/main\/app\/latest\/explorer\/events\//.test(r.url()) && research.push(`${r.status()} ${r.url().split('/').pop()}${r.fromServiceWorker() ? ' (service worker)' : ''}`));
  try {
    // A deep link to each game, then the same games again from the CFB slate (a warm client, service worker
    // installed): the way a returning reader actually arrives.
    for (const [kind, g] of Object.entries(picked)) {
      await page.goto(`${BASE}#/cfb/game/${g.eventId}`);
      judge(`${kind} ${g.gameKey} deep link`, kind, g, await readGame(page));
      if (kind !== NEGATIVE) {
        await page.goto(`${BASE}#/cfb/game/${g.eventId}?tab=script`);
        const s = await readGame(page);
        const chain = await page.locator('.chain > li').count();
        check(s.cards.length === g.scripts.length && chain > 0, `${kind} ${g.gameKey} Scripts tab: the script picker and its causal chain (${s.cards.length} cards, ${chain} steps)`);
        check(!s.empty, `${kind} ${g.gameKey} Scripts tab: no empty state`);
      }
      await page.screenshot({ path: `production-cfb-${name}-${kind.toLowerCase()}.png` });
    }
    for (const [kind, g] of Object.entries(picked)) {
      await page.goto(`${BASE}#/cfb/slate`);
      const link = page.locator(`a[href$="/cfb/game/${g.eventId}"]`).first();
      await link.waitFor({ timeout: 60_000 });
      await link.click();
      judge(`${kind} ${g.gameKey} from the slate`, kind, g, await readGame(page));
    }
    console.log(`  research documents: ${research.slice(0, 12).join(' · ')}`);
    check(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
  } catch (e) {
    check(false, `${name}: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-cfb-${name}-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

if (failures.length) {
  console.error(`\nCFB PRODUCTION CHECK FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nCFB production check OK');
