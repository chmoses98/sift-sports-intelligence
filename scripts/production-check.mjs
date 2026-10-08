// Post-deploy production check: the LIVE site on GitHub Pages, in real Chromium and WebKit, against the
// live quote feed — no fixtures, no mocks. Proves the market clock works where the owner uses it.
// Read-only. Run by .github/workflows/production-check.yml after every deploy (and on demand).
//
// SLATE-AWARE, NOT WEAKER. The target game comes from the canonical NFL publication's own board metadata
// (scripts/live-quotes/slate.mjs, the same rule the feed publisher uses), never from "the first card":
//   CURRENT    a current NFL game exists -> every live-game assertion is strict on THAT event, and the feed must
//              carry it (a current game the feed does not cover is a production failure)
//   OFF_SLATE  no current game and a healthy publication -> live-game assertions are NOT_APPLICABLE; the check
//              proves the off-slate state instead (publication current, feed current and saying NO_CURRENT_GAMES,
//              relay healthy, pages render, historical prices honest)
//   STALE      the publication stopped describing the present -> a production failure
//
// PER SPORT. The feed judges staleness per sport (index.sport_status); so does this check. NFL's feed assertions read
// NFL's own entry and game files. MLB is checked on its own (publication readable as edge_finder.app.v1; when its
// board lists current games, the feed lists MLB and at least one MLB game file quotes the publication's tickers) and
// its failures are reported as "MLB: …": they fail the run without stopping or masking the NFL and NHL checks.
import { chromium, webkit } from '@playwright/test';
import { honestPublicationStates, isEligibleEvent, publicationStatus, selectTarget, sportCoverage, sportEntry, sportGames } from './live-quotes/slate.mjs';

const BASE = process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/';
const NFL_BOARD = process.env.SIFT_NFL_BOARD_URL ?? 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/board.json';
const MLB_BASE = (process.env.SIFT_MLB_BASE_URL ?? 'https://raw.githubusercontent.com/chmoses98/edge-finder-api/main/app/latest').replace(/\/+$/, '');
const FEED = (process.env.SIFT_QUOTE_FEED_URL ?? 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes').replace(/\/+$/, '');
/** The feed publishes every 3 minutes and raw.githubusercontent.com caches up to 5: 15 minutes is several missed cycles. */
const FEED_MAX_AGE_S = 15 * 60;
const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));

