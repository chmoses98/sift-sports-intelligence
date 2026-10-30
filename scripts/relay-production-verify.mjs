// End-to-end proof of the DEPLOYED quote relay, from a GitHub-hosted runner (the relay host is not reachable from every network).
//
//   SIFT_QUOTE_RELAY_URL=https://sift-quote-relay.vercel.app node scripts/relay-production-verify.mjs
//
// Read-only: GET and a few cheap reads, no credentials. Prints one PASS / FAIL / INFO line per fact and exits 1 on any FAIL.
//   1  real market reads through the relay (tickers from the live feed, and the series / event queries Sift sends), JSON shape, prices in range
//   2  freshness: X-Sift-Observed-At is Kalshi's own response time and must be recent; Cache-Control no-store; no invented rows
//   3  CORS from Sift's real origin: allow-origin, expose list (Date, X-Sift-Observed-At, Retry-After); a disallowed origin gets no allow-origin
//   4  a real Chromium and a real WebKit page ON the GitHub Pages origin read Date and X-Sift-Observed-At; a +10 min device clock is
//      measured exactly from Date; a page on another origin cannot read the relay at all
//   5  429 handling: any 429 in a burst carries Retry-After (and CORS), and the app falls back to the GitHub feed when the relay answers 429 or is down
import { chromium, webkit, devices } from '@playwright/test';

const RELAY = (process.env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
const BASE = (process.env.SIFT_URL ?? 'https://chmoses98.github.io/sift-sports-intelligence/').replace(/\/?$/, '/');
const FEED = (process.env.SIFT_FEED_URL ?? 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes').replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
if (!RELAY) {
  console.log('FAIL SIFT_QUOTE_RELAY_URL is not set');
  process.exit(1);
}
let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) failed++;
  return c;
};
const info = (m) => console.log(`INFO ${m}`);
const get = (path, origin = ORIGIN) => fetch(`${RELAY}${path}`, { headers: origin ? { origin } : {}, cache: 'no-store' });
const feedJson = async (p) => (await fetch(`${FEED}/${p}`, { cache: 'no-store' })).json();

// ---- 1-3: node-level reads (headers a browser may not see are checked in the browser section)
const index = await feedJson('index.json');
const game = index.games.find((g) => g.sport === 'NFL') ?? index.games[0];
const gameDoc = await feedJson(game.file);
const tickers = gameDoc.markets.map((m) => m.ticker).slice(0, 12);
info(`feed generated ${index.generated_at}; using ${game.key} (${gameDoc.markets.length} markets), ${tickers.length} tickers`);

const q = `/markets?tickers=${tickers.join(',')}`;
const r1 = await get(q);
const body1 = await r1.json().catch(() => null);
ok(r1.status === 200 && Array.isArray(body1?.markets), `GET ${q.slice(0, 60)}… -> HTTP ${r1.status}, ${body1?.markets?.length ?? 'no'} markets`);
const got = new Set((body1?.markets ?? []).map((m) => m.ticker));
ok(got.size > 0 && [...got].every((t) => tickers.includes(t)), `the relay returned only requested tickers (${got.size} of ${tickers.length}; none invented)`);
const priced = (body1?.markets ?? []).filter((m) => m.yes_ask_dollars != null);
ok(priced.length > 0 && priced.every((m) => Number(m.yes_ask_dollars) >= 0 && Number(m.yes_ask_dollars) <= 1), `prices are real dollars in [0,1] (${priced.length} priced)`);
const obs = Date.parse(r1.headers.get('x-sift-observed-at') ?? '');
ok(Number.isFinite(obs) && Math.abs(Date.now() - obs) < 60_000, `X-Sift-Observed-At is Kalshi's response time and fresh (${Number.isFinite(obs) ? Math.round((Date.now() - obs) / 1000) : 'missing'} s old)`);
const dateMs = Date.parse(r1.headers.get('date') ?? '');
ok(Number.isFinite(dateMs) && Math.abs(Date.now() - dateMs) < 60_000, `Date is the relay's serve time (${Number.isFinite(dateMs) ? Math.round((Date.now() - dateMs) / 1000) : 'missing'} s from this runner)`);
ok(/no-store/.test(r1.headers.get('cache-control') ?? ''), `Cache-Control: ${r1.headers.get('cache-control')}`);
ok(r1.headers.get('access-control-allow-origin') === ORIGIN, `Access-Control-Allow-Origin = ${r1.headers.get('access-control-allow-origin')}`);
const expose = (r1.headers.get('access-control-expose-headers') ?? '').toLowerCase();
ok(['date', 'x-sift-observed-at', 'retry-after'].every((h) => expose.includes(h)), `Access-Control-Expose-Headers: ${expose}`);

