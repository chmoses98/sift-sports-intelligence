// Post-deploy production check of SIFT v4 early access on the LIVE site: no fixtures, no mocks, real published data and the real quote
// feed. Read-only against SIFT's sources (a "save" only writes the fresh browser profile's own device storage). Chromium phone and WebKit
// iPhone each walk the journey:
//
//   SIFT 2.0 is still the default -> #/v4 chooses nothing and installs as "SIFT v4" -> Home -> Games -> Game -> Props -> player ->
//   Research -> Save (YES and NO are different items) -> Board (note, remove, Undo, revisit the research on the saved side) ->
//   the SAME saved research on the SIFT 2.0 Board, with a pre-v4 save (no side, with a note) untouched throughout.
//
// What it proves besides the journey: games in play show what the score provider (SportScore, NBA) really says, or say the score is unavailable; the price age the Game page shows matches the quote
// feed's own observation time; missing data is said, never NaN/undefined/zero; no development vocabulary; no horizontal overflow; no page
// errors. Chromium also does a returning visit with the service worker, offline. Schedule-aware: a part that cannot apply today (no props
// priced, no game in play) prints N/A with the reason, never a pass.
//
//   node scripts/v4-production-check.mjs [--no-webkit]
//
// Env: SIFT_URL (default production), SIFT_EXPECT_SHA (the deployed commit, checked against version.json), SIFT_FEED_URL,
// SIFT_V4_PAUSED=1 (the repository variable SIFT_V4 is "off": check only that v4 says it is paused and SIFT 2.0 is untouched).
import { chromium, webkit } from '@playwright/test';
import { sha256 } from '@noble/hashes/sha2.js';
import { findProviderGame, judgeGamePage, judgeRow, providerNba } from './live-score-expect.mjs';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const FEED = (process.env.SIFT_FEED_URL ?? 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes').replace(/\/+$/, '');
// Development vocabulary the NFL surfaces never show (the repo's own list, applied to the NFL player page only: "ATP Challenger" is a real tennis
// tour on the cross-sport Signals page), and betting authority no screen may claim (applied everywhere).
const DEV_WORDS = /\bshadow\b|incumbent|challenger|research arm|simulation mean|P\(over\)|legacy (model|projection)/i;
const AUTHORITY = /best bet|guaranteed|recommended bet|sure thing|\block\b/i;
const MISSING = /\bNaN\b|\bundefined\b|\[object|\bInfinity\b/;
const TRAY_KEY = 'sift.researchTray.v1';
const argv = process.argv.slice(2);

const failures = [];
const check = (ok, msg) => (ok ? console.log(`  ok   ${msg}`) : (failures.push(msg), console.log(`  FAIL ${msg}`)));
const na = (msg) => console.log(`  N/A  ${msg}`);
const first = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200);

// The deterministic tray item id (src/contract/ids.ts), so a pre-v4 save can be built exactly as SIFT 2.0 wrote it.
const enc = new TextEncoder();
const trayItemId = (kind, id) => {
  let m = 'edge_finder.app.v1/ids|edge_finder.app.v1|';
  for (const p of ['tray', kind, id, null]) { const t = p == null ? '' : String(p); m += `${enc.encode(t).length}:${t}`; }
  return `try_${[...sha256(enc.encode(m))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20)}`;
};

const getJson = async (url) => { const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
/** SportScore's NBA games for today and yesterday (UTC), straight from the provider the app reads: the same URL, the same competition filter. [] when it cannot be read. */
async function fetchProviderNba() {
  const games = [];
  let ok = false;
  for (const d of [0, -1]) {
    const day = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    try { games.push(...providerNba(await getJson(`https://sportscore.com/api/v1/fixtures/?sport=basketball&date=${day}&limit=200&src=sift-personal`))); ok = true; } catch (e) { console.log(`  (SportScore ${day}: ${first(e)})`); }
  }
  return { games, ok };
}
/** The Live tab as a user sees it: the score card's fields, the SportScore credit, and whether the page says the score is unavailable. */
const readLivePage = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-live-score]');
  const kv = (k) => [...(c?.querySelectorAll('.v4-kv') ?? [])].find((e) => e.querySelector('.v4-kv__k')?.textContent.trim().startsWith(k))?.querySelector('.v4-kv__v')?.textContent.replace(/\s+/g, ' ').trim() ?? null;
  const visible = (a) => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  return {
    mode: c?.getAttribute('data-live-score') ?? null,
    heading: c?.querySelector('h3')?.textContent ?? null,
    score: kv('Score'), period: kv('Period'), status: kv('Status'), source: kv('Source'),
    credit: [...document.querySelectorAll('a[href^="https://sportscore.com"]')].some((a) => /Powered by SportScore/.test(a.textContent ?? '') && /dofollow/.test(a.rel) && visible(a)),
    unavailableTitle: /score unavailable|clock and plays are unavailable/i.test(document.querySelector('main')?.innerText ?? ''),
  };
});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tray = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), TRAY_KEY);
const settled = (page) => page.waitForFunction(() => document.querySelector('[data-v4-shell]') && !document.querySelector('.v4-skel, [aria-label^="Loading"]'), null, { timeout: 60_000 });

