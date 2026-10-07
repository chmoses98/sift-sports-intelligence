// The live-quote feed publisher (read-only). Runs on a GitHub runner, where Kalshi's public market
// data answers because no browser Origin is involved (see src/live/providers/kalshi.ts for the
// evidence). It sweeps the open markets of every Kalshi series the sport publication uses, looks up
// the publication's own tickers that are no longer open (closed / suspended / settled), and writes one
// small JSON per game. Only games the publication itself lists are written: the canonical mapping
// (publication event -> Kalshi event suffix) comes from the publication, never from guessing.
//
// GET only. No credential. No order, account or portfolio endpoint is ever called.
import { HORIZON_DAYS, LOOKBACK_HOURS, isEligibleEvent, publicationStatus } from './slate.mjs';

export const FEED_SCHEMA = 'sift.live_quotes.v1';
export const INDEX_SCHEMA = 'sift.live_quotes.index.v1';
export const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';

/** Kalshi fields Sift reads (prices in dollars, sizes fixed-point); everything else is dropped. */
export const KEEP = [
  'ticker', 'event_ticker', 'status', 'yes_bid_dollars', 'yes_ask_dollars', 'no_bid_dollars', 'no_ask_dollars',
  'last_price_dollars', 'volume_fp', 'open_interest_fp', 'close_time', 'title', 'yes_sub_title', 'floor_strike',
  'cap_strike', 'strike_type',
];

export const gameKeyOf = (ticker) => (typeof ticker === 'string' ? ticker.split('-')[1] || null : null);

/** The time Kalshi produced the answer: its Date header minus any CDN Age. */
export function observedAt(res, fallbackMs) {
  const date = Date.parse(res.headers.get('date') ?? '');
  const age = Number(res.headers.get('age') ?? 0);
  const t = Number.isNaN(date) ? fallbackMs : date - (Number.isFinite(age) ? age * 1000 : 0);
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function compact(m, at) {
  const out = {};
  for (const k of KEEP) if (m[k] !== undefined && m[k] !== null && m[k] !== '') out[k] = m[k];
  out.observed_at = at;
  return out;
}

/** A polite GET with retry on 429/5xx and a pause between calls. */
export function makeGet({ fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, pauseMs = 120, log = () => {} } = {}) {
  let requests = 0;
  async function get(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(attempt ? 1000 * 2 ** attempt : pauseMs);
      requests++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'sift-live-quotes/1.0 (+https://github.com/chmoses98/sift-sports-intelligence)' } });
      } catch (e) {
        log(`network error ${url}: ${e}`);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        log(`HTTP ${res.status} ${url} (retrying)`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return { body: await res.json(), at: observedAt(res, now()) };
    }
    throw new Error(`gave up on ${url}`);
  }
  return { get, count: () => requests };
}

/**
 * Read the sport publication: the games it lists as current (scripts/live-quotes/slate.mjs), with their
 * published markets, and the publication's own health (CURRENT_SLATE / NO_CURRENT_GAMES / STALE_PUBLICATION).
 */
export async function readPublication(rawBase, get, { now = Date.now, horizonDays = HORIZON_DAYS, lookbackHours = LOOKBACK_HOURS, sport = null } = {}) {
  const { body: board } = await get(`${rawBase}/board.json`);
  const t = now();
  const publication = { sport, ...publicationStatus(board, t, { source: `${rawBase}/board.json`, horizonDays, lookbackHours }) };
  const games = [];
  for (const it of board.items ?? []) {
    if (!isEligibleEvent(it, t, { horizonDays, lookbackHours })) continue;
    const { body: detail } = await get(`${rawBase}/${it.detail_path}`);
    const markets = (detail.markets ?? []).filter((m) => typeof m.kalshi_ticker === 'string');
    const keys = new Set(markets.map((m) => gameKeyOf(m.kalshi_ticker)).filter(Boolean));
    for (const key of keys) {
      games.push({
        key,
        event_id: it.event_id,
        tickers: markets.filter((m) => gameKeyOf(m.kalshi_ticker) === key).map((m) => m.kalshi_ticker),
        series: [...new Set(markets.map((m) => m.kalshi_series_ticker || m.kalshi_ticker.split('-')[0]))],
      });
    }
  }
  return { games, publication };
}

/** The games the publication lists as upcoming/live, with their published markets. */
export async function publicationGames(rawBase, get, opts = {}) {
  return (await readPublication(rawBase, get, opts)).games;
}