// the series / event queries the app and the monitors send; any non-200 is reported with the body so a 400 is diagnosable
for (const [label, path] of [
  ['series, limit 2 (the request reported as 400)', '/markets?series_ticker=KXNFLGAME&status=open&limit=2'],
  ['series, no limit', '/markets?series_ticker=KXNFLGAME&status=open'],
  ['series, limit 1000', '/markets?series_ticker=KXNFLGAME&status=open&limit=1000'],
  ['event', `/markets?event_ticker=${gameDoc.markets[0].event_ticker}`],
]) {
  const r = await get(path);
  const t = await r.text();
  let n = null;
  try {
    n = JSON.parse(t).markets?.length ?? null;
  } catch {}
  ok(r.status === 200 && n !== null, `${label}: HTTP ${r.status}${n !== null ? `, ${n} markets` : `, body ${t.slice(0, 160)}`}`);
}

// refusals stay refusals and keep CORS (a bad query is 400 with the allowed origin, a disallowed origin gets no allow-origin header)
const bad = await get('/markets?foo=bar');
ok(bad.status === 400 && bad.headers.get('access-control-allow-origin') === ORIGIN, `a query the relay does not accept -> HTTP ${bad.status}, with CORS`);
const evil = await get(q, 'https://evil.example');
ok(!evil.headers.get('access-control-allow-origin'), `a disallowed origin gets no Access-Control-Allow-Origin (HTTP ${evil.status})`);
const none = await get(q, null);
ok(!none.headers.get('access-control-allow-origin'), `a request with no Origin gets no Access-Control-Allow-Origin (HTTP ${none.status})`);

// ---- 5: 429 handling in a burst of distinct reads
const burst = await Promise.all(Array.from({ length: 24 }, (_, i) => get(`/markets?series_ticker=KXNFLGAME&status=open&limit=${3 + i}`)));
const limited = burst.filter((r) => r.status === 429);
info(`burst of ${burst.length}: ${burst.filter((r) => r.status === 200).length}x200, ${limited.length}x429, other ${burst.filter((r) => ![200, 429].includes(r.status)).map((r) => r.status).join(',') || 'none'}`);
ok(burst.every((r) => [200, 429].includes(r.status)), 'the burst produced only 200 and 429');
ok(limited.every((r) => Number(r.headers.get('retry-after')) > 0 && r.headers.get('access-control-allow-origin') === ORIGIN), limited.length ? `every 429 carries Retry-After (${limited[0].headers.get('retry-after')} s) and CORS` : 'no 429 occurred (nothing to check)');

