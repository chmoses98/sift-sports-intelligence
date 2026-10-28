// First-visit, repeat-visit and offline cost of the service worker's precache, measured with the service worker ALLOWED (scripts/v3-qa/screens-perf.mjs blocks it).
// Investigation tooling only: nothing here changes the app.
//
//   DIST="shipped=dist,optA=/tmp/variants/optA" RUNS=3 node --experimental-strip-types scripts/v3-qa/sw-perf.mjs
//
// The link: a Chromium service worker's own fetches are NOT covered by the page's CDP network throttle, so the throttle here lives in the servers: ONE shared
// link for everything the phone downloads (the app, the service worker's precache, the documents), 9 Mbit/s (MBIT) and 170 ms (RTT) before each response,
// plus CPU 4x on the page. Over HTTP/2 + TLS like GitHub Pages (a self-signed certificate; --ignore-certificate-errors; --no-proxy-server).
//
// Per build and run (a fresh browser context = a first visit):
//   first     the first meaningful content of the route (Home: the featured game with both teams), bytes and requests the server sent before it,
//             when the worker became active (precache finished), what the worker downloaded (requests with Sec-Fetch-Dest: empty, plus sw.js and workbox)
//   repeat    a second visit in the same context: first content time, bytes the server sent
//   offline   the network cut: does the same route come up; does a screen not visited before (Prop Discovery, a lazy chunk) open; does the classic Home;
//             does a classic route nobody opened (#/cbb, a lazy chunk in no first screen)
// OFFLINE=0 skips the offline step. IMMEDIATE=1 registers the worker at load instead of 6 s later (the behaviour before PR #149; the page's setTimeout(register, 6000) becomes 0).
// SW=block runs the same flow with workers blocked (repeat then relies on the HTTP cache, max-age=300) as the control. ROUTE=/v3 (Home) is the default; ROUTE=/v3/props?view=list
// measures Prop Discovery with its own family and first-content selector. CONTENT=<selector> sets the first-content selector of another route (ROUTE=/ the classic Home
// with CONTENT='#root h1'); ASSETS_OUT=<prefix> writes the app files the server sent in the first visit (the shell list the variants are made from).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http2 from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const { feedSource } = await import('../../e2e/support/feedSource.ts');
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const runs = Number(process.env.RUNS ?? 3);
const MBIT = Number(process.env.MBIT ?? 9);
const RTT = Number(process.env.RTT ?? 170);
const BASE_PATH = '/sift-sports-intelligence/';
const route = process.env.ROUTE ?? '/v3';
const SCR = route.startsWith('/v3/props')
  ? { family: 'props', content: '.pd-row, .pd-card', ready: 'true', unvisited: '/v3' }
  : { family: 'game', content: process.env.CONTENT ?? '.v3-feat__mid', ready: 'true', unvisited: '/v3/props?view=list' };

