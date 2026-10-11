// Post-deploy production check for the 2026-10-11 repair sprint (docs/REPAIR_SPRINT_2026-10-11.md, 52 items):
// the LIVE site against the LIVE publications, in real Chromium (desktop 1280×900 and phone 390×844) and, where it is
// installed, WebKit iPhone (a smaller pass). No fixtures, no pinned event: the games come from the canonical NFL
// publication's own board (scripts/live-quotes/slate.mjs, the rule production-check.mjs uses) or from the app's links.
//
//   node scripts/sprint-production-check.mjs
//   SIFT_URL=http://127.0.0.1:4220/sift-sports-intelligence/ SIFT_CHECK_PROXY=1 node scripts/sprint-production-check.mjs
//
// Every line names the tracker issue(s) it proves. A check that cannot apply today (no current NFL game, no final yet,
// no game with two opportunities…) prints "N/A (reason)" and is never counted as a pass. Any FAIL exits 1.
// SIFT_CHECK_PROXY=1 routes the browser through $HTTPS_PROXY (local development in a proxied sandbox only; CI never
// sets it). Screenshots: production-sprint-*.png (the workflow's artifact glob is production-*.png).
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { isEligibleEvent, selectTarget } from './live-quotes/slate.mjs';

const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const NFL_RAW = (process.env.SIFT_NFL_RAW ?? 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest').replace(/\/+$/, '');
const PROXY = process.env.SIFT_CHECK_PROXY === '1' ? (process.env.HTTPS_PROXY ?? process.env.https_proxy ?? '') : '';

const failures = [];
let passes = 0;
let nas = 0;
let dev = '';
const check = (ok, msg) => (ok ? (passes++, console.log(`  PASS ${msg}`)) : (failures.push(`${dev}: ${msg}`), console.log(`  FAIL ${msg}`)));
const na = (msg, reason) => (nas++, console.log(`  N/A  ${msg} (${reason})`));
/** Runs one block; an exception is that block's FAIL, never a crash of the rest. */
async function step(page, label, fn) {
  try {
    await fn();
  } catch (e) {
    check(false, `${label}: ${String(e?.message ?? e).split('\n')[0]}`);
    await page.screenshot({ path: `production-sprint-${dev}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}-failure.png` }).catch(() => {});
  }
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// A browser-level network failure of an external data host (WebKit says "access control checks", Chromium "blocked by
// CORS policy" when a host answers without its headers, e.g. a rate-limited response) is the network, not the app:
// the same exclusions as production-check.mjs. Real script errors and page errors always count.
// Developer jargon that must stay on Data & provenance (#35), and broken values anywhere.
const JARGON = /edge_finder\.app\.v1|shadow-\d|RESEARCH_ONLY|PROJECTABLE_NOT_YET_VALIDATED/i;
const BROKEN = /\bundefined\b|\bNaN\b/;
// Game-card indicator vocabulary (#21, src/views/broadcast/cardFacts.ts edgeOf): "Back" only for ACTIONABLE.
const INDICATOR_WORDS = ['Back', 'Research candidate · robust', 'Research candidate', 'No edge'];

// ------------------------------------------------------------------ venue facts (#3/#18), from the file the app ships
/** NFL-relevant rows of src/lib/venueFacts.ts: name, aliases, built roof, NFL tenants. Parsed, not duplicated. */
function readVenueFacts() {
  const src = readFileSync(new URL('../src/lib/venueFacts.ts', import.meta.url), 'utf-8');
  const rows = [];
  for (const line of src.split('\n')) {
    const name = line.match(/\bname: (['"])(.*?)\1/)?.[2];
    const roof = line.match(/\broof: '(dome|retractable|open)'/)?.[1];
    if (!name || !roof) continue;
    const aliases = [...(line.match(/aliases: \[([^\]]*)\]/)?.[1] ?? '').matchAll(/(['"])(.*?)\1/g)].map((m) => m[2]);
    const nfl = [...line.matchAll(/NFL\((\[[^\]]*\]|'[^']*')\)/g)].flatMap((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
    rows.push({ name, aliases, roof, nfl });
  }
  return rows;
}
const VENUES = readVenueFacts();
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const venueByName = (n) => (n ? VENUES.find((v) => [v.name, ...v.aliases].some((x) => norm(x) === norm(n))) : null) ?? null;
const venueOfHome = (abbr) => VENUES.find((v) => v.nfl.includes(abbr)) ?? null;
const BLOCKLIST = JSON.parse(readFileSync(new URL('../src/lib/player-image-blocklist.json', import.meta.url), 'utf-8')).files;
const blockedImage = (url) => {
  const u = decodeURIComponent(url);
  return BLOCKLIST.find((b) => u.includes(`/players/nfl/${b.id}.`) || u.includes(b.file.replace(/^File:/, ''))) ?? null;
};

// ------------------------------------------------------------------ the games, from the publication itself
const now = Date.now();
let board = null;
try {
  board = await getJson(`${NFL_RAW}/board.json`);
} catch (e) {
  check(false, `NFL publication board is readable (${String(e)})`);
}
const sel = selectTarget(board ?? {}, now, null);
const items = board?.items ?? [];
const eligible = items.filter((i) => isEligibleEvent(i, now));
const pregame = eligible.filter((i) => Date.parse(i.start_time_utc) > now).sort((a, b) => Date.parse(a.start_time_utc) - Date.parse(b.start_time_utc));
// Pregame first (prop explorer, live research); else the slate target; else the latest historical game.
const targetItem = pregame[0] ?? items.find((i) => i.event_id === (sel.target ?? sel.historical)?.event_id) ?? null;
const sides = (it) => {
  const by = (pid) => it.participants?.find((p) => p.participant_id === pid);
  const team = (p) => ({ pid: p?.participant_id, abbr: p?.short_name, name: p?.display_name ?? '', nick: (p?.display_name ?? '').split(' ').slice(-1)[0], city: (p?.display_name ?? '').split(' ').slice(0, -1).join(' ') });
  return { home: team(by(it.home_participant)), away: team(by(it.away_participant)) };
};
const T = targetItem ? { id: targetItem.event_id, ...sides(targetItem), pregame: Date.parse(targetItem.start_time_utc) > now, start: targetItem.start_time_utc } : null;
console.log(`NFL publication ${sel.publication.status} · generated ${board?.generated_at} · ${eligible.length} current game(s), ${pregame.length} pregame`);
console.log(`target game: ${T ? `${T.id} ${T.away.abbr} @ ${T.home.abbr} (${T.start}${T.pregame ? ', pregame' : ', started or historical'})` : 'none'}`);
console.log(`venue facts: ${VENUES.length} rows parsed from src/lib/venueFacts.ts · ${BLOCKLIST.length} blocked player images`);

/** Roof expectation for each current game, from the published venue name (or the home club's stadium). */
async function roofGames() {
  const out = [];
  for (const it of eligible) {
    const s = sides(it);
    const r = await getJson(`${NFL_RAW}/explorer/events/${it.event_id}.json`).catch(() => null);
    const pubName = r?.context?.venue?.name ?? r?.context?.weather?.stadium ?? null;
    const fact = venueByName(pubName) ?? (pubName ? null : venueOfHome(s.home.abbr));
    const pubRoof = String(r?.context?.venue?.roof || r?.context?.weather?.roof || '').toLowerCase();
    out.push({ id: it.event_id, label: `${s.away.abbr} @ ${s.home.abbr}`, venue: fact?.name ?? pubName ?? '?', roof: fact?.roof ?? null, pubRoof });
  }
  return out;
}

// ------------------------------------------------------------------ page helpers
function watch(page, sink) {
  page.on('pageerror', (e) => sink.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|access control checks|blocked by CORS policy|net::ERR/.test(m.text()) && sink.errors.push(m.text()));
  page.on('request', (r) => {
    if (r.resourceType() !== 'image' && !/\.(webp|jpe?g|png)(\?|$)/i.test(r.url())) return;
    const b = blockedImage(r.url());
    if (b) sink.blocked.push(`${b.id} (${r.url()})`);
    if (/\/players\/nfl\//.test(r.url())) sink.playerImages++;
  });
}
/** null when the page fits its width; else the page width and the element that sticks out furthest. */
const overflowOf = (page) => page.evaluate(() => {
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= W + 1) return null;
  let worst = null;
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width && r.right > W + 1 && (!worst || r.right > worst.r)) worst = { r: Math.round(r.right), el: `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}` };
  }
  return `${document.documentElement.scrollWidth}px wide; ${worst ? `${worst.el} reaches ${worst.r}px` : 'no element found'}`;
});
async function overflow(page, ctx, label) {
  if (!ctx.phone) return;
  // A page still laying out its data can be wide for a frame; what counts is the page once it has settled.
  let o = await overflowOf(page);
  for (let i = 0; i < 8 && o; i++) await page.waitForTimeout(250), (o = await overflowOf(page));
  check(!o, `phone: no horizontal overflow on ${label}${o ? ` (${o})` : ''}`);
}
const mainText = async (page) => ((await page.locator('main').innerText().catch(() => '')) ?? '');
async function cleanText(page, issues, label) {
  const t = await mainText(page);
  const j = t.match(JARGON)?.[0];
  check(!j, `${issues} no developer jargon on ${label}${j ? ` (found "${j}")` : ''}`);
  const b = t.match(BROKEN)?.[0];
  check(!b, `no undefined / NaN on ${label}${b ? ` (found "${b}")` : ''}`);
}
const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));
const gameUrl = (id, q = '') => `${BASE}#/nfl/game/${encodeURIComponent(id)}${q}`;
async function openGame(page, id, q = '') {
  await page.goto(gameUrl(id, q));
  const hero = page.locator('header.gh');
  const missing = page.getByText('This game has no research document');
  await hero.or(missing).first().waitFor({ timeout: 60_000 });
  // The publication rewrites its files every run and raw.githubusercontent.com serves them independently, so a game can
  // be listed a few seconds before its research file is. One reload after a pause; a game still without research fails.
  if (!(await hero.count())) {
    console.log(`  (${id}: research document not served yet; reloading once)`);
    await page.waitForTimeout(20_000);
    await page.reload();
    await hero.waitFor({ timeout: 60_000 });
  }
}
async function gameTab(page, name) {
  await page.getByRole('navigation', { name: 'Game sections' }).getByRole('link', { name, exact: true }).click();
  await page.waitForURL(new RegExp(`tab=${{ Scripts: 'script', Matchups: 'matchup', Players: 'players', Markets: 'markets', Props: 'props' }[name] ?? name.toLowerCase()}`), { timeout: 30_000 });
}

// ------------------------------------------------------------------ checks
async function navCheck(page, ctx) {
  await page.goto(BASE + '#/');
  await page.getByRole('heading', { name: /^Today on SIFT$/i }).waitFor({ timeout: 60_000 });
  if (ctx.phone) {
    const nav = page.getByRole('navigation', { name: 'Destinations' });
    const names = await nav.getByRole('link').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim()));
    const want = ['Home', 'Games', 'Props', 'Research Lab', 'Intelligence'];
    check(names.length === 5 && want.every((w) => names.some((n) => n.includes(w))), `#4/#44 nav (phone): five tabs incl. Props and Research Lab (${names.join(' · ')})`);
    check((await page.getByRole('banner').getByRole('link', { name: /My Board/ }).count()) > 0, '#4/#44 nav (phone): My Board sits in the header');
  } else {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const names = (await nav.getByRole('link').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
    const want = ['Home', 'Games', 'Props', 'Research Lab', 'Intelligence', 'My Board'];
    check(names.length === 6 && want.every((w) => names.some((n) => n.toLowerCase().startsWith(w.toLowerCase()))), `#4/#44 nav: six destinations incl. Props and Research Lab (${names.join(' · ')})`);
  }
  const navEl = page.getByRole('navigation', { name: ctx.phone ? 'Destinations' : 'Primary' });
  check((await navEl.getByRole('link', { name: 'Props' }).getAttribute('href')) === '#/props', '#4 nav: Props opens #/props');
}

async function homeCheck(page, ctx) {
  await page.goto(BASE + '#/');
  await page.getByRole('heading', { name: /^Today on SIFT$/i }).waitFor({ timeout: 60_000 });
  await page.locator('.bhome__games .rtile, .bhome__games .bempty').first().waitFor({ timeout: 60_000 });
  await page.locator('.bhome__intel .dcard').first().waitFor({ timeout: 60_000 }).catch(() => {});
  const order = await page.locator('.bhome > section').evaluateAll((els) => els.map((e) => e.className));
  const at = (k) => order.findIndex((c) => c.includes(k));
  const seq = ['bhome__feat', 'bhome__games', 'bhome__intel', 'bhome__lab', 'bhome__boardsec'].map(at);
  check(seq.every((x) => x >= 0) && seq.every((x, i) => i === 0 || x > seq[i - 1]), `#20 Home order hero → games → intelligence → lab → board (${seq.join(',')})`);
  // NFL's group joins the rail when its publication loads (other sports may already be there).
  const nflCards = page.locator('.bhome__games a.rtile.gc[href*="/nfl/game/"]');
  await nflCards.first().waitFor({ timeout: 45_000 }).catch(() => {});
  const todayEt = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const nflToday = items.filter((i) => i.status !== 'FINAL' && todayEt(i.start_time_utc) === todayEt(new Date().toISOString())).length;
  const nflGroup = await page.locator('.bhome__games .rail__grpa[aria-label^="NFL:"]').count();
  if (nflGroup && !(await nflCards.count())) check(false, '#2 Home rail: the NFL group is listed but shows no NFL game card');
  else if (await nflCards.count()) {
    const card = nflCards.first();
    await card.scrollIntoViewIfNeeded();
    await card.locator('.gc-rk').first().waitFor({ timeout: 30_000 }).catch(() => {});
    const recs = await card.locator('.gc-team__rec').allTextContents();
    check(recs.length === 2 && recs.every((r) => /^\d+–\d+(–\d+)?$/.test(r.trim())), `#2 Home NFL game card shows both records (${recs.join(' / ')})`);
    const ranks = await card.locator('.gc-rk').count();
    check(ranks > 0, `#19 Home NFL game card shows O/D ranks once in view (${ranks} rank chips)`);
  } else {
    na('#2/#19 Home NFL game card records and ranks', `no NFL group in today's rail (the board lists ${nflToday} NFL game(s) today, ET)`);
  }
  const words = await page.locator('.bhome .gc-edge').evaluateAll((els) => els.map((e) => ({ t: (e.textContent ?? '').trim(), back: e.classList.contains('dword--back') })));
  const bad = words.filter((w) => !INDICATOR_WORDS.some((x) => w.t === x || w.t.startsWith(`${x} · `)) || (w.back !== w.t.startsWith('Back')));
  if (words.length) check(bad.length === 0, `#21 card indicators use only Back / Research candidate / No edge, "Back" only as the ACTIONABLE tone (${words.length} indicators${bad.length ? `; bad: ${bad.map((b) => b.t).join(' | ')}` : ''})`);
  else na('#21 card indicator vocabulary', 'no card carries an indicator on Home right now');
  // #51: a discovery opens in place to what it means and the research it leads to.
  const dcard = page.locator('.bhome__intel .dcard--x').first();
  if (await dcard.count()) {
    await dcard.scrollIntoViewIfNeeded();
    await dcard.getByRole('button', { name: /What it means/ }).click();
    const mean = ((await dcard.locator('.dcard__mean').textContent()) ?? '').trim();
    const leads = await dcard.getByRole('list', { name: 'Research this leads to' }).getByRole('link').count();
    check(mean.length > 10 && leads > 0, `#51 Home discovery expands "What it means" with ${leads} research link(s)`);
  } else na('#51 Home discovery expands', 'no expandable discovery on Home');
  await cleanText(page, '#35', 'Home');
  await overflow(page, ctx, 'Home');
  await page.screenshot({ path: `production-sprint-${dev}-home.png` });
}

async function propsHubCheck(page, ctx) {
  await page.getByRole('navigation', { name: ctx.phone ? 'Destinations' : 'Primary' }).getByRole('link', { name: 'Props' }).click();
  await page.getByRole('heading', { name: /^Player prop explorer$/, level: 1 }).waitFor({ timeout: 60_000 });
  const tp = page.locator('.tprops');
  await tp.waitFor({ timeout: 60_000 });
  await tp.locator('.tprow, .bempty').first().waitFor({ timeout: 90_000 }).catch(() => {});
  const rows = await tp.locator('.tprow').count();
  const empty = await tp.locator('.bempty').count();
  check((await tp.getByRole('heading', { name: 'Top props on the slate' }).count()) === 1 && (rows > 0 || empty > 0), `#4/#48 /props renders the Player Prop Explorer with the top-props board (${rows} rows${empty ? ', honest empty state' : ''})`);
  check(!/% chance|best bet|\block\b/i.test(await tp.innerText()), '#32/#48 top-props board never reads as a chance or a pick');
  await cleanText(page, '#35', '/props');
  await overflow(page, ctx, '/props');
  // #48: multi-select into My Board, then leave the device clean.
  const boxes = tp.locator('.tprow input[type=checkbox]:not([disabled])');
  const n = Math.min(2, await boxes.count());
  if (n >= 2) {
    await page.evaluate(() => localStorage.clear());
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
    await tp.getByRole('button', { name: `Add ${n} to My Board` }).click();
    const bar = ((await tp.locator('.tprops__bar').textContent()) ?? '').trim();
    await page.goto(BASE + '#/board');
    await page.getByRole('heading', { name: /^My Board$/, level: 1 }).waitFor({ timeout: 30_000 });
    const saved = await page.getByRole('button', { name: /from My Board$/ }).count();
    check(new RegExp(`Added ${n} props`).test(bar) && saved === n, `#48 multi-select adds ${n} props to My Board ("${bar}"; board lists ${saved})`);
    await page.evaluate(() => localStorage.clear());
  } else na('#48 multi-select add-to-board', `${await boxes.count()} selectable prop row(s) on the slate`);
}

async function researchLabCheck(page, ctx) {
  await page.getByRole('navigation', { name: ctx.phone ? 'Destinations' : 'Primary' }).getByRole('link', { name: 'Research Lab' }).click();
  await page.getByRole('heading', { name: /^Research Lab$/, level: 1 }).waitFor({ timeout: 60_000 });
  const tools = (await page.locator('.ex-toolgrid > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const want = ['Teams', 'Players', 'Props', 'Matchup compare', 'Season', 'Stats & rankings', 'Model Pulse'];
  const missing = want.filter((w) => !tools.some((t) => t.toLowerCase().includes(w.toLowerCase())));
  check(tools.length === 7 && missing.length === 0, `#44/#45 /explore h1 "Research Lab" with its seven tool categories${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  await cleanText(page, '#35', 'Research Lab');
  await overflow(page, ctx, 'Research Lab');
}

async function heroCheck(page, ctx) {
  await openGame(page, T.id);
  const hero = page.locator('header.gh');
  await hero.locator('.gh__team img.teammark--logo').nth(1).waitFor({ timeout: 30_000 }).catch(() => {});
  const teams = await hero.locator('.gh__team').allInnerTexts();
  const logos = await hero.locator('.gh__team img.teammark--logo').evaluateAll((els) => els.map((i) => i.complete && i.naturalWidth > 0));
  const named = [T.away, T.home].every((t) => teams.join(' ').toLowerCase().includes((t.city || t.nick).toLowerCase()) || teams.join(' ').includes(t.abbr));
  check(teams.length === 2 && named && logos.length === 2 && logos.every(Boolean), `#1 game hero shows both teams with their logos (${T.away.abbr} @ ${T.home.abbr})`);
  const vars = await hero.evaluate((h) => ['--fx-home', '--fx-away', '--home', '--away'].map((k) => getComputedStyle(h).getPropertyValue(k).trim()));
  check(vars.every((v) => v && v !== 'undefined'), `#9 team colour CSS vars set on the hero (${vars.join(' ')})`);
  const font = await page.evaluate(() => getComputedStyle(document.querySelector('header.gh h1, header.gh .gh__tn, h1') ?? document.body).fontFamily);
  check(/Barlow/.test(font), `#12 hero type set in the Barlow family (${font.split(',')[0]})`);
  await cleanText(page, '#35', `game page ${T.away.abbr} @ ${T.home.abbr}`);
  await overflow(page, ctx, 'game overview');
  await page.screenshot({ path: `production-sprint-${dev}-game.png` });
}

/** #3: every current game under a dome or retractable roof shows the roof, never an outdoor flag as its condition. */
async function weatherCheck(page, games) {
  const roofed = games.filter((g) => g.roof === 'dome' || g.roof === 'retractable');
  console.log(`  roof map: ${games.map((g) => `${g.label} ${g.venue} [${g.roof ?? '?'}${g.pubRoof ? `/pub ${g.pubRoof}` : ''}]`).join(' · ')}`);
  if (!roofed.length) return na('#3 weather/roof on dome and retractable games', games.length ? 'no current game is under a roof' : 'no current NFL game');
  for (const g of roofed) {
    if (g.roof === 'retractable' && g.pubRoof === 'open') {
      na(`#3 ${g.label} at ${g.venue}: retractable roof`, 'the publication says the roof is open, so outdoor weather is legitimate');
      continue;
    }
    await openGame(page, g.id);
    const hero = page.locator('header.gh');
    await hero.locator('.fx-stat').first().waitFor({ timeout: 30_000 }).catch(() => {});
    const stats = await hero.locator('.fx-stat').evaluateAll((els) => els.map((e) => ({ l: (e.querySelector('dt')?.textContent ?? '').trim(), t: (e.textContent ?? '').replace(/\s+/g, ' ').trim() })));
    const roofTile = stats.find((s) => s.l === 'Roof');
    const outdoorTile = stats.find((s) => s.l === 'Kickoff weather');
    const flags = await hero.locator('.wx__flag, .wx--flag').count();
    const want = g.roof === 'dome' || g.pubRoof === 'dome' || g.pubRoof === 'closed' ? /Indoors|Indoor arena|Roof closed/ : /Retractable roof|Roof closed/;
    check(!!roofTile && want.test(roofTile.t) && !outdoorTile && flags === 0, `#3 ${g.label} at ${g.venue} (${g.roof}): hero says "${roofTile?.t ?? 'no roof tile'}", no outdoor wind/precipitation flag as the game condition${outdoorTile ? ` (found "${outdoorTile.t}")` : ''}`);
  }
}

async function provenanceCheck(page, ctx) {
  await page.goto(BASE + '#/status');
  await page.locator('#venues').waitFor({ timeout: 60_000 });
  const venues = await page.locator('#venues').innerText();
  check(/Venues, roofs and kickoff weather/i.test(venues) && /State Farm Stadium/.test(venues) && /Retractable/i.test(venues), '#18 Data & provenance: venues section lists roofs (State Farm Stadium · retractable)');
  const inj = page.locator('#injury-sources');
  check((await inj.count()) === 1 && /Injury reports/i.test(await inj.innerText()), '#33 Data & provenance: injury reports section');
  await overflow(page, ctx, 'Data & provenance');
}

async function scriptsCheck(page, ctx) {
  await openGame(page, T.id);
  await gameTab(page, 'Scripts');
  const chart = page.locator('.lsd-chart');
  const engine = await page.locator('.lsd-chart, .fr-theater').first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
  if (!engine || !(await chart.count())) {
    const t = await mainText(page);
    return na('#8/#16/#28/#29 NFL Scripts tab', `no script layer on this game (${t.match(/No [^.]*script[^.]*\./i)?.[0] ?? 'Scripts tab empty'})`);
  }
  const names = (await chart.locator('.lsd-chart__n').allTextContents()).map((s) => s.trim());
  const teamWords = [T.home, T.away].flatMap((t) => [t.nick, t.city, t.abbr]).filter(Boolean);
  const generic = names.filter((n) => /Close Game Either Way|Home team|Away team|^Favou?rite|^Underdog/i.test(n) || !teamWords.some((w) => n.includes(w)));
  check(names.length >= 2 && generic.length === 0, `#8/#13 script titles name a team (${names.join(' · ')})`);
  const boardEl = page.getByTestId('survivor-board');
  check((await boardEl.count()) >= 1, '#16 the survivors board leads the Scripts tab');
  const surv = boardEl.first().getByTestId('survivor');
  if (await surv.count()) {
    const lbl = (await surv.first().locator('.lsd-sv__count').getAttribute('aria-label')) ?? '';
    check(/^Survives \d+ of \d+ scripts$/.test(lbl), `#16 survivors read "Survives N of M" ("${lbl}", ${await surv.count()} rows)`);
    const chipLogos = await boardEl.first().locator('.lsd-sv__chips img.teammark--logo').count();
    check(chipLogos > 0, `#28 team logos in the survivor chips (${chipLogos})`);
  } else na('#16/#28 survivor rows and chip logos', `board shows its empty state: "${((await boardEl.first().innerText()).split('\n').pop() ?? '').trim()}"`);
  const chartLogos = await chart.locator('.lsd-chart__id img.teammark--logo').count();
  check(chartLogos > 0, `#28 team logos in the simulation split bars (${chartLogos})`);
  // #29: choosing a bar selects that script.
  const bars = chart.locator('.lsd-chart__b');
  const cur = ((await page.locator('#stab-h').textContent()) ?? '').trim();
  let pick = -1;
  for (let i = 0; i < (await bars.count()); i++) if (((await bars.nth(i).locator('.lsd-chart__n').textContent()) ?? '').trim() !== cur) { pick = i; break; }
  if (pick >= 0) {
    const want = ((await bars.nth(pick).locator('.lsd-chart__n').textContent()) ?? '').trim();
    await bars.nth(pick).click();
    await page.waitForURL(/script=/, { timeout: 15_000 });
    await page.waitForFunction((w) => document.querySelector('#stab-h')?.textContent?.trim() === w, want, { timeout: 15_000 }).catch(() => {});
    const now2 = ((await page.locator('#stab-h').textContent()) ?? '').trim();
    const on = (await bars.nth(pick).getAttribute('class')) ?? '';
    check(now2 === want && /is-on/.test(on), `#29 the simulation split control selects a script ("${cur}" → "${now2}")`);
  } else na('#29 split control selects a script', 'only one script in the split');
  // #14: the selected script lists the priced contracts it favours (or says plainly that none are linked).
  const ways = page.locator('#stab-mk');
  if (await ways.count()) {
    const sec = page.locator('section, article, div').filter({ has: ways }).last();
    const ex = await sec.locator('.lsd-ex__t').count();
    const miss = await sec.locator('.lsd-expr__miss').count();
    check(ex > 0 || miss > 0, `#14 "${((await ways.textContent()) ?? '').trim()}" lists ${ex} priced expression(s)${miss ? ' and names what is not linked' : ''}`);
  } else na('#14 ways to bet a script', 'no "Ways to bet" section on this game');
  await cleanText(page, '#35', 'Scripts tab');
  await overflow(page, ctx, 'Scripts tab');
  await page.screenshot({ path: `production-sprint-${dev}-scripts.png` });
}

async function matchupsCheck(page, ctx) {
  await gameTab(page, 'Matchups');
  await page.locator('#mx-basics').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => !/Loading box scores/.test(document.querySelector('#mx-basics')?.textContent ?? ''), null, { timeout: 60_000 }).catch(() => {});
  const basics = await page.locator('#mx-basics').innerText();
  check(/the basics/i.test(basics) && /#\d+/.test(basics), '#5 Matchups: The Basics with ranked box-score numbers');
  // #6: every basic says its denominator; ranks say "of N". #49: turnovers are a per-game count, never a percentage.
  check(/per game/i.test(basics) && /rank|#1 = best/i.test(basics), '#6 The Basics state their unit (per game) and what the rank means');
  // Each turnover row's values (.bx__v) must be plain per-game counts.
  const toVals = await page.locator('#mx-basics tr').evaluateAll((rows) => rows.filter((r) => /^(Turnovers|Takeaways) per game/.test((r.querySelector('th, td:nth-child(2)')?.textContent ?? '').trim()) || /(Turnovers|Takeaways) per game/.test(r.querySelector('[scope=row], .bx__m, .bx__l')?.textContent ?? '')).flatMap((r) => [...r.querySelectorAll('.bx__v')].map((v) => (v.textContent ?? '').trim())));
  check(toVals.length >= 2 && toVals.every((t) => /^\d+(\.\d+)?$/.test(t)), `#49 turnovers/takeaways read as per-game counts, never a percentage (${toVals.join(' · ')})`);
  // #7: adjusted / raw toggle switches the labels.
  const group = page.getByRole('group', { name: 'Team numbers: opponent-adjusted or raw' }).first();
  const subOf = async () => ((await page.locator('#mx-all .stratum__sub').textContent()) ?? '').trim();
  const tagsOf = async () => (await page.locator('#mx-all .svtag').allTextContents()).map((s) => s.trim());
  await group.getByRole('button', { name: /^Adjusted/ }).click();
  const adjSub = await subOf();
  const adjTags = await tagsOf();
  await group.getByRole('button', { name: /^Raw/ }).click();
  await page.waitForTimeout(300);
  const rawSub = await subOf();
  const rawTags = await tagsOf();
  const pressed = await group.getByRole('button', { name: /^Raw/ }).getAttribute('aria-pressed');
  check(pressed === 'true' && rawSub !== adjSub && /Raw/i.test(rawSub) && rawTags.some((t) => /^Raw/.test(t)) && adjTags.some((t) => /^Adjusted/.test(t)), `#7 adjusted/raw toggle switches the labels (adjusted tags ${adjTags.filter((t) => /^Adjusted/.test(t)).length}, raw tags ${rawTags.filter((t) => /^Raw/.test(t)).length})`);
  await group.getByRole('button', { name: /^Adjusted/ }).click();
  const units = await page.locator('#g-matchup article.ub').count();
  check(units > 0, `#23 unit-by-unit cards (${units})`);
  const scheme = page.locator('#mx-scheme');
  const schemeRows = await scheme.locator('.scb').count();
  const schemeText = await scheme.innerText();
  check(schemeRows > 0 || /No scheme tendencies are published/.test(schemeText), `#24 scheme tendencies board${schemeRows ? '' : ' (honest empty state)'}`);
  const chains = await scheme.locator('.spl__chain').count();
  const steps = await scheme.locator('.spl__step').count();
  const obsTag = await scheme.locator('.spl .lc-tier--obs').count();
  check((chains > 0 && steps >= chains * 2 && obsTag > 0) || /No charted tendency in this game is unusual enough/.test(schemeText), `#25 scheme meets players: ${chains} scheme→player chain(s), ${steps} labelled steps${chains ? '' : ' (honest empty state)'}`);
  const viz = await page.locator('#g-matchup .svd, #g-matchup .svm, #g-matchup .svp, #g-matchup .svx').count();
  check(viz > 0, `#47 statistical visualisations on the Matchups tab (${viz} rank/percentile/diverging marks)`);
  // #10: build a matchup — choosing other sides changes the duel.
  const bld = page.locator('#mx-build .bld');
  const t0 = ((await bld.locator('.bld__t').textContent()) ?? '').trim();
  await bld.getByRole('button', { name: 'Both offenses' }).click();
  const t1 = ((await bld.locator('.bld__t').textContent()) ?? '').trim();
  const opts = await bld.locator('select option').evaluateAll((os) => os.map((o) => o.value));
  const before = ((await bld.locator('.bld__c').textContent()) ?? '').trim();
  if (opts.length > 1) await bld.locator('select').selectOption(opts[opts.length - 1]);
  const after = ((await bld.locator('.bld__c').textContent()) ?? '').trim();
  check(t0 !== t1 && (opts.length < 2 || before !== after), `#10 build-a-matchup control changes the comparison ("${t0}" → "${t1}")`);
  await cleanText(page, '#35', 'Matchups tab');
  await overflow(page, ctx, 'Matchups tab');
  await page.screenshot({ path: `production-sprint-${dev}-matchups.png` });
}

async function playersCheck(page, ctx) {
  await gameTab(page, 'Players');
  await page.locator('.dch').waitFor({ timeout: 60_000 });
  const teams = await page.locator('.dch__team').count();
  const groups = await page.locator('.dch__team').evaluateAll((ts) => ts.map((t) => t.querySelectorAll('.dch__l li').length));
  check(teams === 2 && groups.every((n) => n > 0), `#34 Players tab depth chart for both teams (${groups.join(' / ')} players)`);
  await overflow(page, ctx, 'Players tab');
}

/** #27: tab switch keeps the tabs in view; a new screen opens at the top; back restores the place. */
async function scrollCheck(page) {
  await openGame(page, T.id);
  await page.getByRole('navigation', { name: 'Game sections' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const tabs = page.getByRole('navigation', { name: 'Game sections' });
  await tabs.getByRole('link', { name: 'Players', exact: true }).click();
  await page.waitForURL(/tab=players/);
  await page.waitForTimeout(400);
  const header = await page.locator('.topbar').boundingBox();
  const box = await tabs.boundingBox();
  const y = await scrollY(page);
  check(y > 100 && header && box && Math.abs(box.y - (header.y + header.height)) < 24, `#27 switching tabs keeps the tabs in view (scrollY ${y}, tabs ${Math.round(box?.y ?? -1)} vs header bottom ${Math.round((header?.y ?? 0) + (header?.height ?? 0))})`);
  const player = page.locator('main a[href*="/nfl/player/"]').nth(3);
  if (!(await player.count())) return na('#27 new screen at top / back restores', 'no player link on the Players tab');
  await player.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(300);
  const before = await scrollY(page);
  await player.click();
  await page.waitForURL(/\/nfl\/player\//);
  await page.locator('main h1').first().waitFor({ timeout: 30_000 });
  // The new screen resets after it renders (src/components/ScrollManager.tsx): give it a moment, then read.
  let top = await scrollY(page);
  for (let i = 0; i < 12 && top >= 5; i++) await page.waitForTimeout(250), (top = await scrollY(page));
  check(top < 5, `#27 navigating to another screen starts at the top (scrollY ${top})`);
  await page.goBack();
  await page.waitForURL(/tab=players/);
  let back = 0;
  for (let i = 0; i < 40 && Math.abs(back - before) >= 60; i++) back = await scrollY(page), await page.waitForTimeout(250);
  check(Math.abs(back - before) < 60, `#27 back restores the position approximately (${before} → ${back})`);
}

async function propExplorerCheck(page, ctx) {
  if (!T.pregame) return na('#17/#22/#30/#31/#32/#42 prop explorer', 'no pregame NFL game (props of started games are refused)');
  // From the app's own link: the /props hub's game strip opens the explorer for a game.
  await page.goto(BASE + '#/props');
  const link = page.locator(`a[href*="props?game=${T.id}"]`).first();
  if (await link.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)) await link.click();
  else await page.goto(`${BASE}#/nfl/props?game=${T.id}`);
  await page.getByRole('heading', { name: /^Prop explorer$/, level: 1 }).waitFor({ timeout: 60_000 });
  await page.locator('.pex__ph, .pex__list .muted').first().waitFor({ timeout: 90_000 });
  const players = (await page.locator('.pex__ph .pex__rb b').allTextContents()).map((s) => s.trim());
  if (!players.length) return na('#17 player-grouped markets', 'the game lists no player prop');
  const counts = await page.locator('.pex__ph .pex__rb small').allTextContents();
  check(new Set(players).size === players.length && counts.some((c) => /\b([2-9]|\d{2,}) markets\b/.test(c)), `#17 markets grouped by player (${players.length} players, each once; ${counts.filter((c) => /\d+ markets/.test(c)).length} with several markets)`);
  // Pick the player with the most markets, so the carousel has somewhere to go.
  const nOf = (c) => Number(c.match(/(\d+) markets?/)?.[1] ?? 0);
  const best = counts.map(nOf).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  await page.locator('.pex__ph').nth(best).click();
  await page.locator('#pexa-t').waitFor({ timeout: 30_000 });
  const track = page.locator('.pexa__mk .pcar__track').first();
  await track.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('.pexa__mk .pcar__track')?.clientWidth ?? 0) > 0, null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const geo = await track.evaluate((t) => ({ sw: t.scrollWidth, cw: t.clientWidth }));
  if (!geo.cw) check(false, '#22 market carousel is laid out (track has no width)');
  else if (geo.sw > geo.cw + 4) {
    const next = page.locator('.pexa__mk .pcar__nav--next');
    if (await next.isVisible().catch(() => false)) await next.click();
    else await track.evaluate((t) => t.scrollBy({ left: 240 }));
    await page.waitForTimeout(700);
    const left = await track.evaluate((t) => t.scrollLeft);
    check(left > 0, `#22 market carousel scrolls (${await page.locator('.pexa__mk .pmk').count()} markets, scrollLeft ${Math.round(left)})`);
  } else na('#22 market carousel scrolls', `the busiest player's ${await page.locator('.pexa__mk .pmk').count()} markets fit the width (${geo.sw}px in ${geo.cw}px)`);
  const perf = page.locator('.pexa__perf');
  await perf.locator('.hsum2, .pchart, .fr-note, [class*=cap]').first().waitFor({ timeout: 60_000 }).catch(() => {});
  const wins = perf.getByRole('group', { name: 'History window' }).getByRole('button');
  if (await wins.count()) {
    check(await perf.locator('.pchart svg').first().isVisible().catch(() => false), '#30 performance chart is drawn');
    const seen = [];
    let ok = true;
    for (let i = 0; i < (await wins.count()); i++) {
      const n = Number(((await wins.nth(i).locator('.pexa__wn').textContent()) ?? '').trim());
      await wins.nth(i).click();
      await page.waitForTimeout(250);
      const big = ((await perf.locator('.hsum2__big').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
      const k = ((await perf.locator('.hsum2__k').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
      if (big && Number(big.match(/of (\d+)/)?.[1]) !== n) ok = false;
      seen.push(`${n}:${big || '—'}`);
      if (k) seen.k = [...(seen.k ?? []), k];
    }
    const distinct = new Set(seen.k ?? []).size;
    check(ok && distinct >= Math.min(2, (await wins.count())), `#31/#32 window filters change the "n of N over" text (${seen.join(' · ')})`);
  } else na('#30/#31 chart and window filters', ((await perf.innerText()).split('\n').find((l) => /No game log|No priced/.test(l)) ?? 'no game log for this player').trim());
  const use = await page.locator('#pexa-use').count();
  check(use === 1, '#42 Usage & role panel present');
  const t = await mainText(page);
  check(!/% chance/i.test(t), '#32 prop explorer never says "% chance"');
  await cleanText(page, '#35', 'prop explorer');
  await overflow(page, ctx, 'prop explorer');
  await page.screenshot({ path: `production-sprint-${dev}-props.png` });
}

async function marketsCheck(page, ctx) {
  await openGame(page, T.id);
  await gameTab(page, 'Markets');
  const top = page.getByTestId('top-markets');
  await top.waitFor({ timeout: 60_000 });
  const chips = top.getByRole('group', { name: 'Market type' }).getByRole('button');
  const res = [];
  let ok = true;
  for (let i = 0; i < (await chips.count()); i++) {
    await chips.nth(i).click();
    const label = ((await chips.nth(i).textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const n = Number(((await chips.nth(i).locator('small').textContent()) ?? '').trim());
    // The table opens on the top rows; "Show all N" lists every contract the chip counts.
    const more = top.getByRole('button', { name: /^Show all \d+$/ });
    if (await more.isVisible().catch(() => false)) await more.click();
    const rows = await top.locator('tbody tr').count();
    res.push(`${label}=${rows}`);
    if (rows !== n || rows === 0) ok = false;
  }
  if (res.length) check(ok, `#38 Markets tab: every category chip's count equals its visible rows (${res.join(' · ')})`);
  else na('#38 category chips', 'no priced contract on this game');
  const moves = page.getByTestId('price-moves');
  await moves.waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => !/Loading price history/.test(document.querySelector('[data-testid=price-moves]')?.textContent ?? ''), null, { timeout: 60_000 }).catch(() => {});
  const mv = await moves.getByTestId('price-move').count();
  const mt = (await moves.innerText().catch(() => '')) ?? '';
  check((await moves.count()) === 1 && (mv > 0 ? /Opened \d+¢/.test(mt) : /No capture history/.test(mt)), `#41 price moves present (${mv} lines) or an honest empty state`);
  // #37: the full market board has one search across every section.
  const filter = page.locator('input.mboard__filter').first();
  if (await filter.count()) {
    await filter.scrollIntoViewIfNeeded().catch(() => {});
    const q = T.home.nick || T.home.abbr;
    await filter.fill(q);
    await page.waitForTimeout(600);
    const hits = await page.locator('.mboard').first().innerText().then((t) => t.split(q).length - 1).catch(() => 0);
    check(hits > 0, `#37 the market board search finds "${q}" across sections (${hits} matches)`);
    await filter.fill('');
  } else na('#37 market board search', 'the full market board is not on this tab');
  await cleanText(page, '#35', 'Markets tab');
  await overflow(page, ctx, 'Markets tab');
  const teaser = page.getByRole('link', { name: /Teasers & parlays/ }).first();
  if (await teaser.isVisible().catch(() => false)) {
    await teaser.click();
    const h = await page.getByRole('heading', { name: /^Parlays & Teasers$/, level: 1 }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
    check(h, '#40 teasers & parlays reachable from the game Markets tab');
    await overflow(page, ctx, 'Parlays & Teasers');
  } else na('#40 teaser link on the game Markets rail', 'rail link not shown at this width');
}

async function marketBoardCheck(page, ctx) {
  await page.getByRole('navigation', { name: ctx.phone ? 'Destinations' : 'Primary' }).getByRole('link', { name: 'Intelligence' }).click();
  await page.getByRole('heading', { name: /^Terminal$/, level: 1 }).waitFor({ timeout: 60_000 });
  // #51/#52 Terminal: the selected discovery explains what it means and where to research it.
  const rows = page.locator('button.trow');
  await rows.first().waitFor({ timeout: 60_000 }).catch(() => {});
  if (await rows.count()) {
    await rows.nth(Math.min(1, (await rows.count()) - 1)).click();
    const means = page.locator('.tm-means');
    await means.waitFor({ timeout: 30_000 });
    const t = (await means.innerText()).replace(/\s+/g, ' ');
    const links = await means.getByRole('list', { name: 'Research this leads to' }).getByRole('link').count();
    check(/What it means/i.test(t) && links > 0, `#51/#52 Terminal discovery shows "What it means" with ${links} research link(s)`);
  } else na('#51/#52 Terminal discoveries', 'no discovery on the board');
  await cleanText(page, '#35', 'Terminal');
  await overflow(page, ctx, 'Terminal');
  await page.getByRole('navigation', { name: 'Intelligence' }).getByRole('link', { name: /Market board/ }).click();
  await page.getByRole('heading', { name: /^Market board$/, level: 1 }).waitFor({ timeout: 60_000 });
  const browse = page.getByTestId('browse-board');
  const ok = await browse.waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  const cards = await browse.getByTestId('event-card').count();
  check(ok && (await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Browse' }).getAttribute('aria-pressed')) === 'true' && (cards > 0 || /No |Nothing/.test(await browse.innerText())), `#40 Intelligence → Market board opens in Browse view (${cards} game cards)`);
  check((await page.locator('a.lmb__promo').count()) === 1, '#40 teasers & parlays discoverable on the Market board');
  await overflow(page, ctx, 'Market board');
  await page.screenshot({ path: `production-sprint-${dev}-market-board.png` });
  // #39: a game with two or more opportunities shows the comparison studio.
  const multi = browse.getByTestId('event-card').filter({ has: page.locator('.lmb__rows > li:nth-child(2)') }).filter({ has: page.locator('a[href*="/nfl/game/"], a[href*="/game/"]') });
  if (await multi.count()) {
    const label = ((await multi.first().locator('.lmb__ev').textContent()) ?? '').trim();
    await multi.first().locator('.lmb__open').click();
    const studio = page.getByTestId('market-compare');
    const seen = await studio.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
    const cols = seen ? await studio.locator('select[aria-label^="Column"]').count() : 0;
    check(seen && cols >= 2, `#39 Market Comparison Studio renders side by side (${label}: ${cols} columns)`);
    if (seen) await overflow(page, ctx, 'game with comparison studio');
  } else na('#39 comparison studio', 'no game on the Market board has two or more opportunities');
}

async function seasonCheck(page, ctx) {
  await page.goto(BASE + '#/explore?sport=nfl');
  await page.getByRole('heading', { name: /^Research Lab$/, level: 1 }).waitFor({ timeout: 60_000 });
  const tool = page.locator('.ex-toolgrid > li').filter({ hasText: 'Season' }).getByRole('link').first();
  if (await tool.count()) await tool.click();
  else await page.goto(BASE + '#/nfl/season');
  await page.getByRole('heading', { name: /^Season navigator$/, level: 1 }).waitFor({ timeout: 60_000 });
  await page.locator('.swk-grid > .swk, .sn-games, .bempty').first().waitFor({ timeout: 60_000 });
  const tiles = await page.locator('.swk-grid > .swk').count();
  const wk = ((await page.locator('#wk-h').textContent()) ?? '').trim();
  check(tiles > 0, `#46 Season view: ${wk} as matchup tiles (${tiles})`);
  let finals = Number(((await page.locator('.sn-week__sum').textContent().catch(() => '')) ?? '').match(/^\s*(\d+)/)?.[1] ?? 0);
  for (let i = 0; i < 3 && !finals; i++) {
    const prev = page.getByRole('button', { name: 'Previous week' });
    if (await prev.isDisabled()) break;
    await prev.click();
    await page.waitForTimeout(600);
    finals = Number(((await page.locator('.sn-week__sum').textContent().catch(() => '')) ?? '').match(/^\s*(\d+)/)?.[1] ?? 0);
  }
  if (finals) {
    const fin = page.locator('.swk-grid > .swk').filter({ has: page.locator('.gc-ats') }).first();
    const scores = await fin.locator('.gc-team__sc').allTextContents();
    const ats = ((await fin.locator('.gc-ats').first().textContent()) ?? '').trim();
    check(scores.length === 2 && scores.every((s) => /^\d+$/.test(s.trim())) && /covered|did not cover|push|Pick’em|Over|Under/i.test(ats), `#50 a final shows its score and ATS mark (${scores.join('–')}, "${ats}"; ${((await page.locator('#wk-h').textContent()) ?? '').trim()})`);
  } else na('#50 final score and ATS mark', 'no final in the season so far');
  await cleanText(page, '#35', 'Season view');
  await overflow(page, ctx, 'Season view');
}

async function teamCompareCheck(page, ctx) {
  await page.goto(`${BASE}#/nfl/team/${encodeURIComponent(T.home.pid)}`);
  await page.locator('main h1').first().waitFor({ timeout: 60_000 });
  const pick = page.locator('label', { hasText: 'Compare with' }).locator('select').first();
  await pick.waitFor({ timeout: 60_000 });
  await pick.selectOption(T.away.pid);
  await page.waitForURL(/\/nfl\/compare\?/, { timeout: 30_000 });
  await page.locator('.tcm__head').waitFor({ timeout: 60_000 });
  const heads = await page.locator('.tcm__head > *:not(.tcm__vs)').count();
  const logos = await page.locator('.tcm__head img.teammark--logo').count();
  const text = await mainText(page);
  check(heads === 2 && logos >= 2 && text.includes(T.home.nick) && text.includes(T.away.nick) && (await page.locator('#tc-basics').count()) === 1, `#26 team compare renders two teams (${T.home.abbr} vs ${T.away.abbr}: ${logos} logos, basics present)`);
  await cleanText(page, '#35', 'team compare');
  await overflow(page, ctx, 'team compare');
}

async function gamesPageCheck(page, ctx) {
  await page.getByRole('navigation', { name: ctx.phone ? 'Destinations' : 'Primary' }).getByRole('link', { name: 'Games' }).click();
  await page.getByRole('heading', { name: /^Games$/, level: 1 }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const words = await page.locator('.gc-edge').evaluateAll((els) => els.map((e) => ({ t: (e.textContent ?? '').trim(), back: e.classList.contains('dword--back') })));
  const bad = words.filter((w) => !INDICATOR_WORDS.some((x) => w.t === x || w.t.startsWith(`${x} · `)) || (w.back !== w.t.startsWith('Back')));
  if (words.length) check(bad.length === 0, `#21 Games page indicators use only the allowed words (${words.length}${bad.length ? `; bad: ${bad.map((b) => b.t).join(' | ')}` : ''})`);
  else na('#21 Games page indicators', 'no card carries an indicator');
  await cleanText(page, '#35', 'Games');
  await overflow(page, ctx, 'Games');
}

// ------------------------------------------------------------------ devices
const proxyLaunch = (type) => {
  if (!PROXY) return {};
  return type === chromium
    ? { args: [`--proxy-server=${PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1', '--ignore-certificate-errors'] }
    : { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' } };
};
const DEVICES = [
  ['chromium-desktop', chromium, { viewport: { width: 1280, height: 900 } }, 'full'],
  ['chromium-phone', chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 'full'],
  ['webkit-iphone', webkit, { viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true }, 'lite'],
];
const roofs = await roofGames().catch((e) => (check(false, `#3 read the current games' venues (${String(e)})`), []));

for (const [name, type, device, depth] of DEVICES) {
  dev = name;
  console.log(`\n${name}`);
  let browser;
  try {
    browser = await type.launch(proxyLaunch(type));
  } catch (e) {
    na(`${name} pass`, `${name.split('-')[0]} is not installed here: ${String(e.message ?? e).split('\n')[0].slice(0, 80)}`);
    continue;
  }
  const ctx = { phone: device.viewport.width < 600 };
  const sink = { errors: [], blocked: [], playerImages: 0 };
  const context = await browser.newContext({ ...device, serviceWorkers: 'block', ...(PROXY ? { ignoreHTTPSErrors: true } : {}) });
  const page = await context.newPage();
  watch(page, sink);
  try {
    await step(page, 'nav', () => navCheck(page, ctx));
    await step(page, 'home', () => homeCheck(page, ctx));
    if (!T) {
      na('#1/#3/#8/#5/#17/#27/#38 game-page checks', 'the NFL board lists no game');
    } else {
      await step(page, 'hero', () => heroCheck(page, ctx));
      if (depth === 'full') {
        if (name === 'chromium-desktop') {
          await step(page, 'weather', () => weatherCheck(page, roofs));
          await step(page, 'provenance', () => provenanceCheck(page, ctx));
        }
        await step(page, 'scripts', () => scriptsCheck(page, ctx));
        await step(page, 'matchups', () => matchupsCheck(page, ctx));
        await step(page, 'players', () => playersCheck(page, ctx));
        await step(page, 'scroll', () => scrollCheck(page));
        await step(page, 'markets', () => marketsCheck(page, ctx));
        await step(page, 'prop explorer', () => propExplorerCheck(page, ctx));
        await step(page, 'team compare', () => teamCompareCheck(page, ctx));
      } else {
        const g = roofs.find((x) => x.id === T.id && (x.roof === 'dome' || x.roof === 'retractable'));
        if (g) await step(page, 'weather', () => weatherCheck(page, [g]));
      }
    }
    if (depth === 'full') {
      await step(page, 'games', () => gamesPageCheck(page, ctx));
      await step(page, 'props hub', () => propsHubCheck(page, ctx));
      await step(page, 'research lab', () => researchLabCheck(page, ctx));
      await step(page, 'season', () => seasonCheck(page, ctx));
      await step(page, 'intelligence', () => marketBoardCheck(page, ctx));
    }
    console.log(`  player photos requested: ${sink.playerImages}`);
    check(sink.blocked.length === 0, `#11/#36 no blocklisted player image requested${sink.blocked.length ? ` (${[...new Set(sink.blocked)].slice(0, 3).join(', ')})` : ''}`);
    check(sink.errors.length === 0, `no console errors / page errors${sink.errors.length ? ` (${sink.errors.slice(0, 3).join(' | ')})` : ''}`);
  } finally {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await browser.close();
  }
}

console.log(`\n${passes} PASS · ${nas} N/A · ${failures.length} FAIL`);
if (failures.length) {
  console.error(`\nSPRINT PRODUCTION CHECK FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nsprint production check OK');
