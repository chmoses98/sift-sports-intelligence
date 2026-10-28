// Mobile performance of every SIFT 3.0 screen, measured the way scripts/v3-qa/props-perf.mjs measures Prop Discovery, but from the COMMITTED
// fixture bundle (fixtures/real, selected by family: e2e/support/feedSource.ts) instead of a scratch disk cache.
//
//   * Documents: a local HTTP/2 + TLS server answers for raw.githubusercontent.com (Chromium --host-resolver-rules), serving the family's
//     committed documents gzip-encoded with `cache-control: max-age=300` like GitHub; a document the family does not have answers 404.
//     Bytes are the browser's own (CDP Network.loadingFinished encodedDataLength: bytes on the wire, headers included). Every other host is
//     unresolvable. `--no-proxy-server` is required in this sandbox (HTTPS_PROXY would otherwise send requests to the live network).
//   * App code: DIST=<vite build output> is served gzip-encoded under the same throttle (what a phone downloads).
//   * Throttle: 9 Mbit/s down, 1.5 Mbit/s up, 170 ms added latency, CPU 4x, viewport 390x844 at 2x, touch. Service workers blocked.
//   * Clock: the family's pinned instant (the page's Date is fixed there so the captured slate is "now"; quote observation times are
//     re-stamped to it exactly as e2e/support/realFeeds.ts freshQuotes / playerFeeds.ts do: timestamps only, every price is the published one).
//   * Times are in-page performance.now() from navigation start. FIRST MEANINGFUL CONTENT is defined per screen (SCREENS[x].content): the
//     first frame in which the real data the screen exists to show is painted, never a skeleton or an empty header. INTERACTIVE = the first
//     1 s window after that without a task over 100 ms. TAP-TO-PAINT = pointerup of a tap to the frame that shows its result.
//
// Usage:  DIST=dist SCREEN=games RUNS=5 node --experimental-strip-types scripts/v3-qa/screens-perf.mjs
//         SCREEN=all runs every screen. DIST="before=/old/dist,after=/new/dist" alternates the builds run by run (a shared machine hits both alike).
//         Env: OUT (JSON report), URLS_OUT (documents of run 1), NOTHROTTLE=1, INTERACT=0, PROBE=1 (print what is on screen), APP_H1=1 (serve the app over
//         HTTP/1.1), SW=1 (allow service workers), PROFILE=1 + PROFILE_OUT=<prefix> (CPU profile), TRACE_OUT=<prefix> (Chrome trace), CONSOLE=1 (page console).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const { feedSource } = await import('../../e2e/support/feedSource.ts');
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const runs = Number(process.env.RUNS ?? 3);
const interact = process.env.INTERACT !== '0';
const throttle = process.env.NOTHROTTLE !== '1';
const BASE_PATH = '/sift-sports-intelligence/';

const NFL_GAME = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3';
const LAMB = '/v3/player/nfl/prt_4c661ae8b854ff5f66dd';

/**
 * family: the fixture family. content: the selector whose presence (with height) is "first meaningful content".
 * taps: [{ name, tap: (page) => Promise, done: in-page expression true once the tap's result is painted, reset?: () => Promise }]
 */
const SETTLED = `!document.querySelector('main .v3-skel, main [aria-label=Loading]')`;
/** A tab tap: done once that tab is selected and nothing on the screen is a skeleton any more. */
const tabTap = (name) => ({
  name: `tab ${name}`,
  tap: (p) => p.getByRole('tab', { name: new RegExp(`^${name}`) }).first().tap(),
  done: `[...document.querySelectorAll('[role=tab][aria-selected=true]')].some((e) => /^${name}/.test(e.textContent.trim())) && ${SETTLED}`,
});
const price = (sel) => `/\\d\u00a2/.test(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '')`;
const railTap = (label, idx) => ({ name: `sport chip ${label}`, tap: (p) => p.locator('.v3-rail__t').nth(idx).tap(), done: `document.querySelector('.v3-rail__t[aria-selected=true]')?.textContent === ${JSON.stringify(label)} && ${SETTLED}` });
const stateTap = (label) => ({ name: `state chip ${label}`, tap: (p) => p.locator('.v3-chips--states .v3-chip', { hasText: new RegExp(`^${label}`) }).first().tap(), done: `new RegExp('^${label}').test(document.querySelector('.v3-chips--states .v3-chip[aria-pressed=true]')?.textContent ?? '') && ${SETTLED}` });
const openGame = (name, from) => ({ name, tap: (p) => p.locator(from).first().tap(), done: `!!document.querySelector('.v3-gh__n')`, back: (p) => p.goBack() });
const FOLLOWS = { 'sift3.follows': { teams: ['nfl:DAL'], players: ['nfl:prt_4c661ae8b854ff5f66dd'], games: [] } };

