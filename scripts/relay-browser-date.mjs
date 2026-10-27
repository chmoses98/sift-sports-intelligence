// Proves, in a real Chromium, that a page on a DIFFERENT origin can read the relay's `Date` header.
//
//   node scripts/relay-browser-date.mjs                 # BEFORE (origin/main core) must be unreadable, AFTER (this tree) readable
//   BEFORE_REF=<git ref> node scripts/relay-browser-date.mjs
//   node scripts/relay-browser-date.mjs --after-only    # only the working-tree core
//   CHROME_PATH=/path/to/chrome node scripts/relay-browser-date.mjs
//
// No live Kalshi calls: the relay core runs behind a tiny Node http server (the same Request/Response
// adapter every host uses) and its upstream is replaced by a local fake server through the core's own
// fetchImpl option. The page is served from another localhost port, and the relay's allowed-origins
// configuration lists exactly that origin, so CORS is genuinely exercised (a simple GET, no preflight).
// Rows: a fresh 200, the same read answered from the relay's cache, 429, an upstream 500, a malformed (502) and an
// unreachable (502) upstream, a refused query (400), and a read with a custom request header (forces a CORS preflight,
// which the relay does not grant: Sift sends a simple GET, so that row must be blocked, before and after, by design);
// all fetched the way the Sift client does (cache: 'no-store', credentials: 'omit'). A page on a third origin the relay
// does not allow is the negative control.
//
//   node scripts/relay-browser-date.mjs --serve [--ref <git ref>]   # serve only (for scripts/relay-webkit-date.py): prints one JSON line
//
// Exit 0 only if BEFORE reads null for Date on every row and AFTER reads a current Date on every row (the cached one
// newer than the first answer's, with the same X-Sift-Observed-At).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'relay-date-'));
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

/** Transpile a relay/core.ts source (it has no imports) and load it as an ES module. */
async function loadCore(label, source) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(dir, `core-${label.replace(/[^a-z0-9]+/gi, "-")}.mjs`);
  writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

/** Fake Kalshi: public JSON, its own Date and Age, a 429 for series KXRATE. Records every request's headers. */
async function startFakeUpstream() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, origin: req.headers.origin ?? null });
    if (req.url.includes('KXDROP')) return req.socket.destroy(); // upstream unreachable
    if (req.url.includes('KXBAD')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>blocked</html>'); } // malformed
    if (req.url.includes('KXERR')) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"internal"}'); }
    const limited = req.url.includes('KXRATE');
    res.writeHead(limited ? 429 : 200, { 'content-type': 'application/json', age: '2', ...(limited ? { 'retry-after': '9' } : {}) });
    res.end(JSON.stringify(limited ? { error: 'too_many_requests' } : { markets: [{ ticker: 'KXNFLGAME-26OCT26AABB-AA', yes_bid_dollars: '0.5100' }], cursor: '' }));
  });
  return { port: await listen(server), seen, server };
}

/** Node http adapter: IncomingMessage -> Request -> handleRelay -> ServerResponse (what a host does). */
async function startRelay(core, upstreamPort, allowedOrigin) {
  const cache = new core.MemoryRelayCache();
  const log = []; // what the relay saw from the browser: method, Origin, Cache-Control the browser added
  const fetchImpl = (url, init) => fetch(String(url).replace(core.UPSTREAM, `http://127.0.0.1:${upstreamPort}`), init);
  const server = http.createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    log.push({ method: req.method, url: req.url, origin: req.headers.origin ?? null, cacheControl: req.headers['cache-control'] ?? null, customHeader: req.headers['access-control-request-headers'] ?? req.headers['x-sift-probe'] ?? null });
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers });
    const out = await core.handleRelay(request, { allowedOrigins: [allowedOrigin], fetchImpl, cache });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return { port: await listen(server), server, log };
}

/** The probe the page runs (also what scripts/relay-webkit-date.py runs in WebKitGTK): the same fetches the Sift client makes. */
const PROBE = `async function probe(relay) {
  const read = async (name, path, init) => {
    const t0 = Date.now();
    try {
      const r = await fetch(relay + path, Object.assign({ cache: 'no-store', credentials: 'omit' }, init || {}));
      return { name, status: r.status, date: r.headers.get('Date'), observedAt: r.headers.get('X-Sift-Observed-At'), retryAfter: r.headers.get('Retry-After'),
               vary: r.headers.get('Vary'), cacheControl: r.headers.get('Cache-Control'), pageClockMs: t0, pageClockAfterMs: Date.now() };
    } catch (e) { return { name, error: String(e && e.name || e) }; }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = '/markets?series_ticker=KXNFLGAME&status=open&limit=2';
  const rows = [];
  rows.push(await read('200 fresh', ok));
  await wait(2100);
  rows.push(await read('200 cached (2.1 s later)', ok));
  rows.push(await read('429', '/markets?series_ticker=KXRATE&status=open'));
  rows.push(await read('500 from upstream', '/markets?series_ticker=KXERR&status=open'));
  rows.push(await read('502 malformed upstream', '/markets?series_ticker=KXBAD&status=open'));
  rows.push(await read('502 upstream unreachable', '/markets?series_ticker=KXDROP&status=open'));
  rows.push(await read('400 refused query', '/portfolio/orders'));
  rows.push(await read('custom header (preflight)', ok, { headers: { 'X-Sift-Probe': '1' } }));
  return rows;
}`;

