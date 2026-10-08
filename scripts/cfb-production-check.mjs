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
// 4. The CFB home (research-signals contract, cfb_research_signals/1.x): Top CFB Signals renders from the LIVE
//    contract; every upcoming Moderate CONTROL game in it is starred Value Watch on the page, no Strong CONTROL
//    game is; the filter chips work; no horizontal overflow at phone width. V2 game pages lead with the Quick
//    Read and keep every older panel in a closed Deep Dive.
// 5. CFB Slate Priorities (docs/CFB_SLATE_PRIORITIES.md) on Chromium desktop, Chromium phone and WebKit iPhone:
//    the rail is there (the right column beside Top CFB Signals on desktop — no blank right side — and first on
//    phones), its Top Value Signal is a Value Watch game or says plainly why not, a football read is never marked
//    value, every item opens its game and Back returns; every school name on the page is whole (never "St." or
//    "Iowa St."); the page is set in Barlow at installed weights (400–700) with no italic.
// 6. One canonical name per school (docs/CFB_SLATE_PRIORITIES.md "School names"): no raw publication spelling
//    ("Utah St.", "Miami (FL)", "University at Albany") or fragment matchup ("University @ …") is visible on the CFB
//    home, and each picked game's breadcrumb, Markets tab and Scripts tab name both schools canonically. When the
//    UAlbany game (ALBY) is on the board it shows UAlbany and Stony Brook, with UAlbany's committed logo.
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { NEGATIVE, selectGames, upcoming } from './cfb/select.mjs';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const CFB_RAW = (process.env.SIFT_CFB_RAW ?? 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/main').replace(/\/+$/, '');
const APP = `${CFB_RAW}/app/latest`;
const EXPECT_SHA = (process.env.SIFT_EXPECT_SHA ?? '').trim();
const EMPTY = 'No script cleared its evidence requirement';
const SIGNALS_URL = process.env.SIFT_CFB_SIGNALS ?? 'https://raw.githubusercontent.com/chmoses98/cfb-edge-finder/research-signals/signals/cfb_research_signals.json';
/** The committed CFB identity map this build ships (team code -> ESPN id -> public/teams/cfb/<id>.webp). */
const CFB_TEAMS = JSON.parse(readFileSync(new URL('../src/lib/cfb-teams.json', import.meta.url), 'utf-8')).teams;
/** The overrides cfbName() applies (Penn, UMass, LIU): the same file the app reads. */
const CFB_PUBLIC = JSON.parse(readFileSync(new URL('../src/lib/cfb-public-names.json', import.meta.url), 'utf-8')).names;
/** The one public-facing name SIFT shows for a contract code (src/lib/cfbTeams.ts cfbName), or null when unknown. */
const canonicalName = (code) => CFB_PUBLIC[code] ?? CFB_TEAMS[code]?.n ?? null;
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
const signals = await getJson(SIGNALS_URL).catch((e) => (check(false, `research-signals contract readable (${e})`), null));
if (signals) {
  check(/^cfb_research_signals\/1\./.test(signals.schema), `research-signals schema ${signals.schema}`);
  check(ageH(signals.generated_at) < 2, `research-signals generated ${signals.generated_at} (${ageH(signals.generated_at).toFixed(2)} h ago, < 2 h: the conductor is alive)`);
  console.log(`  signals: moderate ${signals.signals.moderate_control.status} · strong ${signals.signals.strong_control.status} · capture ${JSON.stringify(signals.capture_health)}`);
}
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
  await page.waitForFunction(() => document.querySelectorAll('.gh .teammark--logo img, .gh img.teammark--logo').length >= 2 && [...document.querySelectorAll('.gh__team img.teammark--logo')].every((i) => i.complete), null, { timeout: 20_000 }).catch(() => {});
  return page.evaluate((empty) => ({
    engine: !!document.querySelector('.game--engine'),
    // The engine's own title (data-canonical): environment scripts are shown in plain words ("Close, Low-Scoring
    // Game" for "Competitive grind"), and the check still requires exactly the published scripts.
    cards: [...document.querySelectorAll('.ov--engine .eng-scard .scard__name, .stab__pick .eng-scard .scard__name, .cfdd__s .eng-scard .scard__name')].map((e) => e.getAttribute('data-canonical') ?? e.textContent?.trim() ?? ''),
    shown: [...document.querySelectorAll('.eng-scard .scard__name')].map((e) => e.textContent?.trim() ?? ''),
    quickRead: !!document.querySelector('[data-testid="cfb-quick-read"]'),
    deep: [...document.querySelectorAll('details.cfdd__s')].map((d) => d.open),
    // V2 pages keep the V1 scripts (and their honest empty state) inside the closed Deep Dive: read its text too.
    empty: document.body.innerText.includes(empty) || [...document.querySelectorAll('details.cfdd__s')].some((d) => (d.textContent ?? '').includes(empty)),
    logos: [...document.querySelectorAll('.gh__team img.teammark--logo')].map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })),
    textMarks: [...document.querySelectorAll('.gh .teammark--text')].map((e) => e.textContent?.trim()),
  }), EMPTY);
}