// The game's price chip: in "The Lines" on the overview, or (for a game with no priced lines) in the
// Markets tab, whose header always carries it. Both summarise the same game quotes.
const GAME_CHIP = '.gquote .qchip';
async function gameChipReady(page) {
  if (await page.locator(GAME_CHIP).count()) return;
  await page.locator('.gtabs').getByRole('link', { name: 'Markets', exact: true }).click();
  await page.locator(GAME_CHIP).first().waitFor({ timeout: 60_000 });
}
const RELAY = (process.env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const EXPECT_RELAY = process.env.SIFT_EXPECT_RELAY === '1';
const gameUrlOf = (eventId) => `${BASE}#/nfl/game/${encodeURIComponent(eventId)}`;
const ageS = (iso) => Math.round((Date.now() - Date.parse(iso ?? '')) / 1000);

/** A Status diagnostics cell; a row this build does not have reads as such (and fails its check). */
async function diagCell(page, k) {
  const cell = page.locator(`td[data-diag="${k}"]`);
  return (await cell.count()) ? ((await cell.textContent()) ?? '').trim() : `(no "${k}" row)`;
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

/** Relay responses seen by a page; a request the browser itself cancelled (navigation) is not a relay answer. */
function watchRelay(page) {
  const seen = [];
  if (!RELAY) return seen;
  page.on('response', (r) => r.url().startsWith(RELAY) && seen.push(`${r.request().method()} ${r.status()}`));
  page.on('requestfailed', (r) => r.url().startsWith(RELAY) && seen.push(/cancel|abort/i.test(r.failure()?.errorText ?? '') ? `${r.method()} cancelled by the page` : `${r.method()} failed: ${r.failure()?.errorText}`));
  return seen;
}
const answered = (seen) => seen.filter((s) => !s.endsWith('cancelled by the page'));

function watchErrors(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|access control checks|net::ERR/.test(m.text()) && errs.push(m.text()));
  return errs;
}

// Fallback proof, on the live site: force the relay to answer Kalshi's 429 in this browser only, and
// prove the feed answers the quotes (FEED, honest freshness, packet still builds, the 429 named with its status,
// no crash). Then remove the interception and prove LIVE returns in a CLEAN browser context: the 429s this check
// injected put the page's own quote store into rate-limit backoff, and a hash navigation keeps that store, so
// waiting on the same page measured the check's own backoff, not production. Production itself is untouched.
async function fallbackProof(browser, device, name, eventId) {
  console.log(`  -- fallback proof (relay forced to HTTP 429 in this browser; target ${eventId})`);
  const gameUrl = gameUrlOf(eventId);
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  const feed = [];
  page.on('response', (r) => r.url().includes('/live-quotes/') && feed.push(r.status()));
  const forced = [];
  const block = (route) => {
    forced.push(route.request().url());
    return route.fulfill({
      status: 429,
      headers: { 'access-control-allow-origin': ORIGIN, 'access-control-expose-headers': 'X-Sift-Observed-At, Retry-After', 'retry-after': '7', 'content-type': 'application/json' },
      body: '{"error":{"code":"too_many_requests","message":"too many requests (forced by the production check)"}}',
    });
  };
  const diag = (k) => diagCell(page, k);
  try {
    await page.route(`${RELAY}/**`, block);
    await page.goto(gameUrl);
    await page.getByRole('heading', { name: 'What Matters' }).waitFor({ timeout: 60_000 });
    await gameChipReady(page);
    await page.waitForFunction(() => document.querySelector('[data-live-mode]')?.getAttribute('data-live-mode') === 'FEED', null, { timeout: 90_000 }).catch(() => {});
    await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-quote-source') === 'live', GAME_CHIP, { timeout: 60_000 }).catch(() => {});
    const chip = page.locator(GAME_CHIP);
    const state = await chip.getAttribute('data-quote-state');
    console.log(`  forced 429s: ${forced.length} | feed requests: ${feed.length} | prices chip: ${await chip.getAttribute('data-quote-source')} ${state} "${(await chip.textContent())?.trim()}"`);
    check(forced.length > 0, 'fallback: the relay was asked first and answered 429');
    check((await page.locator('[data-live-mode]').getAttribute('data-live-mode')) === 'FEED', 'fallback: mode becomes FEED');
    check(feed.some((s) => s === 200 || s === 304), `fallback: the GitHub quote feed answered (${feed.length} requests)`);
    check((await chip.getAttribute('data-quote-source')) === 'live' && /\d/.test((await chip.textContent()) ?? ''), 'fallback: prices stay visible, from the feed');
    // The feed's quotes carry the time Kalshi answered the publisher (minutes old), so FRESH or AGING is their real age.
    check(['FRESH', 'AGING'].includes(state ?? ''), `fallback: freshness is the feed's real age (got ${state})`);
    await page.goto(BASE + '#/status');
    await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    const reason = await diag('Quote fallback reason');
    console.log(`  status: quotes answered by ${await diag('Quotes answered by')} | mode ${await diag('Mode')} | quote fallback reason: ${reason} | inventory answered by ${await diag('Inventory answered by')}`);
    check((await diag('Quotes answered by')) === 'quote-feed', 'fallback: Status says the quote feed answered the quotes');
    check(/kalshi-relay HTTP 429/.test(reason), `fallback: the relay error is shown with its status code (${reason})`);
    await page.goto(`${BASE}#/packet?sport=nfl&scope=GAME&event=${encodeURIComponent(eventId)}`);
    await page.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 120_000 });
    const verdict = await page.getByRole('region', { name: 'Market refresh preflight' }).getAttribute('data-preflight');
    check(verdict === 'PASS' || verdict === 'PARTIAL', `fallback: the packet preflight still completes (got ${verdict})`);
    check(errs.length === 0, `fallback: no page/console errors, no crash (${errs.slice(0, 3).join(' | ')})`);
    await page.screenshot({ path: `production-${name}-fallback.png` });
  } catch (e) {
    check(false, `${name} fallback proof: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-${name}-fallback-failure.png` }).catch(() => {});
  } finally {
    await page.unroute(`${RELAY}/**`, block).catch(() => {});
    await ctx.close();
  }

  // Restore: interception removed, provider state rebuilt by a real document load in a clean context.
  const rctx = await browser.newContext(device);
  const rpage = await rctx.newPage();
  const relay = watchRelay(rpage);
  const rdiag = (k) => diagCell(rpage, k);
  try {
    await rpage.goto(gameUrl);
    await rpage.getByRole('heading', { name: 'What Matters' }).waitFor({ timeout: 60_000 });
    await rpage.waitForFunction(() => document.querySelector('[data-live-mode]')?.getAttribute('data-live-mode') === 'LIVE', null, { timeout: 60_000 }).catch(() => {});
    const mode = await rpage.locator('[data-live-mode]').getAttribute('data-live-mode');
    console.log(`  restored (clean context): mode ${mode} | relay answers: ${answered(relay).length} [${[...new Set(relay)].join('; ')}]`);
    check(mode === 'LIVE', `restored: mode returns to LIVE when the relay answers (got ${mode})`);
    check(answered(relay).length > 0 && answered(relay).every((r) => r === 'GET 200'), `restored: every relay request answered 200 (${[...new Set(relay)].join('; ')})`);
    await rpage.goto(BASE + '#/status');
    await rpage.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
    console.log(`  restored: quotes answered by ${await rdiag('Quotes answered by')} | mode ${await rdiag('Mode')} | quote fallback reason: ${await rdiag('Quote fallback reason')}`);
    check((await rdiag('Quotes answered by')) === 'kalshi-relay' && (await rdiag('Quote fallback reason')) === '—', 'restored: the relay answers the quotes and no quote fallback is reported');
  } catch (e) {
    check(false, `${name} restore: ${String(e).split('\n')[0]}`);
    await rpage.screenshot({ path: `production-${name}-restore-failure.png` }).catch(() => {});
  } finally {
    await rctx.close();
  }
}