/** A page on its own origin; the probe is in it so the test drives fetch() from that origin. */
async function startPage(port = 0) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>relay date probe</title><p>probe</p><script>${PROBE}</script>`);
  });
  return { port: await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port))), server };
}

async function measure(label, source, browser) {
  const core = await loadCore(label, source);
  const up = await startFakeUpstream();
  const page = await startPage();
  const pageOrigin = `http://127.0.0.1:${page.port}`;
  const other = await startPage(); // a page on a third origin the relay does NOT allow: negative control
  const relay = await startRelay(core, up.port, pageOrigin);
  const relayOrigin = `http://127.0.0.1:${relay.port}`;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(pageOrigin);
  const rows = await p.evaluate(([relayUrl]) => window.probe(relayUrl), [relayOrigin]);
  const upstreamCallsForOk = up.seen.filter((s) => s.url.includes('KXNFLGAME')).length;
  await p.goto(`http://127.0.0.1:${other.port}`);
  const blocked = await p.evaluate(async (url) => { try { const r = await fetch(url); return { status: r.status, date: r.headers.get('Date') }; } catch (e) { return { error: String(e.name) }; } }, `${relayOrigin}/markets?series_ticker=KXNFLGAME&status=open&limit=2`);
  await ctx.close();
  // What is on the wire (a non-browser client sees every header): the Node host adds a Date by itself, so
  // BEFORE the browser's null is about CORS exposure, not about the header being absent.
  const wire = await new Promise((resolve, reject) => http.get(`${relayOrigin}/markets?series_ticker=KXNFLGAME&status=open`, { headers: { Origin: pageOrigin } }, (r) => { r.resume(); resolve({ date: r.headers.date ?? null, expose: r.headers['access-control-expose-headers'] ?? null }); }).on('error', reject));
  for (const s of [relay.server, page.server, other.server, up.server]) s.close();
  return { label, pageOrigin, relayOrigin, rows, wire, blocked, relayLog: relay.log, upstreamCallsForOk, upstreamSawOrigin: up.seen.some((s) => s.origin) };
}

/** --serve: the same servers for another browser (scripts/relay-webkit-date.py); prints one JSON line and stays up. */
async function serve() {
  const ref = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : null;
  const source = ref ? execFileSync('git', ['show', `${ref}:relay/core.ts`], { cwd: root, encoding: 'utf8' }) : (await import('node:fs')).readFileSync(join(root, 'relay/core.ts'), 'utf8');
  const core = await loadCore(ref ?? 'working-tree', source);
  const up = await startFakeUpstream();
  const page = await startPage(Number(process.env.PAGE_PORT ?? 0));
  const other = await startPage();
  const relay = await startRelay(core, up.port, `http://127.0.0.1:${page.port}`);
  console.log(JSON.stringify({ ref: ref ?? 'working tree', pageOrigin: `http://127.0.0.1:${page.port}`, otherOrigin: `http://127.0.0.1:${other.port}`, relayOrigin: `http://127.0.0.1:${relay.port}` }));
  setInterval(() => {}, 1 << 30);
  process.on('SIGTERM', () => { console.error(JSON.stringify({ relayLog: relay.log })); process.exit(0); });
  await new Promise(() => {});
}
if (process.argv.includes('--serve')) await serve();