/** A school name that cannot identify a school, or the publication's abbreviation shown as-is. */
// "TBD" is not here: it is the honest stand-in for an upstream participant row that names no school (reported below).
const BROKEN_NAME = /^(St\.?|State|Miss|Tech|U\.?|University)$|\sSt\.$/;

// ------------------------------------------------------------------ 6. one canonical name per school, everywhere

/** Every raw spelling the live publication uses for a school that SIFT names differently ("Utah St.", "Miami (FL)",
 * "University at Albany"), plus the schedule names of the overrides: none may be visible. */
function rawSpellings() {
  const raw = new Set(Object.keys(CFB_PUBLIC).map((c) => CFB_TEAMS[c]?.n).filter((n) => n && !Object.values(CFB_PUBLIC).includes(n)));
  for (const i of board.items) for (const p of i.participants) {
    const c = canonicalName(p.short_name);
    if (c && p.display_name && p.display_name !== c) raw.add(p.display_name);
  }
  return raw;
}
const RAW = rawSpellings();
// Whole spellings only, and the same rule the app's cfbDisplayText uses: a spelling followed by " (" is the start of a
// longer school name ("Miami" in "Miami (OH)" or "Miami (FL)"), never a leak of the bare schedule name.
const RAW_RE = new RegExp(`(?<![\\w&'’-])(${[...RAW].sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w&-]|\\s\\()`);
const FRAGMENT_MATCHUP = /(^|\n|\s)(St\.|State|Miss|Tech|U|University)\s+(at|@|vs)\s+(St\.|State|Miss|Tech|U|University)(\s|$)|(^|\n)University (at|@) |\s(at|@) University(\s|$)/;

function visibleLeak(text) {
  const m = RAW.size ? RAW_RE.exec(text) : null;
  return m ? m[0] : FRAGMENT_MATCHUP.test(text) ? 'fragment matchup' : null;
}

/** A game's breadcrumb, Markets tab and Scripts tab all name both schools canonically (section 6). */
async function identityCheck(page, name, eventId, label) {
  const item = board.items.find((i) => i.event_id === eventId);
  const away = item?.participants.find((p) => p.participant_id === item.away_participant);
  const home = item?.participants.find((p) => p.participant_id === item.home_participant);
  const want = `${canonicalName(away?.short_name) ?? away?.display_name} @ ${canonicalName(home?.short_name) ?? home?.display_name}`;
  for (const [tab, what] of [['', 'overview'], ['?tab=markets', 'Markets'], ['?tab=script', 'Scripts']]) {
    await page.goto(`${BASE}#/cfb/game/${eventId}${tab}`);
    await page.locator('.game').first().waitFor({ timeout: 60_000 });
    await page.locator('.skel').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const crumb = ((await page.locator('.trail li.is-here').innerText().catch(() => '')) ?? '').trim();
    check(crumb === want, `${name}: ${label} ${what}: the breadcrumb reads "${want}" (got "${crumb}")`);
    const text = await page.locator('main').innerText();
    const leak = visibleLeak(text);
    check(!leak, `${name}: ${label} ${what}: every school by its canonical name${leak ? ` (raw "${leak}" visible)` : ''}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${name}: ${label} ${what}: no sideways scroll`);
    if (tab === '?tab=markets') {
      const rows = await page.locator('.mrow__d, .mgroup__title').allInnerTexts();
      console.log(`  ${label} markets: ${rows.slice(0, 4).join(' | ')}`);
    }
    if (tab === '?tab=script') {
      const cards = await page.locator('.eng-scard .scard__name').evaluateAll((els) => els.map((e) => ({ shown: e.textContent?.trim(), published: e.getAttribute('data-canonical') })));
      if (cards.length) console.log(`  ${label} scripts: ${cards.map((c) => `${c.shown} [${c.published}]`).join(' | ')}`);
      check(cards.every((c) => c.published && c.shown && !visibleLeak(c.shown)), `${name}: ${label} Scripts: titles use canonical names, the published title kept as data-canonical`);
    }
  }
}