// NHL on the live site: the NHL home (slate rows with every team logo actually loaded), a game from it (the story when
// the publication carries NHL_SCRIPT_V1 — live games keep it frozen at puck drop — or the honest unavailable state),
// and the scorecard. No raw tickers, no "undefined", nothing that reads as a betting verdict. Tolerant of an off day.
async function nhlCheck(page) {
  console.log('  -- NHL');
  await page.goto(BASE + '#/nhl');
  await page.getByRole('heading', { name: 'NHL', level: 1 }).waitFor({ timeout: 60_000 });
  check(true, 'NHL home renders');
  const rows = page.locator('a.nsl__a');
  if (await rows.count()) {
    await page.waitForTimeout(3000);
    const logos = await page.locator('.nsl img.teammark--logo').evaluateAll((els) => els.map((e) => e.complete && e.naturalWidth > 0));
    const n = await rows.count();
    console.log(`  NHL slate: ${n} games, ${logos.filter(Boolean).length}/${logos.length} logos loaded`);
    check(logos.length === 2 * n && logos.every(Boolean), 'NHL slate: both team logos load on every row');
    const home = await page.locator('main').innerText();
    check(!/undefined|NaN/.test(home), 'NHL home shows no undefined / NaN');
    await rows.first().click();
    await page.locator('.game--nhl').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    const story = await page.getByRole('heading', { name: /^How this game is most likely to play/ }).count();
    const scripts = await page.getByRole('heading', { name: /^Game scripts/ }).count();
    const unavailable = await page.getByText(/no game scripts yet|no NHL script layer|script layer failed/i).count();
    const frozen = await page.getByText(/Frozen at puck drop/).count();
    console.log(`  NHL game: story=${story} scripts=${scripts} frozen=${frozen > 0} unavailable-notes=${unavailable} ${page.url().split('#')[1]}`);
    check((story > 0 && scripts > 0) || unavailable > 0, 'NHL game tells the story with its scripts, or says why they are unavailable');
    check(await page.locator('.gh__team img.teammark--logo').count() === 2, 'NHL game hero shows both team logos');
    const text = await page.locator('.game--nhl').innerText();
    check(!/KXNHL/.test(text), 'NHL game shows no raw Kalshi tickers');
    check(!/undefined|NaN/.test(text), 'NHL game shows no undefined / NaN');
    check(!/\block\b|best bet|guaranteed|profitable/i.test(text), 'NHL game carries no betting-verdict language');
  } else {
    console.log('  NHL home lists no game today; game check skipped');
  }
  await page.goto(BASE + '#/nhl/scorecard');
  await page.locator('main').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const sc = await page.locator('main').innerText();
  check(/settled|Learning|learning/.test(sc), 'NHL scorecard renders the learning state');
}

/**
 * MLB, from the data (no browser): the publication resolves as edge_finder.app.v1, and when its board lists current
 * games the feed lists MLB and at least one MLB game file quotes a ticker the publication lists. Every failure is
 * "MLB: …"; an exception here is an MLB failure, never a crash of the NFL/NHL checks.
 */
async function mlbData(index) {
  console.log('\nMLB publication and feed');
  const ok = (cond, msg) => check(cond, `MLB: ${msg}`);
  try {
    const [health, manifest, mboard] = await Promise.all(['health.json', 'manifest.json', 'board.json'].map((f) => getJson(`${MLB_BASE}/${f}`)));
    ok(health?.schema_version === 'edge_finder.app.v1' && health?.sport === 'MLB', `health.json readable as edge_finder.app.v1 (got ${health?.schema_version}, ${health?.sport}, overall ${health?.overall_status})`);
    ok(manifest?.schema_version === 'edge_finder.app.v1' && manifest?.sport === 'MLB', `manifest.json readable as edge_finder.app.v1 (got ${manifest?.schema_version}, run ${manifest?.run_id})`);
    const pub = publicationStatus(mboard, Date.now(), { source: `${MLB_BASE}/board.json` });
    console.log(`  MLB publication: ${pub.status} | generated ${pub.generated_at} (${pub.age_seconds}s old) | ${pub.eligible_games} current event(s)${(manifest?.warnings ?? []).length ? ` | warnings: ${manifest.warnings.join('; ')}` : ''}`);
    const tickers = new Set();
    for (const it of (mboard.items ?? []).filter((x) => isEligibleEvent(x, Date.now()))) {
      const d = await getJson(`${MLB_BASE}/${it.detail_path}`);
      for (const m of d.markets ?? []) if (typeof m.kalshi_ticker === 'string') tickers.add(m.kalshi_ticker);
    }
    const files = new Map();
    const keys = new Set([...tickers].map((t) => t.split('-')[1]));
    for (const g of sportGames(index, 'MLB', keys).slice(0, 8)) {
      try {
        files.set(g.file, await getJson(`${FEED}/${g.file}`));
      } catch (e) {
        console.log(`  MLB feed file ${g.file}: ${String(e)}`);
      }
    }
    const cov = sportCoverage('MLB', pub, index, tickers, files);
    const entry = sportEntry(index, 'MLB');
    console.log(`  MLB in the feed: ${entry ? `${entry.status}${entry.published ? '' : ` (EXCLUDED: ${entry.reason})`}` : 'not listed'} | ${files.size} MLB game file(s) read | ${tickers.size} published ticker(s)`);
    if (cov.mode === 'OFF_SLATE') console.log('  MLB live-quote assertions: NOT_APPLICABLE — no current MLB game on the board');
    for (const p of cov.problems) ok(false, p);
    if (cov.ok && cov.mode === 'CURRENT') ok(true, `the feed carries the current MLB slate (${cov.file})`);
  } catch (e) {
    ok(false, `publication and feed readable (${String(e).split('\n')[0]})`);
  }
}