/**
 * FIRST MEANINGFUL CONTENT per screen (content selector present with height AND the `ready` expression true, then two animation frames):
 *   home       the featured game card with both teams (and the scoreboard strip above it)
 *   games      NFL, Upcoming: the first game card with its Kalshi lines box showing a price in cents
 *   game       Game Detail overview: the "Win price" card showing a price in cents
 *   player     Lamb: the Overview's evidence lanes (Market square, History ring, SIFT diamond) painted with a price in cents
 *   team       DAL: the first Overview card painted from the team profile (rank text such as "5th of 28" on screen)
 *   stat       adj_off_epa: the ranked list of teams (first rank row)
 *   following  with DAL and Lamb followed: the tracked-game row of the followed team
 *   explore    the "What's Trending" list (real games from the slate)
 *   props      the first prop row or card (the H-B definition)
 */
const SCREENS = {
  home: { family: 'game', route: '/v3', content: '.v3-feat__mid', taps: [
    { name: 'sport chip NFL', tap: (p) => p.locator('.v3-chips--home .v3-chip').nth(1).tap(), done: `document.querySelector('.v3-chips--home .v3-chip[aria-pressed=true]')?.textContent !== 'For You'` },
    { name: 'open game', tap: (p) => p.locator('.v3-feat__hit').first().tap(), done: `!!document.querySelector('.v3-gh__n')`, back: (p) => p.goBack() },
  ] },
  games: { family: 'game', route: '/v3/games?sport=nfl&state=upcoming', content: '.v3-lines__r em', ready: price('.v3-lines__r em'), taps: [
    railTap('NBA', 2), stateTap('Final'), stateTap('Upcoming'), railTap('NFL', 1), openGame('open game', '.v3-gc__hit'),
  ] },
  game: { family: 'game', route: NFL_GAME, content: '.mx-win .num', ready: price('.mx-win .num'), taps: [tabTap('Matchup'), tabTap('Props'), tabTap('Overview')] },
  player: { family: 'player', route: LAMB, content: '.v3p-lane', ready: price('main'), taps: [tabTap('Props'), tabTap('Matchup'), tabTap('Trends'), tabTap('Log')] },
  team: { family: 'team', route: '/v3/team/nfl/DAL', content: '.tm-card', ready: `/\\d(st|nd|rd|th)\\s+of\\s+\\d+/.test(document.querySelector('main')?.innerText ?? '')`, taps: [tabTap('Players'), tabTap('Schedule'), tabTap('Form')] },
  stat: { family: 'stat', route: '/v3/stat/nfl/adj_off_epa', content: '.st-rkr', taps: [tabTap('Trend'), tabTap('Compare'), tabTap('About')] },
  following: { family: 'game', route: '/v3/following', seed: FOLLOWS, content: '.v3-fgs li', taps: [] },
  explore: { family: 'game', route: '/v3/explore', content: '.v3-explore .v3-hit', taps: [
    { name: 'search lamb', tap: async (p) => { await p.locator('.v3-explore input').tap(); await p.keyboard.type('lamb'); }, done: `[...document.querySelectorAll('.v3-explore .v3-hit')].some((e) => /lamb/i.test(e.textContent))` },
  ] },
  props: { family: 'props', route: '/v3/props?view=list', content: '.pd-row, .pd-card', taps: [] },
};
const names = process.env.SCREEN === 'all' || !process.env.SCREEN ? Object.keys(SCREENS) : process.env.SCREEN.split(',');

