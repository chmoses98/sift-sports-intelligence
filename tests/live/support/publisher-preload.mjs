// Preload for running scripts/publish-live-quotes.mjs end to end in a test (node --import): no network, a fixed
// clock, no pauses. The NFL publication is served from the repo snapshot, Kalshi answers from a tiny fake, the
// NHL and MLB publications are unreadable (so those sports are excluded, which is a normal, tested state).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SNAPSHOT = process.env.TEST_NFL_SNAPSHOT_DIR;
const NFL_BASE = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/';
const DATE = 'Sun, 04 Oct 2026 15:00:10 GMT';

let tick = Date.parse('2026-10-04T15:00:00Z');
Date.now = () => (tick += 50);
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => realSetTimeout(fn, 0, ...a);

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith(NFL_BASE)) {
    return new Response(readFileSync(join(SNAPSHOT, u.slice(NFL_BASE.length))), { headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://raw.githubusercontent.com/')) return new Response('not found', { status: 404 });
  const q = new URL(u);
  const headers = { 'content-type': 'application/json', date: DATE, age: '4' };
  if (q.searchParams.get('series_ticker') === 'KXNFLGAME') {
    return new Response(JSON.stringify({ cursor: '', markets: [{ ticker: 'KXNFLGAME-26OCT04NEBUF-BUF', event_ticker: 'KXNFLGAME-26OCT04NEBUF', status: 'active', yes_bid_dollars: '0.6400', yes_ask_dollars: '0.6500' }] }), { headers });
  }
  return new Response(JSON.stringify({ cursor: '', markets: [] }), { headers });
};
