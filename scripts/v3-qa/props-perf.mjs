// Prop Discovery performance, measured on REAL published documents under an iPhone-class throttle.
//
//   * Transferred bytes are the browser's own: Chrome DevTools Protocol `Network.loadingFinished.encodedDataLength` (bytes on the wire,
//     response headers included). To make that number real for documents served from the disk cache of captured publications, the cache is
//     served by a local HTTP/2 + TLS server that answers for raw.githubusercontent.com (Chromium `--host-resolver-rules`), gzip-encodes
//     every answer the way GitHub does (checked: the live document 240,645 B on the wire against 241,033 B from `gzip -6` of the same
//     bytes) and sends `cache-control: max-age=300` like GitHub. Nothing is intercepted in the page, so the network stack, the HTTP cache,
//     the throttle and the byte counts are the browser's. Every other host is unresolvable (no third-party traffic).
//   * Network: "Fast 4G" = 9 Mbit/s down, 1.5 Mbit/s up, 170 ms added latency. CPU: 4x slowdown (Emulation.setCPUThrottlingRate).
//     Viewport 390x844 at 2x, touch. Service workers are blocked (a first visit would otherwise also precache the whole app).
//   * App code: with DIST=<a `vite build` output> the app is served gzip-encoded from a static server under the same throttle (what a
//     phone downloads); without DIST it uses BASE (a dev server: unbundled, so its byte counts for code are not meaningful, documents are).
//   * Times are in-page `performance.now()` from navigation start: first meaningful content = first prop card/row painted; interactive =
//     the first 1 s window after that without a task over 100 ms; tap-to-paint = a tap's `pointerup` to the frame that shows its result; scroll =
//     requestAnimationFrame deltas during a real touch scroll gesture.
//
//   * `--no-proxy-server` matters: this sandbox sets HTTPS_PROXY, which Chromium honours, and requests would then bypass the local server and
//     fetch today's LIVE documents (a different slate than the captured cache).
//
// Usage:  DIST=/path/to/dist RUNS=3 ROUTE=/v3/props?view=list node --experimental-strip-types scripts/v3-qa/props-perf.mjs
// Env:    ROUTE (default the list), RUNS (default 3, medians reported), OUT (write the JSON report), URLS_OUT (document list of run 1),
//         NOTHROTTLE=1, INTERACT=0 (skip taps and scroll), WAIT (selector that means "content", default `.pd-row, .pd-card`),
//         FRESH=0 (do not re-stamp quote observation times; default re-stamps like e2e/support/realFeeds `freshQuotes`).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const { feedNow } = await import('../../e2e/support/realFeeds.ts');
const cacheDir = process.env.V3_FEED_CACHE ?? join(process.cwd(), '.v3-feed-cache');
const exe = process.env.SIFT_CHROMIUM ?? ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find(existsSync);
const route = process.env.ROUTE ?? '/v3/props?view=list';
const runs = Number(process.env.RUNS ?? 3);
const wait = process.env.WAIT ?? '.pd-row, .pd-card';
const interact = process.env.INTERACT !== '0';
const throttle = process.env.NOTHROTTLE !== '1';
const fresh = process.env.FRESH !== '0';
const BASE_PATH = '/sift-sports-intelligence/';

// ---------------------------------------------------------------- the published documents, served the way GitHub serves them
const gz = new Map();
const cacheKey = (url) => createHash('sha1').update(url).digest('hex');
function answer(url, accept) {
  const f = join(cacheDir, cacheKey(url));
  if (!existsSync(f)) return { status: 404, body: Buffer.from('not found'), headers: {} };
  let body = readFileSync(f);
  if (fresh && /\/live-quotes\/games\/[^/]+\.json/.test(url)) {
    const doc = JSON.parse(body.toString('utf8'));
    const now = feedNow().toISOString();
    doc.generated_at = now;
    doc.markets = doc.markets.map((m) => ({ ...m, observed_at: now }));
    body = Buffer.from(JSON.stringify(doc));
  }
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=300', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' };
  if (/gzip/.test(accept ?? '')) {
    let z = gz.get(url);
    if (!z) { z = gzipSync(body, { level: 6 }); gz.set(url, z); }
    return { status: 200, body: z, headers: { ...headers, 'content-encoding': 'gzip' } };
  }
  return { status: 200, body, headers };
}