/** MLB on the live site: home, a game (lines, player props) when the board has one. No raw tickers, no verdicts. */
async function mlbCheck(page) {
  console.log('  -- MLB');
  await page.goto(BASE + '#/mlb');
  await page.getByRole('heading', { name: 'MLB', level: 1 }).waitFor({ timeout: 60_000 });
  check(true, 'MLB: home renders');
  const game = page.locator('a.fcard__a, a.gtile__link').first();
  if (await game.count()) {
    await game.click();
    await page.locator('.game--mlb').waitFor({ timeout: 60_000 });
    await page.locator('.gtabs').getByRole('link', { name: 'Player props', exact: true }).click();
    await page.getByRole('heading', { name: 'Player props', level: 2 }).waitFor({ timeout: 60_000 });
    const text = await page.locator('.game--mlb').innerText();
    console.log(`  MLB game: ${page.url().split('#')[1]}`);
    check(!/KXMLB/.test(text), 'MLB: game shows no raw Kalshi tickers');
    check(!/\bedge\b|\block\b|best bet|guaranteed|profitable/i.test(text), 'MLB: player props carry no edge or betting-verdict language');
  } else {
    console.log('  MLB home lists no game today; game check skipped');
  }
}

// ---------------------------------------------------------------- the slate, from the publication itself
const now = Date.now();
let board = null;
let index = null;
try {
  board = await getJson(NFL_BOARD);
} catch (e) {
  check(false, `NFL canonical publication is readable (${String(e)})`);
}
try {
  index = await getJson(`${FEED}/index.json`);
} catch (e) {
  check(false, `live-quote feed index is reachable (${String(e)})`);
}
const sel = selectTarget(board ?? {}, now, index);
const pub = sel.publication;
console.log(`NFL publication: ${pub.status} | generated ${pub.generated_at} (${pub.age_seconds}s old) | ${pub.eligible_games} current event(s) | latest ${JSON.stringify(pub.latest_event)}`);
for (const r of pub.reasons) console.log(`  reason: ${r}`);
if (pub.stale_events.length) console.log(`  started events still marked upcoming/live: ${pub.stale_events.map((e) => e.event_id).join(', ')}`);
if (index) console.log(`feed: generated ${index.generated_at} (${ageS(index.generated_at)}s old) | status ${index.status ?? '(not declared)'} | ${index.games?.length ?? 0} game file(s) | ${index.errors?.length ?? 0} error(s)`);
console.log(`mode: ${sel.mode}${sel.target ? ` | target ${sel.target.event_id} (${sel.target.status}, ${sel.target.start_time_utc}) | feed ${sel.feed.covered ? `covers it (${sel.feed.key}, ${sel.feed.markets} markets)` : 'does NOT cover it'}` : ''}`);

check(!!board && pub.status !== 'STALE_PUBLICATION', `NFL canonical publication is current (${pub.status}${pub.reasons.length ? `: ${pub.reasons.join('; ')}` : ''})`);
if (index) {
  check(ageS(index.generated_at) <= FEED_MAX_AGE_S, `live-quote feed index is recent (${ageS(index.generated_at)}s old; limit ${FEED_MAX_AGE_S}s)`);
  check((index.errors ?? []).length === 0, `live-quote feed reports no source errors (${(index.errors ?? []).slice(0, 3).join(' | ')})`);
  // NFL's own entry: another sport's games (or its exclusion) never decide NFL's verdict.
  const nfl = sportEntry(index, 'NFL');
  const nflGames = sportGames(index, 'NFL');
  if (index.sport_status) console.log(`feed per sport: ${index.sport_status.map((x) => `${x.sport} ${x.status}${x.published ? '' : ' (EXCLUDED)'}`).join(' | ')}`);
  if (sel.mode === 'CURRENT') check(nfl?.status === 'CURRENT_SLATE' && nfl.published, `feed declares NFL CURRENT_SLATE and publishes it (got ${nfl ? `${nfl.status}${nfl.published ? '' : ', excluded'}` : 'no NFL entry'})`);
  if (sel.mode === 'OFF_SLATE') {
    const nflFiles = index.sport_status ? nflGames.length : (index.games ?? []).length;
    check(nfl?.status === 'NO_CURRENT_GAMES' && nflFiles === 0, `feed explicitly declares NFL NO_CURRENT_GAMES (got ${nfl?.status ?? 'no NFL entry'}, ${nflFiles} NFL game file(s))`);
  }
}
if (sel.mode === 'CURRENT') check(sel.feed.covered, `the feed carries the current game ${sel.target.event_id} with markets (${sel.feed.key ?? 'no file'}, ${sel.feed.markets} markets)`);
await mlbData(index);

