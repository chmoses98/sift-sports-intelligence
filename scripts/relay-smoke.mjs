// Measured rate-limit smoke test of a Sift quote relay (or, as a control, Kalshi directly), from a
// real network. Read-only GETs of public market data; no credentials.
//
//   RELAY_URL=https://sift-quote-relay.vercel.app node scripts/relay-smoke.mjs
//   RELAY_URL=https://api.elections.kalshi.com/trade-api/v2 DIRECT=1 node scripts/relay-smoke.mjs
//
// Phases: 1 request · 10 sequential · 20-request burst · 100-ticker batches · one realistic refresh
// cycle of three game screens (every series listing + every ticker batch, 4 in flight).
// Every request is distinct (the relay shares identical reads for 5 s), so each one reaches Kalshi.
// Records status distribution, latency, 429s, 5xx, Retry-After and quote observation age.
// Exits non-zero on any non-200 unless ALLOW_FAIL=1 (used for baselines of other hosts).
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.RELAY_URL ?? '').trim().replace(/\/+$/, '');
const DIRECT = process.env.DIRECT === '1';
const ORIGIN = process.env.SIFT_ORIGIN ?? 'https://chmoses98.github.io';
const LABEL = process.env.LABEL ?? (DIRECT ? `direct ${BASE}` : BASE);
if (!/^https:\/\//.test(BASE)) {
  console.error('RELAY_URL must be an https URL');
  process.exit(2);
}

const all = [];
async function get(phase, query) {
  const url = `${BASE}/markets?${query}`;
  const t0 = performance.now();
  const row = { phase, query: query.slice(0, 80), status: 0, ms: 0, bytes: 0, retryAfter: null, ageS: null, markets: null, error: null };
  try {
    const res = await fetch(url, { headers: DIRECT ? { Accept: 'application/json' } : { Origin: ORIGIN }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    row.ms = Math.round(performance.now() - t0);
    row.status = res.status;
    row.bytes = text.length;
    row.retryAfter = res.headers.get('retry-after');
    if (!DIRECT && res.status === 200 && res.headers.get('access-control-allow-origin') !== ORIGIN) row.error = 'missing CORS for Sift';
    const observed = DIRECT ? res.headers.get('date') : res.headers.get('x-sift-observed-at');
    if (observed && !Number.isNaN(Date.parse(observed))) row.ageS = Math.round((Date.now() - Date.parse(observed)) / 100) / 10;
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j.markets)) row.markets = j.markets;
    } catch {
      /* non-JSON: counted by status */
    }
  } catch (e) {
    row.ms = Math.round(performance.now() - t0);
    row.error = String(e?.cause ?? e).slice(0, 120);
  }
  all.push(row);
  return row;
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

const q = (o) => new URLSearchParams(o).toString();
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);

// Tickers and series from three real games in this repo's NFL research snapshot.
const DIR = join(process.cwd(), 'public', 'data', 'nfl', 'app', 'latest', 'event_detail');
const games = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().slice(0, 3).map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf-8')).markets.map((m) => m.kalshi_ticker).filter(Boolean));
const series = [...new Set(games.flat().map((t) => t.split('-')[0]))].sort();
const batches = (ts) => Array.from({ length: Math.ceil(ts.length / 100) }, (_, i) => ts.slice(i * 100, i * 100 + 100));

console.log(`relay smoke: ${LABEL}${DIRECT ? '' : ` (Origin ${ORIGIN})`}\n`);
await get('1 request', q({ series_ticker: 'KXNFLGAME', status: 'open', limit: 1000 }));
for (let i = 0; i < 10; i++) await get('10 sequential', q({ series_ticker: 'KXNFLGAME', status: 'open', limit: 999 - i }));
await Promise.all(Array.from({ length: 20 }, (_, i) => get('20 burst', q({ series_ticker: series[i % series.length], status: 'open', limit: 980 - i }))));
for (const b of batches(games.flat()).slice(0, 6)) await get('100-ticker batches', q({ tickers: b.join(','), limit: 1000 }));
await pool([...series.map((s) => ({ series_ticker: s, status: 'open', limit: 1000 })), ...games.flatMap((g) => batches(g).map((b) => ({ tickers: b.join(','), limit: 999 })))], 4, (o) => get('3-game refresh cycle', q(o)));

const phases = [...new Set(all.map((r) => r.phase))];
const lines = [`### Relay smoke: ${LABEL}`, '', `${new Date().toISOString()} · ${all.length} requests · ${series.length} series, ${games.flat().length} tickers from 3 games`, '', '| phase | n | statuses | 429 | 5xx | errors | p50 ms | p95 ms | max ms | Retry-After | quote age p50 / max (s) | avg KB |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const p of [...phases, 'ALL']) {
  const rs = p === 'ALL' ? all : all.filter((r) => r.phase === p);
  const st = Object.entries(rs.reduce((a, r) => ((a[r.status || 'net'] = (a[r.status || 'net'] ?? 0) + 1), a), {})).map(([k, v]) => `${k}×${v}`).join(' ');
  const ms = rs.map((r) => r.ms);
  const ages = rs.map((r) => r.ageS).filter((x) => x != null);
  const ra = [...new Set(rs.map((r) => r.retryAfter).filter(Boolean))].join(',') || '—';
  lines.push(`| ${p} | ${rs.length} | ${st} | ${rs.filter((r) => r.status === 429).length} | ${rs.filter((r) => r.status >= 500).length} | ${rs.filter((r) => r.error).length} | ${pct(ms, 50)} | ${pct(ms, 95)} | ${Math.max(...ms)} | ${ra} | ${pct(ages, 50) ?? '—'} / ${ages.length ? Math.max(...ages) : '—'} | ${Math.round(rs.reduce((a, r) => a + r.bytes, 0) / rs.length / 102.4) / 10} |`);
}
const quoteTimes = all.flatMap((r) => r.markets ?? []).map((m) => m.updated_time ?? m.last_updated_time).filter(Boolean).sort();
if (quoteTimes.length) lines.push('', `Kalshi market updated_time range across answers: ${quoteTimes[0]} … ${quoteTimes[quoteTimes.length - 1]}`);
const bad = all.filter((r) => r.status !== 200 || r.error);
if (bad.length) lines.push('', 'Non-200 / errors:', ...bad.slice(0, 15).map((r) => `- ${r.phase}: ${r.status || 'network'} ${r.error ?? ''} ${r.retryAfter ? `retry-after=${r.retryAfter}` : ''} (${r.query})`));
const md = lines.join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n\n`);
if (bad.length && process.env.ALLOW_FAIL !== '1') {
  console.error(`\nRELAY SMOKE FAILED: ${bad.length} of ${all.length} requests were not a clean 200`);
  process.exit(1);
}