async function newPage(browser, device, seed) {
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  if (seed) await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [TRAY_KEY, JSON.stringify(seed)]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(first(e)));
  return { ctx, page, errs };
}

/** A save as SIFT 2.0 wrote it before sides existed: a game, a note typed on the Board, no `side` anywhere. */
function legacySave(game) {
  const itemId = trayItemId('EVENT', game.id);
  const item = { item_id: itemId, ref_kind: 'EVENT', sport: game.sport, id: game.id, extra: null, note: '  from SIFT 2.0, before v4  ', added_at: '2026-10-01T15:00:00Z' };
  const label = { label: game.title, href: `/${game.slug}/game/${game.id}`, kickoff: game.kickoff, savedAt: '2026-10-01T15:00:00Z' };
  return { item, label, doc: { tray: { schema_version: 'edge_finder.app.v1', kind: 'research_tray', tray_version: '1.0.0', items: [item], updated_at: '2026-10-01T15:00:00Z' }, labels: { [itemId]: label } } };
}


/**
 * The price age a screen shows must match the quote feed's own observation time (read here straight from the feed, not from the app).
 * The first paint of a game or player shows the publication's older snapshot, labelled stale, until the live feed answers, so wait for a
 * current label before comparing. If the feed itself is old (an outage), say N/A: that is the feed's state, not the screen's.
 */
async function priceAgeMatchesFeed(page, eventId, where, tag, read) {
  const idx = await getJson(`${FEED}/index.json`).catch(() => null);
  const g = idx?.games?.find((x) => x.event_ids.includes(eventId));
  if (!g) return na(tag(`${where}: the quote feed has no entry for this game to compare the price age with`));
  const feedAge = (Date.now() - Date.parse(g.observed_to)) / 60_000;
  const readText = () => page.evaluate(read, null);
  // "Current" alone is not the live answer: the publication's own snapshot is labelled aging (not stale) for its first 30 minutes,
  // so a screen still showing it would pass that wait and then be compared too early. Wait for the age the feed itself implies
  // (same tolerance as the assertion below), so a live answer that never arrives still fails the unchanged comparison.
  await page.waitForFunction(([src, to]) => { const r = new Function(`return (${src})()`)(); return r.current && r.minutes != null && Math.abs(r.minutes - (Date.now() - to) / 60_000) <= 6; }, [read.toString(), Date.parse(g.observed_to)], { timeout: 30_000 }).catch(() => {});
  const r = await readText();
  if (feedAge > 12) return na(tag(`${where}: the quote feed is itself ${feedAge.toFixed(0)} min old; the screen cannot be fresher`));
  check(r.current && r.minutes != null && Math.abs(r.minutes - feedAge) <= 6, tag(`${where}: the price age shown (${r.text || 'none'}) matches the quote feed's own observation time (${feedAge.toFixed(1)} min ago, within 6)`));
}
const gameAgeReader = () => {
  const t = document.querySelector('.v4-gstat')?.innerText ?? '';
  const m = /Prices (live|aging|stale) · (.+)/.exec(t);
  const age = m?.[2] ?? '';
  const mins = /just now/.test(age) ? 0 : (() => { const d = /(\d+)d ago/.exec(age); if (d) return +d[1] * 1440; const hm = /(\d+)h (\d+)m ago/.exec(age); if (hm) return +hm[1] * 60 + +hm[2]; const x = /(\d+)m ago/.exec(age); if (x) return +x[1]; const y = /(\d+)s ago/.exec(age); return y ? +y[1] / 60 : null; })();
  return { current: !!m && m[1] !== 'stale', minutes: mins, text: m ? `${m[1]} · ${age}` : t.replace(/\s+/g, ' ').slice(0, 40) };
};
const ladderAgeReader = () => {
  const t = document.querySelector('.v4-lad')?.innerText ?? '';
  const m = /Kalshi quote (?!stale)(just now|\d+s ago|\d+m ago|\d+h \d+m ago|\d+d ago)/.exec(t);
  const age = m?.[1] ?? '';
  const mins = /just now/.test(age) ? 0 : (() => { const d = /(\d+)d ago/.exec(age); if (d) return +d[1] * 1440; const hm = /(\d+)h (\d+)m ago/.exec(age); if (hm) return +hm[1] * 60 + +hm[2]; const x = /(\d+)m ago/.exec(age); if (x) return +x[1]; const y = /(\d+)s ago/.exec(age); return y ? +y[1] / 60 : null; })();
  return { current: !!m, minutes: mins, text: m ? m[0] : (/Kalshi quote stale[^:]*/.exec(t)?.[0] ?? 'no quote line') };
};