// The relay as the browser sees it: Sift's Pages origin, a CORS preflight, then the real GET.
// Logged on every run so a relay failure always says why (the app's fallback hides it from the UI).
if (RELAY) {
  console.log(`relay ${RELAY} (origin ${ORIGIN})`);
  const q = `${RELAY}/markets?series_ticker=KXNFLGAME&status=open&limit=2`;
  for (const [what, init] of [['OPTIONS', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } }], ['GET', { headers: { Origin: ORIGIN } }]]) {
    try {
      const r = await fetch(q, { ...init, signal: AbortSignal.timeout(20_000) });
      const body = what === 'GET' ? (await r.text()).replace(/\s+/g, ' ').slice(0, 300) : '';
      console.log(`  ${what} ${r.status} acao=${r.headers.get('access-control-allow-origin')} observed=${r.headers.get('x-sift-observed-at')} ${body}`);
      if (what === 'GET') check(r.status === 200 && r.headers.get('access-control-allow-origin') === ORIGIN, `relay direct probe answers 200 to this origin (${r.status})`);
    } catch (e) {
      console.log(`  ${what} failed: ${String(e.cause ?? e)}`);
      if (what === 'GET') check(false, `relay direct probe answers 200 to this origin (${String(e.cause ?? e)})`);
    }
  }
}

/** Quote architecture, from the Status diagnostics: which chains production runs (independent of any game). */
async function quoteChain(page) {
  await page.goto(BASE + '#/status');
  await page.getByRole('heading', { name: 'Live market quotes' }).waitFor({ timeout: 60_000 });
  const provider = await diagCell(page, 'Quote provider');
  const invProvider = await diagCell(page, 'Inventory provider');
  console.log(`  quote chain: ${provider}\n  inventory chain: ${invProvider}`);
  if (EXPECT_RELAY) {
    check(/^Kalshi public market data via relay \(.+\), then Sift quote feed/.test(provider), 'quotes: relay first, GitHub quote feed the fallback');
    check(/^Sift quote feed .*, then Kalshi public market data via relay \(.+\)/.test(invProvider), 'inventory: GitHub quote feed first, relay the fallback');
    check(provider.includes(`(${new URL(RELAY).host})`), `the configured relay host is the one Sift calls (${new URL(RELAY).host})`);
  } else {
    check(/Sift quote feed/.test(provider), `quotes: the GitHub quote feed is configured (${provider})`);
  }
  return { provider, invProvider };
}

/** CURRENT: the strict live-game path, on the exact current event. */
async function currentGame(browser, device, name, page, errs) {
  const feed = [];
  page.on('response', (r) => r.url().includes('/live-quotes/') && feed.push(r.status()));
  const relay = watchRelay(page);
  const eventId = sel.target.event_id;
  await page.goto(gameUrlOf(eventId));
  await page.getByRole('heading', { name: 'What Matters' }).waitFor({ timeout: 60_000 });
  check(page.url().includes(`/game/${encodeURIComponent(eventId)}`), `opened the current game itself (${eventId})`);
  await gameChipReady(page);
  // Wait for the game scope's own refresh (inventory + tickers), not just the slate's first quotes.
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-quote-source') === 'live', GAME_CHIP, { timeout: 90_000 }).catch(() => {});
  await page.waitForFunction(() => !!document.querySelector('[data-live-inventory]')?.getAttribute('data-live-inventory'), null, { timeout: 90_000 }).catch(() => {});
  const gameChip = page.locator(GAME_CHIP);
  const src = await gameChip.getAttribute('data-quote-source');
  const state = await gameChip.getAttribute('data-quote-state');
  console.log(`  game prices chip: source=${src} state=${state} "${(await gameChip.textContent())?.trim()}"`);
  check(src === 'live', 'every game price comes from the live market clock');
  check(['FRESH', 'AGING'].includes(state ?? ''), `game quotes are FRESH or AGING (got ${state})`);
  if (!EXPECT_RELAY) check(feed.some((s) => s === 200 || s === 304), `live-quote feed answered (${feed.length} requests)`);
  const mode = await page.locator('[data-live-mode]').getAttribute('data-live-mode');
  console.log(`  live mode: ${mode}`);
  check(['FEED', 'LIVE'].includes(mode ?? ''), `source banner shows live quotes running (got ${mode})`);
  // Which provider chain production runs, and which provider actually answered (Status diagnostics).
  // With the relay configured (repo variable SIFT_QUOTE_RELAY_URL -> SIFT_EXPECT_RELAY=1) the chain must be
  // relay first, GitHub quote feed as fallback, and the relay must be the one answering.
  await quoteChain(page);
  const diag = (k) => diagCell(page, k);
  const answeredBy = await diag('Quotes answered by');
  const diagMode = await diag('Mode');
  const invAnswered = await diag('Inventory answered by');
  const invFallback = await diag('Inventory fallback reason');
  console.log(`  quotes answered by: ${answeredBy} | mode: ${diagMode}`);
  console.log(`  inventory answered by: ${invAnswered} | inventory fallback reason: ${invFallback}`);
  if (RELAY) console.log(`  relay requests from the page: ${relay.length} [${[...new Set(relay)].slice(0, 6).join('; ')}]`);
  if (EXPECT_RELAY) {
    const fallback = await diag('Quote fallback reason');
    console.log(`  quote fallback reason: ${fallback} | feed requests (inventory): ${feed.length}`);
    check(invAnswered === 'quote-feed' || (invAnswered === 'kalshi-relay' && invFallback.startsWith('quote-feed')), `inventory came from the feed, or from the relay after the feed was asked first (${invAnswered}; ${invFallback})`);
    check(answeredBy === 'kalshi-relay', `live quotes answered by kalshi-relay (got ${answeredBy})`);
    check(diagMode === 'LIVE', `market clock mode LIVE (got ${diagMode})`);
    check(state === 'FRESH', `current game prices are FRESH (got ${state})`);
    check(answered(relay).length > 0 && answered(relay).every((r) => r === 'GET 200'), `every relay request on the main path answered 200 (${answered(relay).length}: ${[...new Set(relay)].join('; ')})`);
    check(fallback === '—', `no quote fallback to the feed on the main path (quote fallback reason ${fallback})`);
  }
  await page.goto(`${BASE}#/packet?sport=nfl&scope=GAME&event=${encodeURIComponent(eventId)}`);
  await page.getByRole('button', { name: 'COPY FOR CHATGPT' }).waitFor({ timeout: 120_000 });
  const pf = page.getByRole('region', { name: 'Market refresh preflight' });
  const verdict = await pf.getAttribute('data-preflight');
  console.log(`  preflight: ${verdict} | ${(await pf.textContent())?.replace(/\s+/g, ' ').slice(0, 220)}`);
  if (EXPECT_RELAY) check(verdict === 'PASS', `packet preflight PASS through the relay (got ${verdict})`);
  else check(verdict === 'PASS' || verdict === 'PARTIAL', `packet preflight refreshed the game's markets (got ${verdict})`);
  await page.screenshot({ path: `production-${name}-packet.png` });
  check(errs.length === 0, `no page/console errors (${errs.slice(0, 3).join(' | ')})`);
  // Only against a game the feed carries: forcing the relay down for a game the fallback cannot answer proves nothing.
  if (RELAY && sel.feed.covered) await fallbackProof(browser, device, name, eventId);
}