// ---------------------------------------------------------------- the published documents, served the way GitHub serves them
const sources = new Map();
const src = (family) => { if (!sources.has(family)) sources.set(family, feedSource(family)); return sources.get(family); };
const gz = new Map();
let active = { family: 'game', now: new Date() };

function stampBody(family, url, body) {
  if (!/\/live-quotes\/games\/[^/]+\.json/.test(url) && family !== 'player') return body;
  let doc;
  try { doc = JSON.parse(body.toString('utf8')); } catch { return body; }
  if (!Array.isArray(doc?.markets)) return body;
  const now = active.stampAt.toISOString();
  if (doc.schema === 'sift.live_quotes.v1' || /\/live-quotes\//.test(url)) { doc.generated_at = now; doc.markets = doc.markets.map((m) => ({ ...m, observed_at: now })); }
  else if (family === 'player' && doc.kind === 'event_detail') { for (const m of doc.markets) if (m.captured_at) m.captured_at = now; }
  else return body;
  return Buffer.from(JSON.stringify(doc));
}

async function answer(url, accept) {
  const d = await src(active.family).get(url).catch(() => null);
  if (!d) return { status: 404, body: Buffer.from('not found'), headers: { 'access-control-allow-origin': '*' } };
  const body = stampBody(active.family, url, d.body);
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=300', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };
  if (/gzip/.test(accept ?? '')) {
    const k = active.family + url;
    let z = gz.get(k);
    if (!z) { z = gzipSync(body, { level: 6 }); gz.set(k, z); }
    return { status: 200, body: z, headers: { ...headers, 'content-encoding': 'gzip' } };
  }
  return { status: 200, body, headers };
}

const certDir = mkdtempSync(join(tmpdir(), 'v3-perf-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem'), '-days', '2', '-subj', '/CN=raw.githubusercontent.com', '-addext', 'subjectAltName=DNS:raw.githubusercontent.com,DNS:localhost'], { stdio: 'ignore' });
const tls = { key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')), allowHTTP1: true };

function startFeedServer() {
  const server = http2.createSecureServer(tls, async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(); return; }
    const a = await answer(`https://raw.githubusercontent.com${req.url}`, req.headers['accept-encoding']);
    if (req.method === 'HEAD') { res.writeHead(a.status, { ...a.headers, 'content-length': String(a.body.length) }); res.end(); return; }
    res.writeHead(a.status, a.headers);
    res.end(a.body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- the app: a build output served gzip-encoded
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// GitHub Pages serves over HTTP/2: so does this (APP_H1=1 serves HTTP/1.1 instead, six connections, for comparison).
function startAppServer(dist) {
  const handler = (req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length - 1);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(dist, p));
    if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('not found'); return; }
    let body = readFileSync(f);
    const h = { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=300' };
    if (/\.(html|js|css|json|svg|webmanifest)$/.test(f) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gzipSync(body, { level: 6 }); h['content-encoding'] = 'gzip'; }
    res.writeHead(200, h);
    res.end(body);
  };
  const server = process.env.APP_H1 === '1' ? http.createServer(handler) : http2.createSecureServer(tls, handler);
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- measurements
const kind = (u) => {
  if (!/raw\.githubusercontent\.com/.test(u)) return null;
  if (/\/event_detail\//.test(u)) return 'event_detail';
  if (/\/explorer\/events\//.test(u)) return 'event_research(injuries)';
  if (/\/explorer\/rankings\//.test(u)) return 'ranking';
  if (/\/explorer\/teams\//.test(u)) return 'team_profile';
  if (/\/explorer\/players\//.test(u)) return 'player_profile';
  if (/\/explorer\/metrics/.test(u)) return 'explorer_metrics';
  if (/\/explorer\/index/.test(u)) return 'explorer_index';
  if (/\/explorer\/schedule|\/explorer\/games|\/explorer\/season/.test(u)) return 'schedule';
  if (/live-quotes/.test(u)) return 'quote_feed';
  if (/projections\//.test(u)) return 'projection';
  if (/\/data\/nfl\/history\/players\//.test(u)) return 'game_log';
  if (/\/data\/nfl\/history\//.test(u)) return 'history_index';
  if (/scores?/.test(u)) return 'scores';
  return 'slate/other';
};
const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const round = (n, d = 0) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

const initScript = (scr, nowMs) => `
(() => {
  const F = ${nowMs}, RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } }
  window.Date = FD;
  const w = window; w.__pm = { first: null, lt: [] };
  const sel = ${JSON.stringify(scr.content)};
  const ready = () => { try { return ${scr.ready ?? 'true'}; } catch { return false; } };
  const seen = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().height > 0 && ready()) { mo.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => { w.__pm.first = performance.now(); })); } };
  const mo = new MutationObserver(seen); mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__pm.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { for (const [k, v] of Object.entries(${JSON.stringify(scr.seed ?? {})})) localStorage.setItem(k, JSON.stringify(v)); } catch {}
})();`;

async function tapToPaint(page, tap, done, timeout = 15000) {
  await page.evaluate(({ done, timeout }) => {
    window.__tap = new Promise((res) => {
      let t0 = null;
      const up = (e) => { if (t0 == null) t0 = e.timeStamp; };
      addEventListener('pointerup', up, true);
      const t = performance.now();
      const frame = () => {
        if (t0 != null && eval(done)) { setTimeout(() => { removeEventListener('pointerup', up, true); res(performance.now() - t0); }, 0); return; }
        if (performance.now() - t > timeout) { removeEventListener('pointerup', up, true); res(null); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }, { done, timeout });
  await tap();
  return page.evaluate(() => window.__tap);
}

async function oneRun(browser, name, scr, appUrl, i) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: process.env.SW === '1' ? 'allow' : 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(initScript(scr, active.now.getTime()));
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  if (process.env.CONSOLE) page.on('console', (m) => { if (/EARLY|MARK/.test(m.text())) console.error(name, m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { reqs.set(e.requestId, { method: e.request.method, url: e.request.url, type: e.type, t: e.timestamp, bytes: 0, status: null, done: false }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.status = e.response.status; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; r.tEnd = e.timestamp; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = true; r.err = e.errorText + (e.blockedReason ? ' ' + e.blockedReason : '') + (e.corsErrorStatus ? ' cors:' + e.corsErrorStatus.corsError : ''); r.tEnd = e.timestamp; } });
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  if (process.env.TRACE_OUT) await browser.startTracing(page, { categories: ['devtools.timeline', 'v8', 'disabled-by-default-devtools.timeline'] });
  await page.goto(appUrl, { waitUntil: 'commit' });
  let timedOut = false;
  await page.waitForFunction(() => window.__pm?.first != null, null, { timeout: 120000 }).catch(() => { timedOut = true; });
  if (timedOut && process.env.PROBE) { console.error(name, 'content selector never appeared; body text:', (await page.evaluate(() => document.body.innerText.slice(0, 600)))); }
  const pm0 = await page.evaluate(() => ({ first: window.__pm.first }));
  const firstTs = Math.min(...[...reqs.values()].map((r) => r.t));
  const cut = firstTs + (pm0.first ?? 0) / 1000;
  const doneAt = [...reqs.values()].filter((r) => r.done && r.tEnd <= cut);
  const atFirst = {
    documents: doneAt.filter((r) => kind(r.url)).length,
    documentBytes: doneAt.filter((r) => kind(r.url)).reduce((a, r) => a + r.bytes, 0),
    requests: doneAt.length, bytes: doneAt.reduce((a, r) => a + r.bytes, 0),
  };
  let lastCount = -1, still = 0;
  for (let k = 0; k < 50 && still < 4; k++) { await page.waitForTimeout(500); const n = [...reqs.values()].filter((r) => r.done || r.failed).length; if (n === lastCount) still++; else { still = 0; lastCount = n; } }
  await page.waitForTimeout(2200);
  let profileTop = null;
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    if (process.env.PROFILE_OUT) writeFileSync(`${process.env.PROFILE_OUT}.${name}.json`, JSON.stringify(profile));
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, k) => { const n = byId.get(id); const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[k] ?? 0)); });
    profileTop = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, round(v / 1000)]);
  }
  if (process.env.TRACE_OUT) writeFileSync(`${process.env.TRACE_OUT}.${name}.json`, await browser.stopTracing());
  const pm = await page.evaluate(() => ({ first: window.__pm.first, lt: window.__pm.lt }));
  const lt = pm.lt.map(([s, d]) => [s, s + d]).sort((a, b) => a[0] - b[0]);
  const first = pm.first ?? NaN;
  let tti = first;
  for (const [s0, e0] of lt) { if (e0 <= first || e0 - s0 < 100) continue; if (s0 - tti >= 1000) break; tti = Math.max(tti, e0); }
  const tbt = lt.filter(([s0]) => s0 < tti).reduce((a, [s0, e0]) => a + Math.max(0, e0 - s0 - 50), 0);

  const all = [...reqs.values()];
  const docs = all.filter((r) => kind(r.url));
  const byKind = {};
  for (const r of docs) { const k = kind(r.url); byKind[k] ??= { n: 0, bytes: 0, missing: 0 }; byKind[k].n++; byKind[k].bytes += r.bytes; if (r.status === 404) byKind[k].missing++; }
  const code = all.filter((r) => !kind(r.url) && /Script|Stylesheet|Font|Document/.test(r.type ?? ''));
  const res = {
    run: i, profileTop,
    firstContentMs: pm.first == null ? null : round(pm.first), interactiveMs: pm.first == null ? null : round(tti), totalBlockingMs: round(tbt), longTasks: lt.length, longTaskList: lt.map(([a, b]) => [round(a), round(b - a)]),
    atFirstContent: atFirst,
    documents: { count: docs.length, bytes: docs.reduce((a, r) => a + r.bytes, 0), missing404: docs.filter((r) => r.status === 404).length, byKind },
    appCode: { requests: code.length, bytes: code.reduce((a, r) => a + r.bytes, 0) },
    timeline: all.filter((r) => r.done).map((r) => [round((r.t - firstTs) * 1000), round((r.tEnd - firstTs) * 1000), r.bytes, r.method, r.url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/(sift-sports-intelligence|chmoses98)\//, '')]).sort((a, b) => a[0] - b[0]),
    codeList: code.map((r) => [r.type, r.bytes, r.url.split('/').pop()]),
    allRequests: { count: all.length, bytes: all.reduce((a, r) => a + r.bytes, 0), failed: all.filter((r) => r.failed).length, failedUrls: all.filter((r) => r.failed).map((r) => `${r.method} ${r.err} ${r.url}`) },
    urls: docs.map((r) => ({ t: round((r.t - firstTs) * 1000), url: `${r.method} ${r.url}`, bytes: r.bytes, status: r.status })),
    taps: {},
  };
  if (interact && pm.first != null) {
    for (const t of scr.taps ?? []) {
      try { res.taps[t.name] = round(await tapToPaint(page, () => t.tap(page), t.done)); } catch (e) { res.taps[t.name] = null; if (process.env.PROBE) console.error(name, t.name, String(e).slice(0, 200)); }
      await page.waitForTimeout(1200);
      if (process.env.PROBE) console.error(name, `after "${t.name}" (${res.taps[t.name]} ms):`, await page.evaluate(() => `${location.hash} | ${document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 260)}`));
      if (t.back) { try { await t.back(page); } catch { /* ignore */ } await page.waitForTimeout(800); }
    }
    res.documentsAfterTaps = reqs.size - all.length;
  }
  if (process.env.PROBE) {
    console.error(name, 'rendered:', await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 500)));
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/${name}.png` });
  }
  await ctx.close();
  return res;
}

const feed = await startFeedServer();
// DIST is one build output, or several to compare: DIST="before=/path/a,after=/path/b". With several, the runs ALTERNATE between them (run 1 of each, run 2 of each,
// ...) so a loaded machine (this one is shared) hits every build alike; each build's medians are reported under "<screen>@<label>".
const dists = (process.env.DIST ?? '').split(',').filter(Boolean).map((d, i) => {
  const [label, path] = d.includes('=') ? d.split('=') : [`b${i}`, d];
  return { label, path: path.startsWith('/') ? path : join(process.cwd(), path) };
});
const apps = [];
for (const d of dists) apps.push({ ...d, ...(await startAppServer(d.path)) });
const originOf = (app) => (app ? `${process.env.APP_H1 === '1' ? 'http' : 'https'}://localhost:${app.port}` : new URL(process.env.BASE ?? 'http://localhost:5173/sift-sports-intelligence/').origin);
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: [`--host-resolver-rules=MAP raw.githubusercontent.com 127.0.0.1:${feed.port}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--ignore-certificate-errors', '--no-proxy-server'],
});
const report = {};
try {
  for (const name of names) {
    const scr = SCREENS[name];
    if (!scr) throw new Error(`unknown screen ${name}`);
    const fam = src(scr.family);
    const clock = fam.clock();
    // The player family's page clock is its stamp plus 5 s (e2e/support/playerFeeds.ts PAGE_NOW); the others pin the page to the capture instant.
    active = { family: scr.family, now: scr.family === 'player' ? new Date(clock.getTime() + 5000) : clock, stampAt: clock };
    const targets = apps.length ? apps : [null];
    const all = new Map(targets.map((t) => [t?.label ?? '', []]));
    for (let i = 0; i < runs; i++) {
      for (const t of targets) all.get(t?.label ?? '').push(await oneRun(browser, name, scr, `${originOf(t)}${BASE_PATH}#${scr.route}`, i + 1));
    }
    for (const t of targets) {
      const results = all.get(t?.label ?? '');
      const m = (f) => median(results.map(f));
      const first = results[0];
      const tapNames = [...new Set(results.flatMap((r) => Object.keys(r.taps)))];
      report[apps.length > 1 ? `${name}@${t.label}` : name] = {
        route: scr.route, family: scr.family, runs,
        firstContentMs: m((r) => r.firstContentMs), interactiveMs: m((r) => r.interactiveMs), totalBlockingMs: m((r) => r.totalBlockingMs),
        atFirstContent: { documents: m((r) => r.atFirstContent.documents), documentBytes: m((r) => r.atFirstContent.documentBytes), requests: m((r) => r.atFirstContent.requests), bytes: m((r) => r.atFirstContent.bytes) },
        documents: { count: m((r) => r.documents.count), bytes: m((r) => r.documents.bytes), missing404: m((r) => r.documents.missing404), byKind: first.documents.byKind },
        appCode: { requests: m((r) => r.appCode.requests), bytes: m((r) => r.appCode.bytes) },
        allRequests: { count: m((r) => r.allRequests.count), bytes: m((r) => r.allRequests.bytes), failed: m((r) => r.allRequests.failed), failedUrls: first.allRequests.failedUrls },
        tapMs: Object.fromEntries(tapNames.map((n) => [n, m((r) => r.taps[n])])),
        documentsAfterTaps: m((r) => r.documentsAfterTaps),
        codeRun1: first.codeList,
        timelineRun1: first.timeline,
        longTasksRun1: first.longTaskList, profileTop: first.profileTop,
        perRun: results.map((r) => ({ firstContentMs: r.firstContentMs, interactiveMs: r.interactiveMs, docs: r.documents.count, docBytes: r.documents.bytes })),
      };
      if (process.env.URLS_OUT) writeFileSync(`${process.env.URLS_OUT}.${name}${apps.length > 1 ? `@${t.label}` : ''}.tsv`, first.urls.map((x) => `${x.t}\t${x.status}\t${x.bytes}\t${x.url}`).join('\n'));
    }
  }
} finally {
  await browser.close();
  feed.server.close(); for (const a of apps) a.server.close();
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