function startFeedServer() {
  const dir = mkdtempSync(join(tmpdir(), 'v3-perf-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=raw.githubusercontent.com', '-addext', 'subjectAltName=DNS:raw.githubusercontent.com'], { stdio: 'ignore' });
  const server = http2.createSecureServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')), allowHTTP1: true }, (req, res) => {
    const a = answer(`https://raw.githubusercontent.com${req.url}`, req.headers['accept-encoding']);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(); return; }
    res.writeHead(a.status, a.headers);
    res.end(a.body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- the app: a build output served gzip-encoded, or a dev server
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function startAppServer(dist) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length - 1);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(dist, p));
    if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('not found'); return; }
    const type = MIME[extname(f)] ?? 'application/octet-stream';
    let body = readFileSync(f);
    const h = { 'content-type': type, 'cache-control': 'max-age=300' };
    if (/\.(html|js|css|json|svg|webmanifest)$/.test(f) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gzipSync(body, { level: 6 }); h['content-encoding'] = 'gzip'; }
    res.writeHead(200, h);
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- measurements
const kind = (u) => {
  if (!/\.json(\?|$)/.test(u)) return null;
  if (/\/event_detail\//.test(u)) return 'event_detail';
  if (/\/explorer\/events\//.test(u)) return 'event_research(injuries)';
  if (/\/explorer\/rankings\//.test(u)) return 'ranking';
  if (/\/explorer\/teams\//.test(u)) return 'team_profile';
  if (/\/explorer\/players\//.test(u)) return 'player_profile';
  if (/\/explorer\/metrics/.test(u)) return 'explorer_metrics';
  if (/\/explorer\/index/.test(u)) return 'explorer_index';
  if (/live-quotes/.test(u)) return 'quote_feed';
  if (/projections\//.test(u)) return 'projection';
  if (/\/data\/nfl\/history\/players\//.test(u)) return 'nfl_game_log';
  if (/\/data\/nfl\/history\//.test(u)) return 'nfl_history_index';
  if (/\/app\/latest\/[a-z_]+\.json/.test(u) || /signals\//.test(u)) return 'slate(shell)';
  return 'other_json';
};
const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const round = (n, d = 0) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

const INIT = `
(() => {
  const w = window; w.__pm = { first: null, lt: [] };
  const sel = ${JSON.stringify(wait)};
  const seen = () => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().height > 0) { mo.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => { w.__pm.first = performance.now(); })); } };
  const mo = new MutationObserver(seen); mo.observe(document, { childList: true, subtree: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__pm.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
})();`;

/** Tap-to-paint: `tap()` performs the tap; `done` is an expression evaluated in the page that becomes true once the tap's result is in the DOM. */
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

async function oneRun(browser, appUrl, feedPort, i) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  // The fixed clock the cached documents describe (same instant as Playwright's `clock.setFixedTime` in the specs), done in the page rather
  // than with Playwright's clock because that fakes `performance.now()` too and the timings below must share a time base with input events.
  if (process.env.CLOCK === 'pw') await page.clock.setFixedTime(feedNow());
  else await page.addInitScript(`(() => { const F = ${feedNow().getTime()}, RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } } window.Date = FD; })();`);
  await page.addInitScript(INIT);
  // A first visit opens the Welcome sheet; this device has been welcomed (same as the Playwright specs).
  await page.addInitScript(() => { try { localStorage.setItem('sift3.prefs', JSON.stringify({ priceFormat: 'cents', reduceMotion: false, textScale: 'default', onboarded: true })); } catch { /* storage may be blocked */ } });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const reqs = new Map();
  const t0wall = { v: 0 };
  cdp.on('Network.requestWillBeSent', (e) => { reqs.set(e.requestId, { url: e.request.url, type: e.type, t: e.timestamp, bytes: 0, status: null, cached: false, done: false }); });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.cached = !!(e.response.fromDiskCache || e.response.fromPrefetchCache); r.wireless = e.response.encodedDataLength; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; r.tEnd = e.timestamp; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = true; r.tEnd = e.timestamp; } });
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const tNav = Date.now();
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  await page.goto(appUrl, { waitUntil: 'commit' });
  // wall time of navigation start in CDP's monotonic clock: the first request's timestamp
  await page.waitForFunction(() => window.__pm?.first != null, null, { timeout: 180000 });
  const pm0 = await page.evaluate(() => ({ first: window.__pm.first, origin: performance.timeOrigin }));
  // Snapshot what has been transferred at the instant of first content, then let the app settle (2 s past the last request, max 25 s).
  const at = (() => { const done = [...reqs.values()].filter((r) => r.done); return { n: done.length, bytes: done.reduce((a, r) => a + r.bytes, 0) }; })();
  const firstTs = Math.min(...[...reqs.values()].map((r) => r.t));
  const atFirst = (() => { const cut = firstTs + pm0.first / 1000; const rs = [...reqs.values()].filter((r) => r.done && r.tEnd <= cut); return { requests: rs.length, bytes: rs.reduce((a, r) => a + r.bytes, 0), documents: rs.filter((r) => kind(r.url)).length, documentBytes: rs.filter((r) => kind(r.url)).reduce((a, r) => a + r.bytes, 0) }; })();
  void at;
  let lastCount = -1, still = 0;
  for (let k = 0; k < 50 && still < 4; k++) { await page.waitForTimeout(500); const n = [...reqs.values()].filter((r) => r.done || r.failed).length; if (n === lastCount) still++; else { still = 0; lastCount = n; } }
  await page.waitForTimeout(2200);
  let profileTop = null;
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0)); });
    if (process.env.PROFILE_FN) {
      const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
      const stacks = new Map();
      profile.samples.forEach((id, i) => {
        const n = byId.get(id);
        if (n.callFrame.functionName !== process.env.PROFILE_FN) return;
        const chain = []; let cur = id;
        for (let d = 0; d < 7 && cur != null; d++) { const nn = byId.get(cur); chain.push(`${nn.callFrame.functionName || '(anon)'}:${nn.callFrame.url.split('/').pop()}:${nn.callFrame.lineNumber}`); cur = parent.get(cur); }
        const k = chain.join(' < ');
        stacks.set(k, (stacks.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0));
      });
      console.error(JSON.stringify([...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [round(v / 1000), k]), null, 1));
    }
    profileTop = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, round(v / 1000)]);
  }
  const pm = await page.evaluate(() => ({ first: window.__pm.first, lt: window.__pm.lt }));
  const lt = pm.lt.map(([s, d]) => [s, s + d]).sort((a, b) => a[0] - b[0]);
  // Interactive: the first moment after first content from which 1 s passes with no task longer than 100 ms (so a 70 ms housekeeping tick does
  // not count, a 300 ms render does). Blocking: time over 50 ms per long task from navigation to that moment, and in the 5 s after first content.
  let tti = pm.first;
  for (const [s0, e0] of lt) { if (e0 <= pm.first || e0 - s0 < 100) continue; if (s0 - tti >= 1000) break; tti = Math.max(tti, e0); }
  const tbt = lt.filter(([s0]) => s0 < tti).reduce((a, [s0, e0]) => a + Math.max(0, e0 - s0 - 50), 0);
  const tbtAfter = lt.filter(([s0]) => s0 >= pm.first && s0 < pm.first + 5000).reduce((a, [s0, e0]) => a + Math.max(0, e0 - s0 - 50), 0);

  const all = [...reqs.values()];
  const docs = all.filter((r) => kind(r.url));
  const byKind = {};
  for (const r of docs) { const k = kind(r.url); byKind[k] ??= { n: 0, bytes: 0, missing: 0 }; byKind[k].n++; byKind[k].bytes += r.bytes; if (r.status === 404) byKind[k].missing++; }
  const code = all.filter((r) => !kind(r.url) && /Script|Stylesheet|Font|Document/.test(r.type ?? ''));
  const res = {
    run: i, profileTop,
    firstContentMs: round(pm.first), interactiveMs: round(tti), totalBlockingMs: round(tbt), blockingFirst5sMs: round(tbtAfter), longTasks: lt.length, longTaskList: lt.map(([a, b]) => [round(a), round(b - a)]),
    atFirstContent: atFirst,
    documents: { count: docs.length, bytes: docs.reduce((a, r) => a + r.bytes, 0), missing404: docs.filter((r) => r.status === 404).length, byKind },
    appCode: { requests: code.length, bytes: code.reduce((a, r) => a + r.bytes, 0) },
    allRequests: { count: all.length, bytes: all.reduce((a, r) => a + r.bytes, 0), failed: all.filter((r) => r.failed).length, failedUrls: all.filter((r) => r.failed).map((r) => r.url) },
    urls: docs.map((r) => ({ t: round((r.t - firstTs) * 1000), url: r.url, bytes: r.bytes, status: r.status })),
  };

  res.rowsInList = await page.evaluate(() => Number(document.querySelector('.pd-list')?.getAttribute('aria-rowcount') ?? 0));
  if (interact && (await page.locator('.pd-row').count()) > 0) {
    const before = reqs.size;
    // Tap the open part of a row (below the price pill, clear of every link on it), as a thumb would.
    const tapRow = async () => { const hit = page.locator('.pd-row__hit').first(); const b = await hit.boundingBox(); await hit.tap({ position: { x: Math.max(8, b.width - 34), y: Math.max(8, b.height - 14) } }); };
    // Expand a row.
    res.tapExpandMs = round(await tapToPaint(page, tapRow, `!!document.querySelector('.pd-peek')`));
    await page.waitForTimeout(1500);
    res.tapCollapseMs = round(await tapToPaint(page, tapRow, `!document.querySelector('.pd-peek')`));
    // Sort: open the sheet, choose Price, apply.
    res.tapSortOpenMs = round(await tapToPaint(page, () => page.locator('.pd-btn--sort').tap(), `!!document.querySelector('.pd-fs')`));
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Price', exact: true }).tap();
    res.tapSortApplyMs = round(await tapToPaint(page, () => page.locator('.pd-apply button').tap(), `!document.querySelector('.pd-fs') && /Sort: Price/.test(document.querySelector('.pd-btn--sort')?.textContent ?? '')`));
    await page.waitForTimeout(800);
    // Filter: a sport (the second chip in the sheet) then apply.
    res.tapFilterOpenMs = round(await tapToPaint(page, () => page.locator('.pd-btn:has-text("Filters")').tap(), `!!document.querySelector('.pd-fs')`));
    await page.waitForTimeout(800);
    const sport = page.locator('.pd-fs .pd-fc button:has(em)').first();
    await sport.tap();
    res.tapFilterApplyMs = round(await tapToPaint(page, () => page.locator('.pd-apply button').tap(), `!document.querySelector('.pd-fs') && !!document.querySelector('.pd-act button')`));
    await page.waitForTimeout(1500);
    res.documentsAfterInteractions = reqs.size - before;
    // Scroll with a real touch gesture while sampling frame times.
    await page.evaluate(() => { window.__f = []; let last = performance.now(); window.__stop = false; const loop = () => { const t = performance.now(); window.__f.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    for (let g = 0; g < 4; g++) { await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 650, yDistance: -2400, speed: 1800, gestureSourceType: 'touch' }); }
    await page.waitForTimeout(500);
    const fr = await page.evaluate(() => { window.__stop = true; return window.__f; });
    res.scroll = { frames: fr.length, p50: round(pct(fr, 0.5), 1), p95: round(pct(fr, 0.95), 1), max: round(Math.max(...fr), 1), over33ms: fr.filter((x) => x > 33.4).length, over50ms: fr.filter((x) => x > 50).length };
  }
  res.pageNow = await page.evaluate(() => new Date().toISOString());
  res.rowsInDomAtRest = await page.locator('.pd-row').count();
  res.cardsInDom = await page.locator('.pd-card').count();
  void tNav; void t0wall; void feedPort;
  await ctx.close();
  return res;
}