const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const round = (n) => (n == null ? null : Math.round(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- one shared link
const link = { free: 0 };
// OFFLINE step: the servers drop every connection (BrowserContext.setOffline does not reach a service worker's own fetches, so a runtime-cache miss would otherwise still succeed)
let cut = false;
let T0 = Date.now();
const log = [];
const HEADER_BYTES = 250;
async function send(res, status, headers, body, meta) {
  await sleep(RTT);
  res.writeHead(status, headers);
  link.free = Math.max(link.free, Date.now()) + (HEADER_BYTES * 8) / (MBIT * 1000);
  for (let o = 0; o < body.length; o += 8192) {
    const chunk = body.subarray(o, Math.min(body.length, o + 8192));
    link.free = Math.max(link.free, Date.now()) + (chunk.length * 8) / (MBIT * 1000);
    const wait = link.free - Date.now();
    if (wait > 0) await sleep(wait);
    res.write(chunk);
  }
  res.end();
  log.push({ ...meta, t: Date.now() - T0, bytes: body.length + HEADER_BYTES, status });
}

const certDir = mkdtempSync(join(tmpdir(), 'v3-sw-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:raw.githubusercontent.com,DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const tls = { key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')), allowHTTP1: true };

// ---------------------------------------------------------------- documents (the fixture family, gzip, like GitHub)
const fam = feedSource(SCR.family);
const gz = new Map();
function startFeed() {
  const server = http2.createSecureServer(tls, async (req, res) => {
    if (cut) { req.socket.destroy(); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(); return; }
    const url = `https://raw.githubusercontent.com${req.url}`;
    const d = await fam.get(url).catch(() => null);
    const base = { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=300' };
    if (!d) { await send(res, 404, base, Buffer.from('not found'), { kind: 'doc', url: req.url }); return; }
    let body = d.body;
    const h = { ...base };
    if (/gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gz.get(url) ?? gzipSync(d.body, { level: 6 }); gz.set(url, body); h['content-encoding'] = 'gzip'; }
    if (req.method === 'HEAD') { await send(res, 200, h, Buffer.alloc(0), { kind: 'doc', url: req.url }); return; }
    // live quotes: only the observation time is re-stamped to the family clock (as freshQuotes does)
    if (/\/live-quotes\/games\//.test(url)) {
      try { const doc = JSON.parse(d.body.toString('utf8')); const now = fam.clock().toISOString(); doc.generated_at = now; doc.markets = doc.markets.map((m) => ({ ...m, observed_at: now })); body = gzipSync(Buffer.from(JSON.stringify(doc)), { level: 6 }); } catch { /* as is */ }
    }
    await send(res, 200, h, body, { kind: 'doc', url: req.url });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- the app
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
function startApp(dist) {
  const server = http2.createSecureServer(tls, async (req, res) => {
    if (cut) { req.socket.destroy(); return; }
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length - 1);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(dist, p));
    const meta = { kind: 'app', url: p, dest: req.headers['sec-fetch-dest'] ?? '' };
    if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { await send(res, 404, {}, Buffer.from('not found'), meta); return; }
    let body = readFileSync(f);
    const h = { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': p.endsWith('sw.js') || p === '/index.html' ? 'no-cache' : 'max-age=300' };
    if (/\.(html|js|css|json|svg|webmanifest)$/.test(f) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gzipSync(body, { level: 6 }); h['content-encoding'] = 'gzip'; }
    await send(res, 200, h, body, meta);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- the page
const initScript = (nowMs, immediate) => `
(() => {
  const F = ${nowMs}, RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } }
  window.Date = FD;
  ${immediate ? 'const st = window.setTimeout; window.setTimeout = (f, ms, ...r) => st(f, ms === 6000 ? 0 : ms, ...r);' : ''}
  const w = window; w.__pm = { first: null };
  const sel = ${JSON.stringify(SCR.content)};
  const seen = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().height > 0) { mo.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => { w.__pm.first = performance.now(); })); } };
  const mo = new MutationObserver(seen); mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
  try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch {}
})();`;

async function newPage(ctx, immediate, nowMs) {
  const page = await ctx.newPage();
  await page.addInitScript(initScript(nowMs, immediate));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return page;
}
const swState = (page) => page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? { active: r.active?.state ?? null, controlled: !!navigator.serviceWorker.controller, installing: !!r.installing, waiting: !!r.waiting } : null; }).catch(() => null);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const swFetch = (e) => e.kind === 'app' && (e.dest === 'empty' || /\/sw\.js$|workbox-/.test(e.url)) && !/manifest/.test(e.url);

async function oneRun(browser, app, label, i) {
  const allow = process.env.SW !== 'block';
  const immediate = process.env.IMMEDIATE === '1';
  const origin = `https://localhost:${app.port}`;
  const nowMs = fam.clock().getTime();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: allow ? 'allow' : 'block' });
  const out = { label, run: i };
  try {
    // ---- first visit
    link.free = 0; log.length = 0; T0 = Date.now();
    const page = await newPage(ctx, immediate, nowMs);
    await page.goto(`${origin}${BASE_PATH}#${route}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__pm?.first != null, null, { timeout: 150000 });
    const first = await page.evaluate(() => window.__pm.first);
    out.firstContentMs = round(first);
    const atFirst = log.filter((e) => e.t <= first + 50);
    out.atFirst = { requests: atFirst.length, bytes: sum(atFirst.map((e) => e.bytes)), appBytes: sum(atFirst.filter((e) => e.kind === 'app').map((e) => e.bytes)) };
    if (allow) {
      let active = null;
      for (let k = 0; k < 450 && active == null; k++) { await sleep(200); const s = await swState(page); if (s?.active === 'activated') active = Date.now() - T0; }
      out.workerActiveMs = active;
      await sleep(1500);
      const sw = log.filter(swFetch);
      out.worker = { requests: sw.length, bytes: sum(sw.map((e) => e.bytes)), lastAt: sw.length ? Math.max(...sw.map((e) => e.t)) : null };
      out.controlled = (await swState(page))?.controlled ?? false;
    } else await sleep(4000);
    if (process.env.ASSETS_OUT) writeFileSync(`${process.env.ASSETS_OUT}.${label}.${i}.txt`, log.filter((e) => e.kind === 'app').map((e) => `${e.bytes}\t${e.url}`).join('\n'));
    out.firstVisit = { requests: log.length, bytes: sum(log.map((e) => e.bytes)), appBytes: sum(log.filter((e) => e.kind === 'app').map((e) => e.bytes)), docBytes: sum(log.filter((e) => e.kind === 'doc').map((e) => e.bytes)) };
    await page.close();

    // ---- repeat visit (same context: the worker, or the HTTP cache)
    link.free = 0; log.length = 0; T0 = Date.now();
    const p2 = await newPage(ctx, immediate, nowMs);
    await p2.goto(`${origin}${BASE_PATH}#${route}`, { waitUntil: 'commit' });
    await p2.waitForFunction(() => window.__pm?.first != null, null, { timeout: 150000 });
    out.repeat = { firstContentMs: round(await p2.evaluate(() => window.__pm.first)), requests: log.length, appBytes: sum(log.filter((e) => e.kind === 'app').map((e) => e.bytes)), docBytes: sum(log.filter((e) => e.kind === 'doc').map((e) => e.bytes)) };
    await p2.close();

    // ---- offline (OFFLINE=0 skips it)
    if (process.env.OFFLINE !== '0') {
    cut = true;
    await ctx.setOffline(true);
    const off = {};
    const p3 = await newPage(ctx, immediate, nowMs);
    off.failed = [];
    p3.on('requestfailed', (r) => off.failed.push(r.url().replace(/^https:\/\/localhost:\d+\/sift-sports-intelligence\//, '')));
    p3.on('console', (m) => { if (m.type() === 'error') off.failed.push(`console: ${m.text().slice(0, 160)}`); });
    const t3 = Date.now();
    await p3.goto(`${origin}${BASE_PATH}#${route}`, { waitUntil: 'commit' }).catch((e) => { off.gotoError = String(e).split('\n')[0]; });
    off.sameRoute = await p3.waitForFunction(() => window.__pm?.first != null, null, { timeout: 25000 }).then(() => true, () => false);
    off.sameRouteMs = off.sameRoute ? Date.now() - t3 : null;
    // a screen not visited before: a lazy chunk the precache may or may not hold
    await p3.evaluate((h) => { location.hash = h; }, SCR.unvisited).catch(() => undefined);
    // (Prop Discovery's container `.pd` exists in every state of that screen, so it is only there once its chunk has loaded; Home's `.v3-feat__mid` for the other direction)
    off.unvisitedV3 = await p3.waitForFunction((sel) => !!document.querySelector(sel), SCR.unvisited.startsWith('/v3/props') ? '.pd' : '.v3-feat__mid', { timeout: 15000 }).then(() => true, () => false);
    await p3.close();
    // the classic Home: a full navigation offline
    const p4 = await ctx.newPage();
    await p4.goto(`${origin}${BASE_PATH}#/`, { waitUntil: 'commit' }).catch(() => undefined);
    off.classicHome = await p4.waitForFunction(() => (document.querySelector('#root')?.innerText ?? '').trim().length > 150, null, { timeout: 20000 }).then(() => true, () => false);
    // a classic route nobody has opened (its chunk is in no first screen): precached in the shipped build, a runtime-cache miss in a narrower one
    await p4.evaluate((h) => { location.hash = h; }, '/cbb').catch(() => undefined);
    off.classicUnvisited = await p4.waitForFunction(() => /college basketball|\bcbb\b/i.test(document.querySelector('#root')?.innerText ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
    await p4.close();
    out.offline = off;
    cut = false;
    await ctx.setOffline(false);
    }
  } catch (e) { out.error = String(e).split('\n')[0]; }
  await ctx.close();
  return out;
}

const feed = await startFeed();
const dists = (process.env.DIST ?? 'dist').split(',').filter(Boolean).map((d, i) => { const [label, path] = d.includes('=') ? d.split('=') : [`b${i}`, d]; return { label, path: path.startsWith('/') ? path : join(process.cwd(), path) }; });
const apps = []; for (const d of dists) apps.push({ ...d, ...(await startApp(d.path)) });
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: [`--host-resolver-rules=MAP raw.githubusercontent.com 127.0.0.1:${feed.port}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--ignore-certificate-errors', '--no-proxy-server'],
});
const results = new Map(apps.map((a) => [a.label, []]));
try {
  for (let i = 0; i < runs; i++) for (const a of apps) { const r = await oneRun(browser, a, a.label, i + 1); results.get(a.label).push(r); console.error(JSON.stringify(r)); }
} finally { await browser.close(); feed.server.close(); for (const a of apps) a.server.close(); }
const report = {};
for (const [label, rs] of results) {
  const m = (f) => median(rs.map(f));
  report[label] = {
    runs: rs.length, errors: rs.filter((r) => r.error).length,
    first: { contentMs: m((r) => r.firstContentMs), requests: m((r) => r.atFirst?.requests), bytes: m((r) => r.atFirst?.bytes) },
    worker: { activeMs: m((r) => r.workerActiveMs), requests: m((r) => r.worker?.requests), bytes: m((r) => r.worker?.bytes), controlled: rs.filter((r) => r.controlled).length },
    firstVisitTotal: { requests: m((r) => r.firstVisit?.requests), bytes: m((r) => r.firstVisit?.bytes), appBytes: m((r) => r.firstVisit?.appBytes) },
    repeat: { contentMs: m((r) => r.repeat?.firstContentMs), requests: m((r) => r.repeat?.requests), appBytes: m((r) => r.repeat?.appBytes), docBytes: m((r) => r.repeat?.docBytes) },
    offline: { sameRoute: rs.filter((r) => r.offline?.sameRoute).length, sameRouteMs: m((r) => r.offline?.sameRouteMs), unvisitedV3: rs.filter((r) => r.offline?.unvisitedV3).length, classicHome: rs.filter((r) => r.offline?.classicHome).length, classicUnvisited: rs.filter((r) => r.offline?.classicUnvisited).length },
  };
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ route, mbit: MBIT, rtt: RTT, immediate: process.env.IMMEDIATE === '1', sw: process.env.SW ?? 'allow', report, results: Object.fromEntries(results) }, null, 2));
console.log(JSON.stringify(report, null, 2));