// ---- 4: real browsers on the real origin
const browsers = [['chromium', chromium, {}], ['webkit', webkit, {}]];
for (const [name, engine] of browsers) {
  const browser = await engine.launch();
  try {
    const page = await (await browser.newContext(name === 'webkit' ? devices['iPhone 14'] : {})).newPage();
    await page.goto(`${BASE}version.json`); // a real document on the allowed origin
    const read = (url) => page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { cache: 'no-store', credentials: 'omit' });
        const b = await res.json().catch(() => null);
        return { status: res.status, date: res.headers.get('date'), observed: res.headers.get('x-sift-observed-at'), n: b?.markets?.length ?? null, origin: location.origin };
      } catch (e) {
        return { error: String(e) };
      }
    }, url);
    const r = await read(`${RELAY}${q}`);
    ok(!r.error && r.status === 200 && r.n > 0, `${name}: page on ${r.origin} read ${r.n} markets from the relay (HTTP ${r.status})`);
    ok(Number.isFinite(Date.parse(r.date ?? '')) && Number.isFinite(Date.parse(r.observed ?? '')), `${name}: JavaScript reads Date (${r.date}) and X-Sift-Observed-At (${r.observed})`);
    // clock-skew correction: a device clock 10 minutes fast must be measured from Date alone
    await page.addInitScript(() => {
      const real = Date.now.bind(Date);
      const offset = 10 * 60_000;
      Date.now = () => real() + offset;
    });
    await page.reload();
    const f = await read(`${RELAY}${q}`);
    const skewS = Number.isFinite(Date.parse(f.date ?? '')) ? (Date.parse(f.date) - (await page.evaluate(() => Date.now()))) / 1000 : NaN;
    ok(Number.isFinite(skewS) && Math.abs(skewS + 600) < 10, `${name}: a +10 min device clock is measured from Date as ${Math.round(skewS)} s (expected about -600)`);
    // a page on another origin must not be able to read the relay
    await page.goto('https://example.com/');
    const x = await page.evaluate(async (u) => {
      try {
        await fetch(u, { cache: 'no-store', credentials: 'omit' });
        return 'READABLE';
      } catch {
        return 'BLOCKED';
      }
    }, `${RELAY}${q}`);
    ok(x === 'BLOCKED', `${name}: a page on https://example.com cannot read the relay (${x})`);
  } catch (e) {
    ok(false, `${name}: ${String(e).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

// ---- 5b: the app falls back to the GitHub feed when the relay is down or rate limited (never a stale price shown as current)
const readPrices = () => {
  const t = document.querySelector('.v4-gstat')?.innerText ?? '';
  const m = /Prices (live|aging|stale) · (.+)/.exec(t);
  return m ? `${m[1]} · ${m[2]}` : t.replace(/\s+/g, ' ').slice(0, 60);
};
for (const [label, handler] of [
  ['relay answering 429', (route) => route.fulfill({ status: 429, headers: { 'retry-after': '30', 'access-control-allow-origin': ORIGIN, 'access-control-expose-headers': 'Retry-After' }, body: '{"error":"too_many_requests"}' })],
  ['relay unreachable', (route) => route.abort('connectionrefused')],
]) {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await page.route(`${RELAY}/**`, handler);
    // a game the quote feed covers (a listed game the feed does not cover would, correctly, show the publication's old snapshot)
    const idx = await feedJson('index.json');
    const g = idx.games.find((x) => x.sport === 'NFL') ?? idx.games[0];
    const href = `#/v4/game/${g.sport.toLowerCase()}/${g.event_ids[0]}`;
    await page.goto(`${BASE}${href}`);
    await page.waitForFunction(() => /Prices (live|aging)/.test(document.querySelector('.v4-gstat')?.innerText ?? ''), null, { timeout: 40_000 }).catch(() => {});
    const shown = await page.evaluate(readPrices);
    const feedAge = (Date.now() - Date.parse(g.observed_to)) / 60_000;
    ok(/^(live|aging) · /.test(shown), `fallback (${label}): the game page shows "${shown}" from the GitHub feed (feed ${Number.isFinite(feedAge) ? feedAge.toFixed(1) : '?'} min old)`);
  } catch (e) {
    ok(false, `fallback (${label}): ${String(e).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

console.log(failed ? `\nrelay production verification FAILED (${failed})` : '\nrelay production verification passed');
process.exit(failed ? 1 : 0);