/** OFF_SLATE (and STALE, for diagnostics): no game is treated as live; what must hold anyway is proved. */
async function offSlate(name, page, errs) {
  await page.goto(BASE + '#/nfl');
  await page.locator('.gcard__link').first().waitFor({ timeout: 60_000 });
  check(true, 'NFL page renders');
  await quoteChain(page);
  if (sel.historical) {
    // A historical game's price is never demanded FRESH. Where it comes from the publication capture (no live
    // observation), it can be no younger than the board that carried it.
    await page.goto(gameUrlOf(sel.historical.event_id));
    await page.getByRole('heading', { name: 'What Matters' }).waitFor({ timeout: 60_000 });
    await gameChipReady(page);
    const chip = page.locator(GAME_CHIP);
    const src = await chip.getAttribute('data-quote-source');
    const state = await chip.getAttribute('data-quote-state');
    console.log(`  historical ${sel.historical.event_id} (${sel.historical.status}, ${sel.historical.start_time_utc}): prices chip source=${src} state=${state} "${(await chip.textContent())?.trim()}"`);
    const allowed = src === 'publication' ? honestPublicationStates(board?.generated_at, Date.now()) : ['FRESH', 'AGING', 'STALE', 'UNKNOWN'];
    check(allowed.includes(state ?? ''), `historical game prices are labelled honestly (${src} ${state}; allowed ${allowed.join('/')})`);
  }
  await page.screenshot({ path: `production-${name}-offslate.png` });
  check(errs.length === 0, `no page/console errors (${errs.slice(0, 3).join(' | ')})`);
  console.log(`  live-game quote assertions: NOT_APPLICABLE — ${sel.mode === 'STALE' ? 'the NFL publication is stale (failed above)' : 'no current NFL game'}`);
}