/** CFB Slate Priorities, school names and typography on the open CFB home (section 5 above). */
async function priorityCheck(page, name, device) {
  const rail = page.getByRole('region', { name: 'Where to look first' });
  await rail.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  const text = (await rail.innerText()).replace(/\s+/g, ' ');
  console.log(`  CFB rail: ${text.slice(0, 700)}`);
  check(/top value signal/i.test(text), `${name}: CFB Slate Priorities: the Top Value Signal section is present (a Value Watch game, or plainly none)`);
  const value = rail.locator('[data-priority="value"]');
  const valueText = (await value.innerText()).replace(/\s+/g, ' ');
  check(/value signal/i.test(valueText) || /No strong value signal yet|Waiting for updated prices/.test(valueText), `${name}: the value slot is a value signal or says why not ("${valueText.slice(0, 120)}")`);
  if (await value.locator('a.prio__a').count()) {
    const href = await value.locator('a.prio__a').getAttribute('href');
    const id = /evt_[0-9a-f]+/.exec(href ?? '')?.[0];
    const g = signals?.games.find((x) => x.event_id === id);
    check(!!g && g.claims?.control?.strength === 'MODERATE' && signals.signals.moderate_control.status === 'VALUE_WATCH', `${name}: the Top Value Signal (${id}) is a Value Watch game in the live contract`);
  }
  const reads = rail.locator('[data-priority="read"], [data-priority="disagreement"]');
  check((await reads.locator('.prio__kind--value').count()) === 0, `${name}: no football read or market disagreement is marked as value`);
  const items = await rail.locator('a.prio__a').count();
  check(items >= 1 && items <= 5, `${name}: CFB Slate Priorities: ${items} linked items (1–5)`);
  const hrefs = await rail.locator('a.prio__a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  check(hrefs.every((h) => /\/cfb\/game\/evt_[0-9a-f]+$/.test(h)) && new Set(hrefs).size === hrefs.length, `${name}: every priority opens a different CFB game (${hrefs.length})`);
  const upcomingIds = new Set(board.items.filter((i) => i.status === 'SCHEDULED' && Date.parse(i.start_time_utc) > Date.now()).map((i) => i.event_id));
  check(hrefs.every((h) => upcomingIds.has(/evt_[0-9a-f]+/.exec(h)?.[0])), `${name}: no priority points at a game that has kicked off`);

  // Composition: desktop rail beside Top CFB Signals and reaching the right edge; phones put it first.
  const r = await rail.boundingBox();
  const main = await page.locator('.cfh__main').boundingBox();
  const top = await page.getByRole('heading', { name: 'Top CFB Signals' }).boundingBox();
  if (device.viewport.width >= 1100) {
    check(!!r && !!main && r.x > main.x + main.width && Math.abs(r.y - main.y) < 4, `${name}: the rail sits beside Top CFB Signals`);
    check(!!r && r.x + r.width > device.viewport.width - 60, `${name}: the right side of the desktop page is used (rail ends at ${Math.round((r?.x ?? 0) + (r?.width ?? 0))}px of ${device.viewport.width})`);
  } else check(!!r && !!top && r.y < top.y, `${name}: phones show Slate Priorities before Top CFB Signals`);

  // School names: every name element on the home is whole.
  const names = await page.evaluate(() => [...document.querySelectorAll('.cfc__tn, .cfsch__n, .prio__teams, .cfs__m b, .cfs__s')].map((e) => (e.textContent ?? '').trim()));
  const parts = names.flatMap((n) => n.split(/ · /)[0].split(/ (?:@|at) /)).map((s) => s.trim()).filter(Boolean);
  const bad = [...new Set(parts.filter((s) => BROKEN_NAME.test(s)))];
  check(parts.length > 10 && bad.length === 0, `${name}: every school name on the CFB home is whole (${parts.length} checked; broken: ${bad.slice(0, 6).join(', ') || 'none'})`);
  const tbd = parts.filter((p) => p === 'TBD').length;
  if (tbd) console.log(`  note: ${tbd} school name(s) shown as TBD — an upstream participant row that names no school (e.g. "University" / "Albany at Stony Brook")`);
  const body = await page.locator('main').innerText();
  check(!/(^|\n|\s)(St\.|State|Miss|Tech) (at|@) (St\.|State|Miss|Tech)(\s|$)/.test(body), `${name}: no "St. at St."-style matchup anywhere on the page`);

  // Typography: Barlow at installed weights, no italic.
  const type = await page.evaluate(async () => {
    await document.fonts.ready;
    const els = [...document.querySelectorAll('.cfh *')].filter((e) => (e.textContent ?? '').trim());
    return {
      family: getComputedStyle(document.querySelector('.cfh')).fontFamily,
      weights: [...new Set(els.map((e) => getComputedStyle(e).fontWeight))],
      italic: els.filter((e) => getComputedStyle(e).fontStyle !== 'normal').map((e) => e.className || e.tagName).slice(0, 4),
      loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`))],
    };
  });
  console.log(`  CFB type: ${type.family.split(',')[0]} · weights ${type.weights.join(',')} · loaded ${type.loaded.join(', ')}`);
  check(/^"?Barlow"?,/.test(type.family) && type.loaded.some((x) => x.startsWith('Barlow ')), `${name}: the CFB home is set in Barlow`);
  check(type.weights.every((w) => ['400', '500', '600', '700'].includes(w)), `${name}: CFB text uses installed Barlow weights only (${type.weights.join(',')})`);
  check(type.italic.length === 0, `${name}: no italic text on the CFB home (${type.italic.join(', ')})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${name}: CFB home: no sideways scroll`);
  await rail.screenshot({ path: `production-cfb-${name}-rail.png` });
  await page.screenshot({ path: `production-cfb-${name}-home-full.png`, fullPage: true });

  if (items) {
    await rail.locator('a.prio__a').first().click();
    await page.waitForURL(/#\/cfb\/game\/evt_/, { timeout: 30_000 });
    await page.locator('.game').first().waitFor({ timeout: 60_000 });
    check(true, `${name}: the first priority opens ${page.url().split('#')[1]}`);
    await page.screenshot({ path: `production-cfb-${name}-priority-game.png` });
    await page.goBack();
    await rail.waitFor({ timeout: 30_000 });
    check(true, `${name}: Back returns to the CFB home`);
  }
}

/** Logo files the site has served in this browser context (held images are re-used as blob: URLs after). */
const served = new Set();

function judge(label, kind, g, seen) {
  const titles = g.scripts.map((s) => s.title);
  console.log(`  ${label}: engine=${seen.engine} cards=[${seen.cards.join(' | ')}] empty=${seen.empty} logos=${seen.logos.map((l) => `${l.src.split('/').slice(-2).join('/')}${l.ok ? '' : '(not loaded)'}`).join(',') || '—'} text-marks=[${seen.textMarks.join(',')}]`);
  check(seen.engine, `${label}: renders the CFB Script Engine page`);
  if (seen.quickRead) check(seen.deep.length >= 5 && seen.deep.every((o) => !o), `${label}: V2 Quick Read first, ${seen.deep.length} Deep Dive sections all closed`);
  if (kind === NEGATIVE) {
    check(seen.empty, `${label}: shows the honest empty state`);
    check(seen.cards.length === 0, `${label}: shows no script card`);
  } else {
    check(!seen.empty, `${label}: does not show "${EMPTY}"`);
    check(seen.cards.length === titles.length, `${label}: shows ${titles.length} script card(s) (got ${seen.cards.length})`);
    check(titles.every((t) => seen.cards.includes(t)), `${label}: shows the published script titles`);
    check(!seen.shown.some((t) => /^(Competitive grind|Competitive shootout|Pace-driven scoring)$/i.test(t)), `${label}: environment scripts read in plain words (${seen.shown.join(' | ')})`);
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

const BROWSERS = [['chromium-desktop', chromium, { viewport: { width: 1440, height: 900 } }], ['chromium-phone', chromium, { viewport: { width: 390, height: 844 } }], ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }]]
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
    if (signals) {
      await page.goto(`${BASE}#/cfb`);
      await page.getByRole('heading', { name: 'Top CFB Signals' }).waitFor({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      const home = await page.evaluate(() => ({
        vw: [...document.querySelectorAll('.cfc--vw')].length,
        strongStarred: [...document.querySelectorAll('.cfc--strong.cfc--vw')].length,
        cards: document.querySelectorAll('.cfc').length,
        sections: [...document.querySelectorAll('[data-signal]')].map((e) => e.getAttribute('data-signal')),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      console.log(`  CFB home: sections ${home.sections.join(',')} · cards ${home.cards} · Value Watch cards ${home.vw}`);
      const liveVW = signals.games.filter((x) => x.signal === 'VALUE_WATCH' && Date.parse(x.kickoff_utc) > Date.now()).length;
      check(home.cards > 0, 'CFB home: intelligent game cards render');
      check(home.strongStarred === 0, 'CFB home: no Strong CONTROL card is starred Value Watch');
      if (liveVW && signals.signals.moderate_control.status === 'VALUE_WATCH') check(home.sections.includes('value-watch') && home.vw > 0, `CFB home: Value Watch section and starred cards (${liveVW} upcoming Moderate CONTROL games in the contract)`);
      check(home.overflow <= 0, `CFB home: no horizontal overflow (${home.overflow}px)`);
      await page.goto(`${BASE}#/cfb?f=value-watch`);
      await page.waitForTimeout(1500);
      const filtered = await page.evaluate(() => [...document.querySelectorAll('.cfc')].every((c) => c.classList.contains('cfc--vw')));
      check(filtered, 'CFB home: the Value Watch filter shows only Value Watch games');
      await page.goto(`${BASE}#/cfb`);
      await page.screenshot({ path: `production-cfb-${name}-home.png` });
      await priorityCheck(page, name, device);
      const homeLeak = visibleLeak(await page.locator('main').innerText());
      check(!homeLeak, `${name}: CFB home: no raw school spelling or fragment matchup visible${homeLeak ? ` ("${homeLeak}")` : ''}`);
      // Section 6: every picked game, then the UAlbany game when the board carries it.
      for (const [kind, g] of Object.entries(picked)) await identityCheck(page, name, g.eventId, `${kind} ${g.gameKey}`);
      const alby = board.items.find((i) => i.participants.some((p) => p.short_name === 'ALBY') && i.status !== 'FINAL');
      if (alby) {
        await identityCheck(page, name, alby.event_id, `UAlbany game ${alby.event_id}`);
        await page.goto(`${BASE}#/cfb/game/${alby.event_id}`);
        await page.locator('.gh__name').first().waitFor({ timeout: 60_000 });
        await page.waitForFunction(() => [...document.querySelectorAll('.gh__team img.teammark--logo')].every((i) => i.complete), null, { timeout: 20_000 }).catch(() => {});
        const heroNames = await page.locator('.gh__name').allInnerTexts();
        check(heroNames.includes('UAlbany') && !heroNames.some((n) => /University|TBD|Albany at/.test(n)), `${name}: the UAlbany game names both real schools (${heroNames.join(' vs ')})`);
        check([...served].some((u) => u.endsWith('/teams/cfb/399.webp')), `${name}: UAlbany's committed logo (teams/cfb/399.webp) is served`);
        await page.screenshot({ path: `production-cfb-${name}-ualbany.png` });
      } else console.log('  UAlbany game: NOT_APPLICABLE — no upcoming ALBY game on the board');
    }
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