const afterOnly = process.argv.includes('--after-only');
const beforeRef = process.env.BEFORE_REF ?? 'origin/main';
const launch = { args: ['--no-sandbox'], ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) };
const browser = await chromium.launch(launch);
let ok = true;
const show = (m) => {
  console.log(`\n== ${m.label}: page ${m.pageOrigin}  ->  relay ${m.relayOrigin}`);
  console.log(`   on the wire: Date=${JSON.stringify(m.wire.date)} Access-Control-Expose-Headers=${JSON.stringify(m.wire.expose)}`);
  for (const r of m.rows) console.log(`   ${r.name.padEnd(36)} status=${r.status} Date=${JSON.stringify(r.date)} X-Sift-Observed-At=${JSON.stringify(r.observedAt)} Retry-After=${JSON.stringify(r.retryAfter)} Cache-Control=${JSON.stringify(r.cacheControl)} Vary(control)=${JSON.stringify(r.vary)}`);
  console.log(`   page on a third origin the relay does not allow: ${JSON.stringify(m.blocked)} (a CORS block: nothing readable)`);
  const seen = m.relayLog.map((l) => `${l.method}${l.cacheControl ? '[cache-control: ' + l.cacheControl + ']' : ''}`);
  console.log(`   what the relay received from the browser (${seen.length}): ${seen.join(' ')}`);
  console.log(`   upstream calls for the OK listing (fresh + cached + preflight row): ${m.upstreamCallsForOk}`);
};
try {
  if (!afterOnly) {
    const before = await measure('BEFORE (' + beforeRef + ')', execFileSync('git', ['show', `${beforeRef}:relay/core.ts`], { cwd: root, encoding: 'utf8' }), browser);
    show(before);
    for (const r of before.rows) {
      if (r.name.startsWith('custom header')) { if (!r.error) { ok = false; console.log('   FAIL before/custom header: expected a CORS block'); } continue; }
      if (r.error) { ok = false; console.log(`   FAIL before/${r.name}: fetch failed (${r.error})`); continue; }
      if (r.date !== null) { ok = false; console.log(`   FAIL before/${r.name}: Date was readable (${r.date}), expected null`); }
    }
    if (before.rows[0].observedAt === null) { ok = false; console.log('   FAIL before/200: X-Sift-Observed-At should already be readable'); }
  }
  const { readFileSync } = await import('node:fs');
  const after = await measure('AFTER (working tree)', readFileSync(join(root, 'relay/core.ts'), 'utf8'), browser);
  show(after);
  const byName = Object.fromEntries(after.rows.map((r) => [r.name, r]));
  for (const r of after.rows) {
    if (r.name.startsWith('custom header')) { if (!r.error) { ok = false; console.log('   FAIL after/custom header: expected a CORS block'); } continue; }
    if (r.error) { ok = false; console.log(`   FAIL after/${r.name}: fetch failed (${r.error})`); continue; }
    const d = Date.parse(r.date ?? '');
    if (Number.isNaN(d)) { ok = false; console.log(`   FAIL after/${r.name}: Date not readable (${r.date})`); continue; }
    const skew = d - r.pageClockMs;
    console.log(`   ${r.name.padEnd(36)} relay Date minus page clock = ${skew} ms`);
    if (Math.abs(skew) > 5000) { ok = false; console.log(`   FAIL after/${r.name}: Date is not the current time`); }
    if (r.vary !== null) { ok = false; console.log(`   FAIL after/${r.name}: Vary became readable; only the listed headers may be exposed`); }
  }
  const fresh = byName['200 fresh'];
  const cached = byName['200 cached (2.1 s later)'];
  if (byName['429'].retryAfter !== '9') { ok = false; console.log('   FAIL after/429: Retry-After not readable'); }
  if (fresh.observedAt === null) { ok = false; console.log('   FAIL after/200: X-Sift-Observed-At not readable'); }
  const gap = Date.parse(cached.date) - Date.parse(fresh.date);
  console.log(`   cached answer: Date is ${gap / 1000} s later than the first answer's; X-Sift-Observed-At ${cached.observedAt === fresh.observedAt ? 'unchanged (still Kalshi\'s original observation)' : 'CHANGED'}`);
  if (!(gap >= 1000 && gap <= 4000)) { ok = false; console.log('   FAIL after/cached: Date was not the relay clock at serve time'); }
  if (cached.observedAt !== fresh.observedAt) { ok = false; console.log('   FAIL after/cached: X-Sift-Observed-At changed on a cached answer'); }
  if (after.upstreamCallsForOk > 2) { ok = false; console.log('   FAIL after/cached: the answer was not shared'); }
  for (const n of ['500 from upstream', '502 malformed upstream', '502 upstream unreachable', '400 refused query']) {
    const want = { '500 from upstream': 500, '502 malformed upstream': 502, '502 upstream unreachable': 502, '400 refused query': 400 }[n];
    if (byName[n].status !== want) { ok = false; console.log(`   FAIL after/${n}: status ${byName[n].status}, expected ${want}`); }
  }
  if (after.relayLog.filter((l) => l.method === 'OPTIONS').length !== 1) { ok = false; console.log('   FAIL after: expected exactly one preflight (the custom-header row only)'); }
  if (!after.blocked.error) { ok = false; console.log('   FAIL after: a page on a disallowed origin could read the relay'); }
  if (after.upstreamSawOrigin) { ok = false; console.log('   FAIL: an Origin header reached the fake upstream'); }
} finally {
  await browser.close();
}
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