// ------------------------------------------------------------------ deployed build

async function deployment() {
  console.log('\n== deployed build');
  try {
    const v = await getJson(`${BASE}version.json`);
    console.log(`  deployed ${String(v.sha).slice(0, 7)} built ${v.built_at}`);
    if (process.env.SIFT_EXPECT_SHA) check(v.sha === process.env.SIFT_EXPECT_SHA, `the site serves the deployed commit (${String(v.sha).slice(0, 7)} = ${process.env.SIFT_EXPECT_SHA.slice(0, 7)})`);
    else check(/^[0-9a-f]{40}$/.test(String(v.sha)), 'version.json names the deployed commit');
  } catch (e) { check(false, `version.json is published: ${first(e)}`); }
  for (const f of ['manifest.webmanifest', 'manifest-v4.webmanifest']) {
    try {
      const m = await getJson(`${BASE}${f}`);
      check(f.includes('v4') ? m.start_url === `${new URL(BASE).pathname}v4/` && m.short_name === 'SIFT v4' : m.start_url === `${new URL(BASE).pathname}#/` && m.short_name === 'Sift', `${f}: ${m.short_name} launches ${m.start_url}`);
    } catch (e) { check(false, `${f} is published: ${first(e)}`); }
  }
}

// ------------------------------------------------------------------ the journey