/** One status for the feed: STALE if any sport's publication is, else CURRENT_SLATE if any has a current game. */
export function feedStatus(publications) {
  const s = publications.map((p) => p.status);
  return s.includes('STALE_PUBLICATION') ? 'STALE_PUBLICATION' : s.includes('CURRENT_SLATE') ? 'CURRENT_SLATE' : 'NO_CURRENT_GAMES';
}

/** Sweep Kalshi for those games: open markets by series (inventory), then published tickers not open. */
export async function sweep(games, get, { api = KALSHI, maxPages = 10, log = () => {} } = {}) {
  const keys = new Set(games.map((g) => g.key));
  const byKey = new Map(games.map((g) => [g.key, new Map()]));
  const errors = [];
  const series = [...new Set(games.flatMap((g) => g.series))].sort();
  for (const s of series) {
    let cursor = '';
    for (let page = 0; page < maxPages; page++) {
      let r;
      try {
        r = await get(`${api}/markets?series_ticker=${encodeURIComponent(s)}&status=open&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      } catch (e) {
        errors.push(`series ${s}: ${e.message ?? e}`);
        break;
      }
      for (const m of r.body.markets ?? []) {
        const k = gameKeyOf(m.ticker);
        if (keys.has(k)) byKey.get(k).set(m.ticker, compact(m, r.at));
      }
      cursor = r.body.cursor || '';
      if (!cursor) break;
    }
  }
  // Published tickers the open sweep did not return: ask for them by ticker (any status).
  const notSeen = games.flatMap((g) => g.tickers.filter((t) => !byKey.get(g.key).has(t)));
  for (let i = 0; i < notSeen.length; i += 100) {
    const chunk = notSeen.slice(i, i + 100);
    try {
      const r = await get(`${api}/markets?tickers=${chunk.map(encodeURIComponent).join(',')}&limit=1000`);
      for (const m of r.body.markets ?? []) {
        const k = gameKeyOf(m.ticker);
        if (keys.has(k)) byKey.get(k).set(m.ticker, compact(m, r.at));
      }
    } catch (e) {
      errors.push(`tickers ${i}-${i + chunk.length}: ${e.message ?? e}`);
    }
  }
  log(`swept ${series.length} series, ${notSeen.length} published tickers by ticker`);
  return { byKey, errors };
}

export function buildFiles(games, byKey, { generatedAt, source = 'kalshi-public via github-actions (sift live-quotes feed)', sports = ['NFL'], errors = [], requests = 0, publications = null }) {
  const files = new Map();
  const index = { schema: INDEX_SCHEMA, generated_at: generatedAt, sports, requests, errors, games: [] };
  // Source health (optional, additive): which publication was read, how old it was, how many current games it
  // listed, and its status. A reader can tell a healthy empty feed (NO_CURRENT_GAMES) from a broken source.
  if (publications) Object.assign(index, { status: feedStatus(publications), publications });
  const grouped = new Map();
  for (const g of games) {
    const cur = grouped.get(g.key) ?? { key: g.key, event_ids: [], tickers: new Set() };
    cur.event_ids.push(g.event_id);
    g.tickers.forEach((t) => cur.tickers.add(t));
    grouped.set(g.key, cur);
  }
  for (const g of grouped.values()) {
    const markets = [...(byKey.get(g.key)?.values() ?? [])].sort((a, b) => a.ticker.localeCompare(b.ticker));
    const checked = [...new Set([...g.tickers, ...markets.map((m) => m.ticker)])].sort();
    files.set(`games/${g.key}.json`, {
      schema: FEED_SCHEMA, game_key: g.key, generated_at: generatedAt, source, event_ids: [...new Set(g.event_ids)].sort(),
      tickers_checked: checked, markets,
    });
    const obs = markets.map((m) => m.observed_at).sort();
    index.games.push({ key: g.key, file: `games/${g.key}.json`, event_ids: [...new Set(g.event_ids)].sort(), markets: markets.length, published: g.tickers.size, newly_listed: markets.filter((m) => !g.tickers.has(m.ticker)).length, observed_from: obs[0] ?? null, observed_to: obs[obs.length - 1] ?? null });
  }
  index.games.sort((a, b) => a.key.localeCompare(b.key));
  files.set('index.json', index);
  return files;
}