const feed = await startFeedServer();
const app = process.env.DIST ? await startAppServer(process.env.DIST.startsWith('/') ? process.env.DIST : join(process.cwd(), process.env.DIST)) : null;
const origin = app ? `http://localhost:${app.port}` : new URL(process.env.BASE ?? 'http://localhost:5182/sift-sports-intelligence/').origin;
const appUrl = `${origin}${BASE_PATH}#${route}`;
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: [`--host-resolver-rules=MAP raw.githubusercontent.com 127.0.0.1:${feed.port}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--ignore-certificate-errors', '--no-proxy-server'],
});
const results = [];
try {
  for (let i = 0; i < runs; i++) results.push(await oneRun(browser, appUrl, feed.port, i + 1));
} finally {
  await browser.close();
  feed.server.close(); app?.server.close();
}
const m = (f) => median(results.map(f));
const first = results[0];
const summary = {
  route, runs, served: app ? 'production build (gzip)' : `dev server ${origin}`, throttle: throttle ? 'Fast 4G (9 Mbit/s, 170 ms) + 4x CPU' : 'none',
  firstContentMs: m((r) => r.firstContentMs), interactiveMs: m((r) => r.interactiveMs), totalBlockingMs: m((r) => r.totalBlockingMs), blockingFirst5sMs: m((r) => r.blockingFirst5sMs),
  atFirstContent: { requests: m((r) => r.atFirstContent.requests), bytes: m((r) => r.atFirstContent.bytes), documents: m((r) => r.atFirstContent.documents), documentBytes: m((r) => r.atFirstContent.documentBytes) },
  documents: { count: m((r) => r.documents.count), bytes: m((r) => r.documents.bytes), missing404: m((r) => r.documents.missing404), byKind: first.documents.byKind },
  appCode: { requests: m((r) => r.appCode.requests), bytes: m((r) => r.appCode.bytes) },
  allRequests: { count: m((r) => r.allRequests.count), bytes: m((r) => r.allRequests.bytes), failed: m((r) => r.allRequests.failed), failedUrls: first.allRequests.failedUrls },
  tapMs: { expand: m((r) => r.tapExpandMs), collapse: m((r) => r.tapCollapseMs), sortOpen: m((r) => r.tapSortOpenMs), sortApply: m((r) => r.tapSortApplyMs), filterOpen: m((r) => r.tapFilterOpenMs), filterApply: m((r) => r.tapFilterApplyMs) },
  documentsAfterInteractions: m((r) => r.documentsAfterInteractions),
  scroll: { p50: m((r) => r.scroll?.p50), p95: m((r) => r.scroll?.p95), max: m((r) => r.scroll?.max), over33ms: m((r) => r.scroll?.over33ms), over50ms: m((r) => r.scroll?.over50ms), frames: m((r) => r.scroll?.frames) },
  longTasksRun1: first.longTaskList,
  profileTop: first.profileTop,
  pageNow: first.pageNow, rowsInList: first.rowsInList, rowsInDomAtRest: first.rowsInDomAtRest, cardsInDom: first.cardsInDom,
  perRun: results.map((r) => ({ firstContentMs: r.firstContentMs, interactiveMs: r.interactiveMs, docs: r.documents.count, docBytes: r.documents.bytes })),
};
if (process.env.URLS_OUT) writeFileSync(process.env.URLS_OUT, first.urls.map((x) => `${x.t}\t${x.status}\t${x.bytes}\t${x.url}`).join('\n'));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ summary, results: results.map(({ urls, ...r }) => r) }, null, 2));
console.log(JSON.stringify(summary, null, 2));
