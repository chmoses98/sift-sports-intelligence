// Post-deploy production check of the NFL projection distribution on the LIVE site: no fixtures, no mocks. For the promoted NFL
// families (receptions, completions) it opens the real Player Prop Explorer from the game's Player Snapshot, in Chromium desktop and
// WebKit iPhone, and proves that the drawn distribution, the expected value, the ranges, the probability of the over and the single
// "Projected <stat>" value all come from the one published projection (feed + distribution artifact read here straight from the
// publication), with no development vocabulary and no horizontal overflow. Read-only, one short pass per device (it is a step of
// production-check.yml, not a second acceptance suite).
//
// Schedule-aware (scripts/nfl-distribution-plan.mjs): the players come from the publication (the current game's two highest expected
// values per family), and with no current game, or none the feed covers, the check says N/A with the reason instead of failing.
//
//   node scripts/nfl-distribution-production-check.mjs [--game EVENT_ID] [--no-webkit]
//
// Env: SIFT_URL (default production), SIFT_NFL_BOARD_URL, SIFT_PROJECTIONS_BASE.
import { chromium, webkit } from '@playwright/test';
import { distributionPlan } from './nfl-distribution-plan.mjs';

const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const BOARD = process.env.SIFT_NFL_BOARD_URL ?? 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/board.json';
const PUB = (process.env.SIFT_PROJECTIONS_BASE ?? 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/projection-data/projections/nfl').replace(/\/+$/, '');
const BANNED = /\bshadow\b|incumbent|challenger|research arm|simulation mean|P\(over\)|legacy (model|projection)/i;
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : null; };

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));
const pct = (p) => `${Math.round(p * 100)}%`;
const getJson = async (url) => { const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

async function publication() {
  const [feed, art] = await Promise.all([getJson(`${PUB}/latest.json`), getJson(`${PUB}/distributions/latest.json`).catch(() => null)]);
  return { feed, art, rows: new Map((art?.rows ?? []).map((r) => [`${r.game_id}|${r.player_id}|${r.family}`, r])) };
}

async function plannedGame() {
  const forced = argOf('game');
  const board = await getJson(BOARD);
  const items = forced ? board.items.filter((i) => i.event_id === forced) : board.items;
  return items;
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function explorerCheck(browser, device, deviceName, eventId, pub, t) {
  const tag = `${deviceName} ${t.name} ${t.family}`;
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  try {
    await page.goto(`${BASE}#/design/sift2/nfl/game/${encodeURIComponent(eventId)}?tab=props`, { waitUntil: 'domcontentloaded' });
    const snap = page.locator('.s2-player-explorer');
    await snap.waitFor({ timeout: 60_000 });
    // The Snapshot lists the players Kalshi prices. It must list some (an empty Snapshot beside published projections is broken); a player it
    // does not list is simply not offered today (N/A for that player, never a pass).
    await snap.locator('.s2-player').first().waitFor({ timeout: 45_000 }).catch(() => {});
    const listed = await snap.locator('.s2-player').count();
    check(listed > 0, `${tag}: the Player Snapshot lists players (${listed})`);
    if (!listed) return;
    await snap.getByRole('searchbox').fill(t.name.split(' ').filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w)).pop());
    await page.waitForTimeout(500);
    const card = snap.locator('.s2-player', { hasText: t.name });
    if (!(await card.count())) { console.log(`  N/A  ${tag}: the Snapshot does not list ${t.name} today`); return; }
    const link = card.first().locator('.s2-player__markets > a', { has: page.getByText(t.label, { exact: true }) }).first();
    if (await link.count()) {
      check(true, `${tag}: the Player Snapshot offers ${t.label}`);
      await link.click();
    } else {
      // Kalshi lists no completions market for the quarterback, so the Snapshot has no such tile: open the Explorer on the same
      // player and stat through its own address (the player id is read from the player's own Snapshot link).
      const href = await card.first().locator('.s2-player__markets > a').first().getAttribute('href');
      const player = new URL(href.replace(/^#/, 'https://x'), 'https://x').searchParams.get('player');
      check(!!player, `${tag}: the Snapshot has no ${t.label} tile; opening the Explorer by address (player ${player})`);
      if (!player) return;
      // a hash-only change within the loaded app: navigate in-page (a second page.goto to the same document can stall in WebKit)
      await page.evaluate((h) => { location.hash = h; }, `#/design/sift2/nfl/props?game=${encodeURIComponent(eventId)}&player=${encodeURIComponent(player)}&stat=${t.family}`);
    }
    await page.locator('#pexa-t').waitFor({ timeout: 60_000 });
    check((await page.locator('#pexa-t').innerText()).includes(t.name), `${tag}: the Explorer opens on the player`);
    const pubRow = t.row;
    const dist = t.dist;
    check(!!pubRow && !!dist, `${tag}: published row and distribution exist (mean ${pubRow?.mean})`);
    if (!pubRow || !dist) return;
    const legend = (label) => page.locator('.fr-legend > div', { has: page.getByText(label, { exact: true }) }).first();
    await legend('Expected value').waitFor({ timeout: 60_000 });
    const q = dist.quantiles;
    const text = async (label) => (await legend(label).innerText()).replace(/\s+/g, ' ');
    check((await text('Expected value')).includes(pubRow.mean.toFixed(1)), `${tag}: expected value ${pubRow.mean.toFixed(1)} is the published mean`);
    check((await text('Median')).includes(String(q.p50)), `${tag}: median ${q.p50}`);
    check((await text('Middle 50%')).includes(`${q.p25}–${q.p75}`), `${tag}: middle 50% ${q.p25}–${q.p75}`);
    check((await text('Prediction range (80%)')).includes(`${q.p10}–${q.p90}`), `${tag}: prediction range (80%) ${q.p10}–${q.p90}`);
    check((await text('90% range')).includes(`${q.p05}–${q.p95}`), `${tag}: 90% range ${q.p05}–${q.p95}`);
    const tile = page.locator('.fr-tile', { has: page.getByText(`Projected ${t.family.replace('_', ' ')}`, { exact: true }) });
    check((await tile.count()) === 1 && (await tile.first().innerText()).includes(pubRow.mean.toFixed(1)), `${tag}: one "Projected ${t.family}" value, ${pubRow.mean.toFixed(1)}`);
    check((await page.locator('.frd').count()) > 0 && (await page.locator('.frd--none').count()) === 0, `${tag}: the distribution chart is drawn`);
    check(/7 published quantiles/.test(await page.locator('.frd__cap').first().innerText()), `${tag}: the chart is of the 7 published quantiles`);
    const lineTxt = (await legend('Market line').locator('dd').innerText().catch(() => '')).trim();
    const line = Number(lineTxt);
    if (lineTxt !== '' && Number.isFinite(line)) {
      const p = dist.survival[String(Math.ceil(line))];
      check(p !== undefined && (await text('Probability of over')).includes(pct(p)), `${tag}: probability of over ${lineTxt} is the published P(X≥${Math.ceil(line)}) = ${p === undefined ? 'n/a' : pct(p)}`);
    } else console.log(`  n/a  ${tag}: no market line listed (probability of over not shown)`);
    const body = await page.locator('body').innerText();
    check(!BANNED.test(body), `${tag}: no development vocabulary${BANNED.test(body) ? ` (${body.match(BANNED)?.[0]})` : ''}`);
    check((await overflow(page)) <= 1, `${tag}: no horizontal overflow`);
    check(errs.length === 0, `${tag}: no page errors${errs.length ? ` (${errs[0]})` : ''}`);
    await page.screenshot({ path: `production-nfl-dist-${deviceName}-${t.family}-${t.name.split(' ').pop()}.png` });
  } catch (e) {
    check(false, `${tag}: ${String(e.message).split('\n')[0]}`);
  } finally { await ctx.close(); }
}

let pub = await publication();
const items = await plannedGame();
let plan = distributionPlan({ items, feed: pub.feed, art: pub.art, now: Date.now() });
if (plan.mode === 'CHECK' && plan.problems.some((x) => /describes the feed of/.test(x))) {
  // the feed and the artifact are committed by the same run a few seconds apart: give a publication in progress one minute to settle
  console.log('  the artifact describes another feed generation; waiting 60 s for a publication in progress');
  await new Promise((r) => setTimeout(r, 60_000));
  pub = await publication();
  plan = distributionPlan({ items, feed: pub.feed, art: pub.art, now: Date.now() });
}
console.log(`feed ${pub.feed?.generated_utc}, ${pub.feed?.players?.length ?? 0} players; artifact ${pub.art ? `${pub.art.rows?.length ?? 0} distributions (${pub.art.excluded?.length ?? 0} excluded)` : 'MISSING'}; game ${plan.game?.event_id ?? 'none'}`);
for (const n of plan.notes) console.log(`  note ${n}`);
if (plan.mode === 'NOT_APPLICABLE') {
  console.log(`  N/A  NFL distribution in the live Explorer (${plan.reason})`);
  process.exit(0);
}
for (const x of plan.problems) check(false, `publication: ${x}`);
check(plan.problems.length === 0, 'the distribution artifact describes the current feed and accounts for every promoted-family row');
const eventId = plan.game.event_id;
const devices = [['chromium-desktop', chromium, { viewport: { width: 1280, height: 900 } }]];
if (!argv.includes('--no-webkit')) devices.push(['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]);
else devices.push(['chromium-phone', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]);
for (const [name, type, device] of devices) {
  console.log(`\n== ${name}`);
  const browser = await type.launch(process.env.SIFT_CHROMIUM_ARGS ? { args: JSON.parse(process.env.SIFT_CHROMIUM_ARGS) } : {});
  try { for (const t of plan.targets) await explorerCheck(browser, device, name, eventId, pub, t); } finally { await browser.close(); }
}
if (failures.length) { console.log(`\n${failures.length} FAILED:`); failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
console.log('\nAll NFL distribution production checks passed.');