// Typography and the NFL home on the live site: Barlow is the face actually rendering (no retired face loads), the NFL
// home's Slate Priorities rail is there (beside the featured game on desktop, before it on phones) and every item
// opens a real page, the script titles are the plain-English ones, and every sport page renders — no error screen.
// Screenshots of each, for review (uploaded with the run).
// Game heroes (src/lib/hero): the live site shows each game's HOME team identity — the Saints at the Superdome are a
// Saints home game, never Super Bowl LIX — neutral sites show nobody at home, every served hero photo loads, and the
// retired venue-only photo set (/stadiums/) is never requested.
async function heroCheck(page, name) {
  const retired = [];
  const onReq = (r) => r.url().includes('/stadiums/') && retired.push(r.url());
  page.on('request', onReq);
  await page.goto(BASE + '#/design/heroes');
  await page.locator('.hg__item').first().waitFor({ timeout: 60_000 });
  const saints = page.locator('.hg__item').filter({ hasText: 'Saints at the Superdome' }).locator('header.gh');
  check(await saints.getAttribute('data-hero-team') === 'NO', `${name}: Saints at the Superdome resolves to the Saints' identity`);
  check(/Saints home game/i.test((await saints.locator('[data-hero-label]').textContent()) ?? ''), `${name}: the Saints hero says "Saints home game"`);
  const london = page.locator('.hg__item').filter({ hasText: 'International: Colts vs Commanders' }).locator('header.gh');
  check(await london.getAttribute('data-hero-context') === 'neutral' && await london.getAttribute('data-hero-team') === '', `${name}: an international neutral site shows nobody at home`);
  const bruins = page.locator('.hg__item').filter({ hasText: 'Bruins at TD Garden' }).locator('header.gh');
  check(await bruins.getAttribute('data-hero-team') === 'BOS' && !(await bruins.getAttribute('data-hero-photo') ?? '').startsWith('nba-'), `${name}: a shared arena shows the hockey tenant (Bruins, never the Celtics)`);
  for (const sport of ['NFL', 'MLB', 'NHL', 'CFB', 'CBB']) {
    await page.goto(`${BASE}#/design/heroes?sport=${sport}&only=photo`);
    await page.locator('.page.heroes-gallery').waitFor({ timeout: 60_000 });
    const heroes = await page.locator('header.gh[data-hero-kind="photo"]').all();
    let loaded = 0;
    for (const h of heroes) {
      await h.scrollIntoViewIfNeeded();
      const ok = await h.locator('.hart__photo').evaluate((i) => new Promise((res) => { const t = Date.now(); const tick = () => (i.complete && i.naturalWidth > 0 ? res(true) : Date.now() - t > 20000 ? res(false) : setTimeout(tick, 200)); tick(); })).catch(() => false);
      if (ok) loaded++; else console.log(`  hero photo did not load: ${await h.getAttribute('data-hero-photo')}`);
    }
    check(loaded === heroes.length, `${name}: ${sport}: every hero photo loads (${loaded}/${heroes.length})`);
  }
  if (sel?.target?.event_id) {
    await page.goto(gameUrlOf(sel.target.event_id));
    const hero = page.locator('header.gh');
    await hero.waitFor({ timeout: 60_000 });
    const ctx = await hero.getAttribute('data-hero-context');
    const team = await hero.getAttribute('data-hero-team');
    const home = sel.target.participants?.find((p) => p.participant_id === sel.target.home_participant)?.short_name;
    console.log(`  NFL game hero: context=${ctx} team=${team} photo=${await hero.getAttribute('data-hero-photo') || '—'} reason=${await hero.getAttribute('data-hero-reason')}`);
    check(ctx === 'neutral' || ctx === 'matchup' || !home || team === home || (home === 'LA' && team === 'LA'), `${name}: the NFL game hero shows its home team (${home}) or nobody at a neutral site (got ${ctx}/${team})`);
  }
  page.off('request', onReq);
  check(retired.length === 0, `${name}: no retired venue-only photo requested (${retired.slice(0, 2).join(', ')})`);
}