async function journey(browser, device, name) {
  console.log(`\n== ${name}`);
  const tag = (s) => `${name}: ${s}`;
  const { ctx: c0, page: p0, errs: e0 } = await newPage(browser, device);
  let game = null; let live = null; const home = { games: 0 };
  try {
    // --- SIFT 2.0 stays the default; #/v4 chooses nothing and installs as "SIFT v4"
    await p0.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p0.waitForURL(/#\/design\/sift2\/home/, { timeout: 60_000 });
    check((await p0.locator('[data-v4-shell]').count()) === 0, tag('the root address is SIFT 2.0, not v4'));
    check(/\/manifest\.webmanifest$/.test((await p0.locator('link[rel="manifest"]').getAttribute('href')) ?? ''), tag('the root installs as SIFT (own manifest)'));
    // The real iPhone installation URL is /v4/, not a fragment on SIFT 2.0's entrypoint.
    await p0.goto(`${BASE}v4/`, { waitUntil: 'domcontentloaded' });
    await settled(p0);
    check(p0.url().includes('/v4/#/v4'), tag('the distinct /v4/ page boots v4 without a fragment'));
    check((await p0.evaluate(() => localStorage.getItem('sift.ui'))) === null, tag('opening the /v4/ page chose nothing for this device'));
    check(/\/manifest-v4\.webmanifest$/.test((await p0.locator('link[rel="manifest"]').getAttribute('href')) ?? '') && (await p0.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content')) === 'SIFT v4', tag('/v4/ installs as "SIFT v4"'));
    await p0.reload({ waitUntil: 'domcontentloaded' });
    await settled(p0);
    check(p0.url().includes('/v4/#/v4') && (await p0.locator('[data-v4-shell]').count()) === 1, tag('relaunching the iPhone URL still opens v4'));
    await p0.getByRole('button', { name: /^SIFT v4 early access: about/ }).click();
    const dlg = p0.getByRole('dialog', { name: 'SIFT v4 early access' });
    check(await dlg.getByRole('link', { name: 'Return to SIFT 2.0' }).isVisible(), tag('the early-access sheet offers the way back to SIFT 2.0'));
    {
      const sheetText = await dlg.innerText();
      check(/Real NBA scores are on by default here \(NFL, college football and NHL scores are not available\)/.test(sheetText), tag('the sheet says what is real: NBA scores on by default, NFL, college football and NHL not available'));
      check(await dlg.locator('[data-live-scores-section] a[href^="https://sportscore.com"]').first().isVisible().catch(() => false), tag('the sheet credits SportScore with a visible link'));
    }
    const build = await dlg.locator('[data-v4-build]').innerText();
    console.log(`  ${build}`);
    await p0.keyboard.press('Escape');

    // --- Home
    await settled(p0);
    const counts = await p0.getByRole('group', { name: 'League' }).getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? b.textContent));
    home.games = await p0.locator('.v4-row, [data-featured]').count();
    const emptyNote = await p0.locator('.v4-note', { hasText: /Nothing here|unavailable/ }).count();
    check(home.games > 0 || emptyNote > 0, tag(`Home lists ${home.games} games or says why not (${counts.filter((c) => /game/.test(c)).join('; ') || 'no leagues listed'})`));
    const unavailable = await p0.getByText('Published games are unavailable').count();
    check(unavailable === 0, tag('the publications are readable (Home is not "unavailable")'));
    check(!MISSING.test(await p0.locator('main').innerText()), tag('Home shows no NaN/undefined'));
    check((await overflow(p0)) <= 1, tag('Home: no horizontal overflow'));
    await p0.screenshot({ path: `production-v4-${name}-home.png` });

    // --- games in play, judged against what the score provider really says (NBA from SportScore; every other sport has no feed and must say so)
    const rowsOf = () => p0.locator('.v4-row').evaluateAll((rs) => rs.map((r) => ({
      href: r.querySelector('a[href*="/v4/game/"]')?.getAttribute('href') ?? '',
      label: r.querySelector('a[href*="/v4/game/"]')?.getAttribute('aria-label') ?? '',
      mid: (r.querySelector('.v4-row__mid')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      score: (r.querySelector('.v4-row__sc')?.textContent ?? '').replace(/\s+/g, ' ').trim() || null,
    })));
    const inPlayRows = (await rowsOf()).filter((r) => !/Final|^F\b/.test(r.mid) && /In play|^Live|\bLIVE\b|[Ss]tale|Updated \d/.test(r.mid) || (r.score && !/Final|^F\b/.test(r.mid) && /LIVE|[Ss]tale|Updated/.test(r.mid)));
    if (inPlayRows.length) {
      const tally = {};
      for (const r of inPlayRows) {
        const slug = /\/v4\/game\/([a-z]+)\//.exec(r.href)?.[1] ?? '?';
        const j = judgeRow({ slug, mid: r.mid, score: r.score });
        tally[`${slug}:${j.state}`] = (tally[`${slug}:${j.state}`] ?? 0) + 1;
        check(j.ok, tag(`in-play ${slug} row "${r.mid}"${r.score ? ` ${r.score}` : ''}: ${j.why}`));
      }
      console.log(`  in-play rows by sport and state: ${JSON.stringify(tally)}`);
      const noteText = await p0.locator('[data-feed-note]').first().innerText().catch(() => '');
      check(/Scores from|not answering|No live score|No game is in its playing window|allowance/.test(noteText) && !/NaN|undefined/.test(noteText), tag(`Home states the score source and its state ("${noteText.replace(/\s+/g, ' ').slice(0, 90)}")`));
      live = {
        nba: inPlayRows.find((r) => /\/v4\/game\/nba\//.test(r.href)) ?? null,
        other: inPlayRows.find((r) => !/\/v4\/game\/(nba|tennis)\//.test(r.href)) ?? null,
      };
    } else na(tag('no game is in play right now (every score state is covered by the fixtures suite, e2e/v4-live-scores.spec.ts)'));

    // --- Games
    await p0.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Games' }).click();
    await p0.getByRole('heading', { name: 'Games', level: 1 }).waitFor({ timeout: 30_000 }).catch(() => {});
    await settled(p0);
    const chips = await p0.getByRole('group', { name: 'Status' }).getByRole('button').allInnerTexts();
    check(chips.length === 4, tag(`Games has its status filters (${chips.map((c) => c.replace(/\s+/g, ' ')).join(', ')})`));
    const links = await p0.locator('a[href*="/v4/game/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    check(links.length > 0 || (await p0.getByText(/Nothing here|No published games|unavailable/).count()) > 0, tag(`Games lists ${links.length} games or says why not`));

    // --- Game (a pregame NFL game when one is published, else the first game)
    const pick = links.find((h) => /\/v4\/game\/nfl\//.test(h)) ?? links.find((h) => /\/v4\/game\/(nhl|mlb)\//.test(h)) ?? links[0];
    if (pick) {
      await p0.goto(`${BASE}${pick.startsWith('#') ? pick : `#${pick}`}`);
      await p0.getByRole('tablist', { name: 'Game sections' }).waitFor({ timeout: 60_000 });
      const tabs = (await p0.getByRole('tab').allInnerTexts()).map((t) => t.trim());
      check(['Live', 'Matchups', 'Players', 'Markets'].every((t) => tabs.includes(t)), tag(`the game page has its four sections (${tabs.join(', ')})`));
      await settled(p0);
      const eventId = decodeURIComponent(pick.split('/').pop().split('?')[0]);
      game = { href: pick, id: eventId, slug: pick.split('/')[3], title: `Game saved from SIFT 2.0 before v4 (${pick.split('/')[3].toUpperCase()})` };
      await priceAgeMatchesFeed(p0, eventId, 'Game', tag, gameAgeReader);
      const gtxt = await p0.locator('.v4-gstat').first().innerText();
      check(/Prices (live|aging|stale) · |No prices published/.test(gtxt), tag(`the game page states its price source and age ("${gtxt.replace(/\s+/g, ' ').slice(0, 50)}")`));
      check((await overflow(p0)) <= 1, tag('Game: no horizontal overflow'));
      check(!MISSING.test(await p0.locator('main').innerText()), tag('Game shows no NaN/undefined'));
      await p0.screenshot({ path: `production-v4-${name}-game.png` });
      for (const [kind, row] of Object.entries(live ?? {})) {
        if (!row) continue;
        const href = row.href;
        const slug = /\/v4\/game\/([a-z]+)\//.exec(href)?.[1] ?? '?';
        const sides = /^(.+?) at (.+?), /.exec(row.label);   // "Cleveland Cavaliers at Philadelphia 76ers, Q2 ..., Open game"
        const query = sides ? { away: sides[1], home: sides[2], startMs: null } : null;
        const providerBefore = slug === 'nba' ? await fetchProviderNba() : { games: [], ok: true };
        await p0.goto(`${BASE}${href.startsWith('#') ? href : `#${href}`}`);
        await p0.getByRole('tablist', { name: 'Game sections' }).waitFor({ timeout: 60_000 });
        // the read arrives after the first provider answer: wait for a card or the unavailable statement
        await p0.waitForFunction(() => document.querySelector('[data-live-score]') || /score unavailable|clock and plays are unavailable/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 45_000 }).catch(() => {});
        const pageState = await readLivePage(p0);
        const providerAfter = slug === 'nba' ? await fetchProviderNba() : { games: [], ok: true };
        const found = (p) => (slug === 'nba' && query ? findProviderGame(p.games, query) : null);
        const j = judgeGamePage({ slug, page: pageState, providers: [found(providerBefore), found(providerAfter)].filter(Boolean), providerOk: providerBefore.ok || providerAfter.ok });
        check(j.ok, tag(`${slug.toUpperCase()} game in play (${j.state}): ${j.ok ? 'matches the provider and states its source and freshness' : j.problems.join('; ')}`));
        if (j.note) na(tag(j.note));
        await p0.screenshot({ path: `production-v4-${name}-live-${kind}.png` });
      }
    } else na(tag('no published game to open'));
  } catch (e) { check(false, tag(`home/games/game: ${first(e)}`)); }
  check(e0.length === 0, tag(`no page errors on Home, Games and Game${e0.length ? ` (${e0[0]})` : ''}`));
  await c0.close();

  // --- Props -> player -> Research -> Save -> Board -> revisit, with a pre-v4 save in the same device storage
  const legacy = game ? legacySave({ ...game, sport: game.slug.toUpperCase(), kickoff: null }) : null;
  const { ctx, page, errs } = await newPage(browser, device, legacy?.doc);
  try {
    await page.goto(`${BASE}#/v4/props`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Props', level: 1 }).waitFor({ timeout: 60_000 });
    await settled(page);
    const nRows = await page.locator('.v4-prow').count();
    if (!nRows) {
      check((await page.getByText(/No (priced )?(props|players)|unavailable|not published|Nothing/i).count()) > 0, tag('Props lists no player and says why'));
      na(tag('no priced NFL prop is published right now: Research, Save and Board are verified by the fixtures suite only'));
    } else {
      check(true, tag(`Props lists ${nRows} players with Kalshi beside the model`));
      check(/Kalshi/.test(await page.locator('.v4-prow').first().innerText()), tag('a prop row names its Kalshi price'));
      await page.locator('.v4-prow').first().getByRole('link').click();
      await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 60_000 });
      await settled(page);
      const detailUrl = page.url();
      const playerGame = /\/v4\/props\/[a-z]+\/([^/]+)\//.exec(detailUrl)?.[1];
      if (playerGame) {
        await priceAgeMatchesFeed(page, decodeURIComponent(playerGame), 'Player ladder', tag, ladderAgeReader);
        // the same game's own page, which the quote feed covers: its header price age against the feed too
        await page.goto(`${BASE}#/v4/game/${/\/v4\/props\/([a-z]+)\//.exec(detailUrl)[1]}/${playerGame}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('tablist', { name: 'Game sections' }).waitFor({ timeout: 60_000 });
        await priceAgeMatchesFeed(page, decodeURIComponent(playerGame), "The player's Game page", tag, gameAgeReader);
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('.v4-lad__row').first().waitFor({ timeout: 30_000 });
      }
      await page.locator('.v4-lad__row').first().waitFor({ timeout: 30_000 }).catch(() => {});
      const ladder = await page.locator('.v4-lad__row').count();
      check(ladder > 0, tag(`the player page lists the Kalshi ladder (${ladder} lines)`));
      const body = await page.locator('main').innerText();
      check(!MISSING.test(body) && !DEV_WORDS.test(body) && !AUTHORITY.test(body), tag('the player page has no NaN/undefined, no development vocabulary and no betting authority'));
      check(/SIFT projection/i.test(body), tag('the player page shows the SIFT projection or says it is withheld'));
      check((await overflow(page)) <= 1, tag('Player: no horizontal overflow'));
      await page.screenshot({ path: `production-v4-${name}-player.png` });
      // Research -> Save (YES), then the other side (NO): two items
      await page.getByRole('button', { name: 'Research details', exact: true }).click();
      const dlg = page.getByRole('dialog', { name: /^Research:/ });
      await dlg.waitFor({ timeout: 30_000 });
      await dlg.getByText(/research only/i).first().waitFor({ timeout: 15_000 }).catch(() => {});
      check(/does not recommend a bet|research only/i.test(await dlg.innerText()), tag('the research sheet says research only'));
      const save = dlg.getByRole('button', { name: /^(Save to|Remove from) My Board/ });
      await save.first().waitFor({ timeout: 15_000 }).catch(() => {});
      const saveBtn = dlg.getByRole('button', { name: /^Save to My Board/ });
      if (!(await saveBtn.count()) || (await saveBtn.isDisabled())) {
        na(tag('Save is refused for this player (the game has started: pregame research is frozen at kickoff)'));
      } else {
        await saveBtn.click();
        await dlg.getByRole('button', { name: /^Remove from My Board/ }).waitFor({ timeout: 15_000 });
        await page.keyboard.press('Escape');
        await page.getByRole('group', { name: 'Side' }).getByRole('button', { name: 'Under' }).click();
        await page.getByRole('button', { name: 'Research details', exact: true }).click();
        await dlg.getByRole('button', { name: /^Save to My Board/ }).click();
        await page.keyboard.press('Escape');
        const t = await tray(page);
        const saved = t.tray.items.filter((i) => i.ref_kind === 'MARKET');
        check(saved.length === 2, tag(`the over and the under are two separate saved items (${saved.length})`));
        check(JSON.stringify(saved.map((i) => t.labels[i.item_id]?.side).sort()) === '["NO","YES"]', tag('each save records its side (YES, NO)'));
        check(saved.every((i) => t.labels[i.item_id]?.savedAt && /Z$/.test(t.labels[i.item_id].savedAt)), tag('each save has a real UTC saved time'));

        // --- Board
        await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Board' }).click();
        await page.getByRole('heading', { name: 'Board', level: 1 }).waitFor();
        await settled(page);
        const want = 2 + (legacy ? 1 : 0);
        check((await page.locator('.v4-bd__row').count()) === want, tag(`the Board lists ${want} saved items (the two just saved${legacy ? ' and the pre-v4 save' : ''})`));
        const sides = await page.locator('.v4-bd__row .v4-sg__side').allInnerTexts();
        check(sides.sort().join() === 'NO,YES', tag(`the Board shows each market's side (${sides.sort().join(', ')})`));
        const px = await page.locator('.v4-bd__row .v4-bd__px').allInnerTexts();
        check(px.every((x) => /(YES|NO) ask \d+¢ when saved|No quote was on screen when this was saved/.test(x)), tag('every saved price is stated with its side, or the missing quote is said'));
        check(!MISSING.test(await page.locator('main').innerText()), tag('the Board shows no NaN/undefined'));
        await page.screenshot({ path: `production-v4-${name}-board.png` });
        const before = await tray(page);
        // note on the pre-v4 save: open the editor and leave without a change -> byte for byte unchanged; then a note on a market
        const noteRow = page.locator('.v4-bd__row', { has: page.locator('.v4-sg__side') }).first();
        await noteRow.locator('.v4-bd__main').click();
        const sheet = page.getByRole('dialog', { name: /^Saved:/ });
        await sheet.getByRole('button', { name: 'Add a note' }).click();
        await sheet.getByRole('textbox').fill('Live check: recheck before kickoff.');
        await sheet.getByRole('button', { name: 'Save note' }).click();
        await page.keyboard.press('Escape');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await settled(page);
        check((await page.locator('.v4-bd__nt', { hasText: 'Live check: recheck before kickoff.' }).count()) === 1, tag('a note is saved and survives a reload'));
        const withNote = await tray(page);
        check(JSON.stringify(withNote.labels) === JSON.stringify(before.labels) && withNote.tray.items.every((i, k) => i.item_id === before.tray.items[k].item_id && i.added_at === before.tray.items[k].added_at), tag('adding a note changed no id, time, side or saved price'));
        // remove -> Undo: verbatim
        const victim = page.locator('.v4-bd__row', { has: page.locator('.v4-sg__side') }).last();
        const victimLabel = (await victim.locator('.v4-bd__t b').innerText()).trim();
        await victim.getByRole('button', { name: /^Remove .* from My Board/ }).click();
        await page.getByRole('group', { name: 'Undo remove' }).getByRole('button', { name: /^Undo/ }).click();
        const after = await tray(page);
        check(JSON.stringify(after.tray.items) === JSON.stringify(withNote.tray.items), tag(`Undo restored "${victimLabel}" exactly: same id, time, note, position`));
        check(JSON.stringify(Object.keys(after.labels).sort().map((k) => after.labels[k])) === JSON.stringify(Object.keys(withNote.labels).sort().map((k) => withNote.labels[k])), tag('Undo restored its side and saved price snapshot'));
        // revisit the research from the Board, on the saved side
        const underRow = page.locator('.v4-bd__row', { has: page.locator('.v4-sg__side--no') }).first();
        await underRow.locator('a.v4-bd__go').click();
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 60_000 });
        check(/side=under/.test(page.url()) && /\/v4\/props\//.test(page.url()), tag('a saved NO prop reopens its player on the under'));
        check((await page.locator('.v4-lad__head').first().innerText()).includes('Kalshi No'), tag('the ladder opens on the saved side (Kalshi No)'));
        check(page.url().split('?')[0] === detailUrl.split('?')[0], tag('it is the same player page the research was saved from'));

        // --- the same saved research on SIFT 2.0
        await page.goto(`${BASE}#/design/sift2/board`, { waitUntil: 'domcontentloaded' });
        await page.locator('.bentry').first().waitFor({ timeout: 60_000 });
        check((await page.locator('.bentry').count()) === want, tag(`the SIFT 2.0 Board holds the same ${want} saves`));
        check((await page.locator('[title="NO ask when you saved it"]').count()) + (await page.locator('[title="YES ask when you saved it"]').count()) >= 2, tag('SIFT 2.0 shows each save on its own side'));
        if (legacy) {
          const end = await tray(page);
          const it = end.tray.items.find((i) => i.item_id === legacy.item.item_id);
          check(!!it && JSON.stringify(it) === JSON.stringify(legacy.item), tag('the pre-v4 save is unchanged after everything above (id, time, note)'));
          check(JSON.stringify(end.labels[legacy.item.item_id]) === JSON.stringify(legacy.label) && end.labels[legacy.item.item_id].side === undefined, tag('and it still carries no side (it is read as YES)'));
        }
      }
    }
    // --- Signals: the published research signals, or the plain reason there are none (an unreadable publication is not "no signals")
    await page.goto(`${BASE}#/v4/signals`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Signals', level: 1 }).waitFor({ timeout: 60_000 });
    await settled(page);
    const nCards = await page.locator('.v4-sg').count();
    const sgText = await page.locator('main').innerText();
    check(nCards > 0 || /No published|no signals|unavailable|Nothing/i.test(sgText), tag(`Signals lists ${nCards} published signals or says why not`));
    check(!MISSING.test(sgText) && !AUTHORITY.test(sgText), tag('Signals shows no NaN/undefined and claims no betting authority'));
    check((await overflow(page)) <= 1, tag('Signals: no horizontal overflow'));
    // --- missing data is said
    await page.goto(`${BASE}#/v4/props/nfl/evt_00000000000000000000/prt_00000000000000000000?stat=receptions`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor();
    await page.waitForTimeout(4000);
    const miss = await page.locator('main').innerText();
    check(miss.trim().length > 20 && !MISSING.test(miss), tag('an unknown player says so, in words'));
    await page.goto(`${BASE}#/v4/zzz`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Not found' }).waitFor({ timeout: 30_000 }).catch(() => {});
    check((await page.getByRole('heading', { name: 'Not found' }).count()) > 0, tag('an unknown v4 address says "Not found"'));
    check(await page.getByRole('link', { name: 'Back to Home' }).isVisible(), tag('and offers the way back to Home'));
  } catch (e) { check(false, tag(`props/board: ${first(e)}`)); await page.screenshot({ path: `production-v4-${name}-failure.png` }).catch(() => {}); }
  check(errs.length === 0, tag(`no page errors on Props, Board and SIFT 2.0${errs.length ? ` (${errs[0]})` : ''}`));
  await ctx.close();
}

// ------------------------------------------------------------------ returning visit (service worker), Chromium

async function returning(browser, device) {
  console.log('\n== chromium-phone: returning visit with the service worker');
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}#/v4`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'domcontentloaded' }); // the next visit: the worker controls the page
    await settled(page);
    check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker controls the returning visit');
    // v4 screens are in the offline shell: the app opens with no network at all and says what it cannot read
    await ctx.setOffline(true);
    await page.goto(`${BASE}#/v4/board`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Board', level: 1 }).waitFor({ timeout: 30_000 });
    check(true, 'offline, the v4 Board opens from the cached app shell (not a blank page)');
    await page.goto(`${BASE}#/v4/games`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Games', level: 1 }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    const t = await page.locator('main').innerText();
    check(/unavailable|Nothing here|could not be read|No published games/i.test(t) || (await page.locator('.v4-row').count()) > 0, 'offline, Games says what it cannot read, or shows what was cached');
    await ctx.setOffline(false);
  } catch (e) { check(false, `returning visit: ${first(e)}`); } finally { await ctx.close(); }
}

// ------------------------------------------------------------------ run

await deployment();
if (process.env.SIFT_V4_PAUSED === '1') {
  console.log('\n== v4 is paused (SIFT_V4=off): the notice, and SIFT 2.0 untouched');
  const browser = await chromium.launch(process.env.SIFT_CHROMIUM_ARGS ? { args: JSON.parse(process.env.SIFT_CHROMIUM_ARGS) } : {});
  try {
    const { ctx, page, errs } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}#/v4`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'SIFT v4 early access is paused' }).waitFor({ timeout: 60_000 });
    check(await page.getByRole('link', { name: 'Open SIFT 2.0' }).isVisible(), 'v4 says it is paused and offers SIFT 2.0');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/#\/design\/sift2\/home/, { timeout: 60_000 });
    check((await page.locator('[data-v4-shell]').count()) === 0, 'the root address is SIFT 2.0');
    check(errs.length === 0, `no page errors${errs.length ? ` (${errs[0]})` : ''}`);
    await ctx.close();
  } finally { await browser.close(); }
  console.log(failures.length ? `\nv4 production check FAILED (${failures.length}):\n- ${failures.join('\n- ')}` : '\nv4 production check passed (paused)');
  process.exit(failures.length ? 1 : 0);
}
const devices = [['chromium-phone', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]];
if (!argv.includes('--no-webkit')) devices.push(['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]);
for (const [name, type, device] of devices) {
  const browser = await type.launch(process.env.SIFT_CHROMIUM_ARGS && type === chromium ? { args: JSON.parse(process.env.SIFT_CHROMIUM_ARGS) } : {});
  try {
    await journey(browser, device, name);
    if (name === 'chromium-phone') await returning(browser, device);
  } finally { await browser.close(); }
}
console.log(failures.length ? `\nv4 production check FAILED (${failures.length}):\n- ${failures.join('\n- ')}` : '\nv4 production check passed');
process.exit(failures.length ? 1 : 0);
