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
// Exit 0 only if BEFORE reads null for Date and AFTER reads a Date within a few seconds of the page clock.
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
    const limited = req.url.includes('KXRATE');
    res.writeHead(limited ? 429 : 200, { 'content-type': 'application/json', age: '2', ...(limited ? { 'retry-after': '9' } : {}) });
    res.end(JSON.stringify(limited ? { error: 'too_many_requests' } : { markets: [{ ticker: 'KXNFLGAME-26OCT26AABB-AA', yes_bid_dollars: '0.5100' }], cursor: '' }));
  });
  return { port: await listen(server), seen, server };
}

/** Node http adapter: IncomingMessage -> Request -> handleRelay -> ServerResponse (what a host does). */
async function startRelay(core, upstreamPort, allowedOrigin) {
  const cache = new core.MemoryRelayCache();
  const fetchImpl = (url, init) => fetch(String(url).replace(core.UPSTREAM, `http://127.0.0.1:${upstreamPort}`), init);
  const server = http.createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers });
    const out = await core.handleRelay(request, { allowedOrigins: [allowedOrigin], fetchImpl, cache });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return { port: await listen(server), server };
}

/** A page on its own origin, with nothing in it but a blank document; the test drives fetch() from it. */
async function startPage() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>relay date probe</title><p>probe</p>');
  });
  return { port: await listen(server), server };
}

async function measure(label, source, browser) {
  const core = await loadCore(label, source);
  const up = await startFakeUpstream();
  const page = await startPage();
  const pageOrigin = `http://127.0.0.1:${page.port}`;
  const relay = await startRelay(core, up.port, pageOrigin);
  const relayOrigin = `http://127.0.0.1:${relay.port}`;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(pageOrigin);
  const rows = {};
  for (const [name, path] of [['200', '/markets?series_ticker=KXNFLGAME&status=open&limit=2'], ['429', '/markets?series_ticker=KXRATE&status=open']]) {
    rows[name] = await p.evaluate(async (url) => {
      const before = Date.now();
      const r = await fetch(url);
      return {
        pageOrigin: location.origin,
        status: r.status,
        date: r.headers.get('Date'),
        observedAt: r.headers.get('X-Sift-Observed-At'),
        retryAfter: r.headers.get('Retry-After'),
        vary: r.headers.get('Vary'), // sent but not CORS-safelisted and not exposed: the control that proves the filter is real
        pageClockMs: before,
      };
    }, relayOrigin + path);
  }
  await ctx.close();
  // What is on the wire (a non-browser client sees every header): the Node host adds a Date by itself, so
  // BEFORE the browser's null is about CORS exposure, not about the header being absent.
  const wire = await new Promise((resolve, reject) => http.get(`${relayOrigin}/markets?series_ticker=KXNFLGAME&status=open`, { headers: { Origin: pageOrigin } }, (r) => { r.resume(); resolve({ date: r.headers.date ?? null, expose: r.headers['access-control-expose-headers'] ?? null }); }).on('error', reject));
  for (const s of [relay.server, page.server, up.server]) s.close();
  return { label, pageOrigin, relayOrigin, rows, wire, upstreamSawOrigin: up.seen.some((s) => s.origin) };
}

const afterOnly = process.argv.includes('--after-only');
const beforeRef = process.env.BEFORE_REF ?? 'origin/main';
const launch = { args: ['--no-sandbox'], ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) };
const browser = await chromium.launch(launch);
let ok = true;
const show = (m) => {
  console.log(`\n== ${m.label}: page ${m.pageOrigin}  ->  relay ${m.relayOrigin}`);
  console.log(`   on the wire: Date=${JSON.stringify(m.wire.date)} Access-Control-Expose-Headers=${JSON.stringify(m.wire.expose)}`);
  for (const [k, r] of Object.entries(m.rows)) console.log(`   ${k}: status=${r.status} Date=${JSON.stringify(r.date)} X-Sift-Observed-At=${JSON.stringify(r.observedAt)} Retry-After=${JSON.stringify(r.retryAfter)} Vary(control)=${JSON.stringify(r.vary)}`);
};
try {
  if (!afterOnly) {
    const before = await measure('BEFORE (' + beforeRef + ')', execFileSync('git', ['show', `${beforeRef}:relay/core.ts`], { cwd: root, encoding: 'utf8' }), browser);
    show(before);
    for (const [k, r] of Object.entries(before.rows)) {
      if (r.date !== null) { ok = false; console.log(`   FAIL before/${k}: Date was readable (${r.date}), expected null`); }
      if (r.observedAt === null && k === '200') { ok = false; console.log('   FAIL before/200: X-Sift-Observed-At should already be readable'); }
    }
  }
  const { readFileSync } = await import('node:fs');
  const after = await measure('AFTER (working tree)', readFileSync(join(root, 'relay/core.ts'), 'utf8'), browser);
  show(after);
  for (const [k, r] of Object.entries(after.rows)) {
    const d = Date.parse(r.date ?? '');
    if (Number.isNaN(d)) { ok = false; console.log(`   FAIL after/${k}: Date not readable (${r.date})`); continue; }
    const skew = d - r.pageClockMs;
    console.log(`   ${k}: relay Date minus page clock = ${skew} ms`);
    if (Math.abs(skew) > 5000) { ok = false; console.log(`   FAIL after/${k}: Date is not the current time`); }
    if (r.vary !== null) { ok = false; console.log(`   FAIL after/${k}: Vary became readable; only the listed headers may be exposed`); }
  }
  if (after.rows['429'].retryAfter !== '9') { ok = false; console.log('   FAIL after/429: Retry-After not readable'); }
  if (after.rows['200'].observedAt === null) { ok = false; console.log('   FAIL after/200: X-Sift-Observed-At not readable'); }
  if (after.upstreamSawOrigin) { ok = false; console.log('   FAIL: an Origin header reached the fake upstream'); }
} finally {
  await browser.close();
}
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