async function designCheck(browser, device, name) {
  console.log('  -- Barlow + NFL home + every sport page');
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const fonts = () => page.evaluate(async () => {
    await document.fonts.ready;
    return { body: getComputedStyle(document.body).fontFamily, loaded: [...new Set([...document.fonts].filter((x) => x.status === 'loaded').map((x) => `${x.family.replace(/"/g, '')} ${x.weight}`))] };
  });
  try {
    await page.goto(BASE + '#/');
    await page.getByRole('heading', { name: 'Today on Sift' }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    const f = await fonts();
    console.log(`  fonts: body ${f.body.split(',')[0]} · loaded ${f.loaded.join(', ')}`);
    check(/^"?Barlow"?,/.test(f.body) && f.loaded.some((x) => x.startsWith('Barlow ')), 'Barlow is the rendering typeface');
    check(!f.loaded.some((x) => /Instrument|Roboto/.test(x)), 'no retired typeface loads');
    await page.screenshot({ path: `production-${name}-home.png` });

    await page.goto(BASE + '#/nfl');
    const rail = page.getByRole('region', { name: 'Where to look first' });
    await rail.waitFor({ timeout: 60_000 });
    await rail.locator('.prio__l').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    const railText = (await rail.innerText()).replace(/\s+/g, ' ');
    console.log(`  NFL rail: ${railText.slice(0, 600)}`);
    check(/Top SIFT edge/i.test(railText), 'NFL Slate Priorities: the Top SIFT Edge section is present (an edge, or plainly none)');
    const items = await rail.locator('a.prio__a').count();
    check(items <= 5, `NFL Slate Priorities: ${items} linked items (at most 5)`);
    // The multi-script section says what the data supports: the four scripts are final-margin buckets and a
    // moneyline or spread wins in at most two of them, so the label is "Works in multiple scripts", never the
    // retired "Holds up across scripts" or any "most scripts" claim. The section is omitted when nothing qualifies.
    check(!/holds up|across scripts|most scripts|survives most/i.test(railText), 'NFL Slate Priorities: the retired "Holds up across scripts" wording is absent');
    const holds = rail.locator('.prio__i--holds');
    if (await holds.count()) {
      const ht = (await holds.innerText()).replace(/\s+/g, ' ');
      check(/works in multiple scripts/i.test(ht), 'NFL Slate Priorities: the multi-script section is labelled "Works in multiple scripts"');
      if (await holds.locator('a.prio__a').count()) check(/Supported in \d of the 4 modeled outcome scripts/.test(ht), `NFL Slate Priorities: the pick states its exact script count ("${ht.slice(0, 160)}")`);
    } else console.log('  NFL rail: no multi-script pick this run (section omitted: nothing qualifies) — label check NOT_APPLICABLE');
    const main = await page.locator('main').innerText();
    check(!/going away|One-score battle/i.test(main), 'NFL home: script titles are plain English');
    check(!/undefined|NaN/.test(main), 'NFL home shows no undefined / NaN');
    const feat = page.locator('.shome__feat');
    if (await feat.count()) {
      const r = await rail.boundingBox();
      const b = await feat.boundingBox();
      if (device.viewport.width >= 1100) check(r.x > b.x + b.width && Math.abs(r.y - b.y) < 2, 'NFL desktop: the rail sits beside the featured game (no empty right side)');
      else check(r.y < b.y, 'NFL phone: the rail comes before the featured game');
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'NFL home: no sideways scroll');
    await page.screenshot({ path: `production-${name}-nfl.png` });
    await rail.screenshot({ path: `production-${name}-nfl-rail.png` });
    const tiles = page.locator('.gtiles');
    if (await tiles.count()) {
      await tiles.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `production-${name}-nfl-tiles.png` });
    }
    if (items) {
      await rail.locator('a.prio__a').first().click();
      await page.waitForURL(/#\/nfl\/(game|market)\//, { timeout: 30_000 });
      check(true, `NFL Slate Priorities: the first item opens ${page.url().split('#')[1]}`);
      await page.goBack();
      await rail.waitFor({ timeout: 30_000 });
      check(true, 'NFL Slate Priorities: Back returns to the NFL home');
    }

    for (const [slug, label] of [['cfb', 'CFB'], ['nhl', 'NHL'], ['cbb', 'CBB'], ['mlb', 'MLB'], ['soccer', 'Soccer'], ['tennis', 'Tennis']]) {
      await page.goto(BASE + `#/${slug}`);
      await page.locator('main h1').first().waitFor({ timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const body = await page.locator('body').innerText();
      check(!/Unexpected Application Error|Cannot read properties/.test(body) && (await page.locator('main h1').count()) > 0, `${label} page renders (no error screen)`);
      check(/^"?Barlow"?,/.test(await page.evaluate(() => getComputedStyle(document.querySelector('main') ?? document.body).fontFamily)), `${label} page is set in Barlow`);
      if (slug === 'cfb' || slug === 'nhl') await page.screenshot({ path: `production-${name}-${slug}.png` });
    }
  } catch (e) {
    check(false, `design: ${name}: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-${name}-design-failure.png` }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

for (const [name, type, device] of [['chromium-phone', chromium, { viewport: { width: 390, height: 844 } }], ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]]) {
  console.log(`\n${name}`);
  const browser = await type.launch();
  const page = await (await browser.newContext(device)).newPage();
  const errs = watchErrors(page);
  try {
    await page.goto(BASE + '#/');
    await page.getByRole('heading', { name: 'Today on Sift' }).waitFor({ timeout: 60_000 });
    check(true, 'home renders');
    if (sel.mode === 'CURRENT') await currentGame(browser, device, name, page, errs);
    else await offSlate(name, page, errs);
    // NHL rides along on every run: its own pages, errors counted separately from the NFL path above.
    const before = errs.length;
    await nhlCheck(page);
    check(errs.length === before, `NHL pages: no page/console errors (${errs.slice(before, before + 3).join(' | ')})`);
    // MLB too, in its own try: an MLB page failure is reported as MLB and never skips what follows.
    const mlbBefore = errs.length;
    try {
      await mlbCheck(page);
    } catch (e) {
      check(false, `MLB: ${name}: ${String(e).split('\n')[0]}`);
      await page.screenshot({ path: `production-${name}-mlb-failure.png` }).catch(() => {});
    }
    check(errs.length === mlbBefore, `MLB: pages show no page/console errors (${errs.slice(mlbBefore, mlbBefore + 3).join(' | ')})`);
    await designCheck(browser, device, name);
    try {
      await heroCheck(page, name);
    } catch (e) {
      check(false, `heroes: ${name}: ${String(e).split('\n')[0]}`);
      await page.screenshot({ path: `production-${name}-heroes-failure.png` }).catch(() => {});
    }
  } catch (e) {
    check(false, `${name}: ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: `production-${name}-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}
// Desktop: the NFL home's composition (rail beside the featured game) only exists at desktop widths.
{
  console.log('\nchromium-desktop');
  const browser = await chromium.launch();
  try {
    await designCheck(browser, { viewport: { width: 1440, height: 900 } }, 'chromium-desktop');
  } finally {
    await browser.close();
  }
}
console.log(`\nslate mode: ${sel.mode}${sel.mode === 'OFF_SLATE' ? ' (live-game quote assertions NOT_APPLICABLE — no current NFL game)' : ''}`);
if (failures.length) {
  console.error(`\nPRODUCTION CHECK FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nproduction check OK');
