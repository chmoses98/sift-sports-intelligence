// Read-only evidence probe of Kalshi's public market-data API (no credentials, GET only).
// Answers, from a real network: which endpoints answer unauthenticated, CORS headers for Sift's
// production origin, response schema, batching (`tickers=`), event lookup, rate-limit headers, and
// whether a real Chromium/WebKit page on the GitHub Pages origin can read quotes directly.
// Run: node scripts/kalshi-probe.mjs [--browsers]   (writes kalshi-probe.json)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.elections.kalshi.com/trade-api/v2';
const ORIGIN = 'https://chmoses98.github.io';
const report = { at: new Date().toISOString(), api: API, checks: [] };

const pickHeaders = (h) => Object.fromEntries([...h.entries()].filter(([k]) => /^(access-control|ratelimit|x-ratelimit|retry-after|cache-control|age|date|vary|content-type|cf-cache-status|etag|last-modified)/i.test(k)));

async function get(name, path, init = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(API + path, { headers: { Accept: 'application/json', 'User-Agent': 'sift-probe/0.1 (+https://github.com/chmoses98/sift-sports-intelligence)' }, ...init });
    const ms = Math.round(performance.now() - t0);
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
    const row = { name, path, status: res.status, ms, headers: pickHeaders(res.headers), bytes: text.length };
    report.checks.push(row);
    console.log(`${name}: ${res.status} ${ms}ms ${text.length}B ${JSON.stringify(row.headers)}`);
    return { res, body, row };
  } catch (e) {
    report.checks.push({ name, path, error: String(e) });
    console.log(`${name}: ERROR ${e}`);
    return { body: null };
  }
}

// Tickers Sift publishes today (from the bundled NFL snapshot).
const dir = 'public/data/nfl/app/latest/event_detail';
const pub = [];
for (const f of readdirSync(dir)) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const m of d.markets) pub.push({ t: m.kalshi_ticker, e: m.kalshi_event_ticker, s: m.kalshi_series_ticker, start: d.event.start_time_utc });
}
report.published_tickers = pub.length;

// Which request shapes does Kalshi accept? A browser always sends Origin (and a browser UA); a
// server-side worker sends neither. Each variant hits the same tiny read.
const UA_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
report.variants = {};
for (const [name, headers] of [
  ['no_origin_default_ua', {}],
  ['no_origin_worker_ua', { 'User-Agent': 'sift-probe/0.1 (+https://github.com/chmoses98/sift-sports-intelligence)' }],
  ['no_origin_browser_ua', { 'User-Agent': UA_BROWSER }],
  ['origin_pages', { Origin: ORIGIN }],
  ['origin_pages_browser_ua', { Origin: ORIGIN, 'User-Agent': UA_BROWSER }],
  ['origin_kalshi', { Origin: 'https://kalshi.com' }],
  ['origin_localhost', { Origin: 'http://localhost:4173' }],
]) {
  const r = await fetch(`${API}/markets?series_ticker=KXNFLGAME&limit=2`, { headers });
  const text = await r.text();
  report.variants[name] = { status: r.status, headers: pickHeaders(r.headers), body: text.slice(0, 160) };
  console.log(`variant ${name}: ${r.status} ${JSON.stringify(pickHeaders(r.headers))} ${text.slice(0, 120)}`);
}

await get('exchange_status', '/exchange/status');
const open = await get('markets_open_series', '/markets?series_ticker=KXNFLGAME&status=open&limit=20');
const sample = open.body?.markets?.[0];
if (sample) {
  report.market_fields = Object.keys(sample).sort();
  report.market_sample = sample;
}
// Batch by ticker: the most current-looking published tickers first.
const upcoming = pub.filter((p) => Date.parse(p.start) > Date.now() - 6 * 3600e3);
const batch = (upcoming.length ? upcoming : pub).slice(0, 100).map((p) => p.t);
const batch60 = batch.slice(0, 60);
const b = await get('markets_by_tickers_100', `/markets?tickers=${encodeURIComponent(batch.join(','))}&limit=1000`);
report.tickers_batch = { requested: batch.length, returned: b.body?.markets?.length ?? null, cursor: b.body?.cursor ?? null,
  statuses: Object.entries((b.body?.markets ?? []).reduce((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {})) };
const b2 = await get('markets_by_tickers_250', `/markets?tickers=${encodeURIComponent((upcoming.length ? upcoming : pub).slice(0, 250).map((p) => p.t).join(','))}&limit=1000`);
report.tickers_batch_250 = { returned: b2.body?.markets?.length ?? null, status: b2.row?.status };
const ev = (upcoming[0] ?? pub[0])?.e;
if (ev) {
  const e1 = await get('markets_by_event', `/markets?event_ticker=${ev}&limit=1000`);
  report.event_markets = { event: ev, returned: e1.body?.markets?.length ?? null };
  const e2 = await get('event_nested', `/events/${ev}?with_nested_markets=true`);
  report.event_nested_keys = e2.body && typeof e2.body === 'object' ? Object.keys(e2.body) : null;
  const evs = await get('markets_multi_event', `/markets?event_ticker=${[...new Set(upcoming.map((p) => p.e))].slice(0, 10).join(',')}&limit=1000`);
  report.multi_event = { returned: evs.body?.markets?.length ?? null, status: evs.row?.status };
}
if (batch[0]) {
  await get('market_single', `/markets/${batch[0]}`);
  const ob = await get('orderbook', `/markets/${batch[0]}/orderbook?depth=3`);
  report.orderbook_keys = ob.body && typeof ob.body === 'object' ? Object.keys(ob.body) : null;
}
// Preflight: Sift sends only simple GETs (no custom headers), but record what OPTIONS says.
await get('preflight', '/markets?limit=1', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } });
await get('get_with_origin', '/markets?limit=1', { headers: { Origin: ORIGIN } });
// Gentle burst: 20 sequential reads, record any 429.
let n429 = 0;
const t0 = performance.now();
for (let i = 0; i < 20; i++) {
  const r = await fetch(`${API}/markets?tickers=${batch.slice(0, 20).join(',')}`);
  if (r.status === 429) n429++;
  await r.arrayBuffer();
}
report.burst = { requests: 20, ms: Math.round(performance.now() - t0), status429: n429 };

if (process.argv.includes('--browsers')) {
  const { chromium, webkit } = await import('@playwright/test');
  report.browser = {};
  for (const [name, bt] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await bt.launch();
    try {
      const page = await browser.newPage();
      await page.goto('https://chmoses98.github.io/sift-sports-intelligence/', { waitUntil: 'domcontentloaded' });
      report.browser[name] = await page.evaluate(async ({ api, tickers }) => {
        const t = performance.now();
        try {
          const r = await fetch(`${api}/markets?tickers=${tickers.join(',')}`);
          const j = await r.json();
          return { ok: r.ok, status: r.status, n: j.markets?.length ?? null, ms: Math.round(performance.now() - t), acao: r.headers.get('access-control-allow-origin') };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }, { api: API, tickers: batch.slice(0, 50) });
    } catch (e) {
      report.browser[name] = { ok: false, error: String(e) };
    } finally {
      await browser.close();
    }
    console.log(`browser ${name}: ${JSON.stringify(report.browser[name])}`);
  }
}

writeFileSync('kalshi-probe.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, market_sample: undefined }, null, 2));
console.log('MARKET SAMPLE', JSON.stringify(report.market_sample, null, 2));
