// The live-quote feed publisher (read-only). Runs on a GitHub runner, where Kalshi's public market
// data answers because no browser Origin is involved (see src/live/providers/kalshi.ts for the
// evidence). It sweeps the open markets of every Kalshi series the sport publication uses, looks up
// the publication's own tickers that are no longer open (closed / suspended / settled), and writes one
// small JSON per game. Only games the publication itself lists are written: the canonical mapping
// (publication event -> Kalshi event suffix) comes from the publication, never from guessing.
//
// GET only. No credential. No order, account or portfolio endpoint is ever called.
import { HORIZON_DAYS, LOOKBACK_HOURS, isEligibleEvent, publicationStatus, publishVerdict } from './slate.mjs';

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
        ...(sport ? { sport } : {}),
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

/** Publication states whose games the feed never writes: that sport fails closed for itself. */
export const UNUSABLE = ['STALE_PUBLICATION', 'UNREADABLE_PUBLICATION'];

/** A publication that could not be read at all (network error, 404, not JSON): unusable, like a stale one. */
export function unreadablePublication(sport, source, error, { horizonDays = HORIZON_DAYS, lookbackHours = LOOKBACK_HOURS } = {}) {
  return {
    sport, status: 'UNREADABLE_PUBLICATION', source, generated_at: null, age_seconds: null, eligible_games: 0, eligible_event_ids: [],
    latest_event: null, stale_events: [], reasons: [`the publication could not be read (${String(error?.message ?? error)})`],
    horizon_days: horizonDays, lookback_hours: lookbackHours,
  };
}

/**
 * The per-sport publish plan for one cycle. Each sport is judged on its own (publishVerdict): a stale or unreadable
 * publication, or current games that yielded no Kalshi market, EXCLUDES THAT SPORT (none of its games is written;
 * the index records its status and why) while the other sports publish. The whole cycle is refused (nothing is
 * written, the last-known-good feed stays) only when nothing trustworthy would replace it:
 *   - no sport passes its verdict, or
 *   - a sport was excluded and no remaining sport carries a current game with markets (a feed that would only
 *     drop the excluded sport's files is not published).
 * A cycle where every sport is healthy and quiet still publishes a healthy empty feed (NO_CURRENT_GAMES).
 * `byKey` null = before the Kalshi sweep (markets unknown): the same rule, assuming a usable sport's games will
 * price, so a cycle that cannot publish is refused before any Kalshi request is spent on it.
 */
export function planFeed(publications, games, byKey = null) {
  const sports = publications.map((p) => {
    const keys = [...new Set(games.filter((g) => g.sport === p.sport).map((g) => g.key))];
    const markets = byKey ? keys.reduce((a, k) => a + (byKey.get(k)?.size ?? 0), 0) : null;
    const v = UNUSABLE.includes(p.status) ? publishVerdict({ ...p, status: 'STALE_PUBLICATION' }, keys.length, 0) : byKey ? publishVerdict(p, keys.length, markets) : { publish: true, reason: 'not swept yet' };
    const reason = p.status === 'UNREADABLE_PUBLICATION' ? `the sport publication is unreadable (${p.reasons.join('; ')}); its games are not published` : UNUSABLE.includes(p.status) ? `the sport publication is stale (${p.reasons.join('; ')}); its games are not published` : v.reason;
    return { sport: p.sport, status: p.status, published: v.publish, reason, games: keys.length, markets };
  });
  const ok = sports.filter((s) => s.published);
  const excluded = sports.filter((s) => !s.published);
  const carries = ok.some((s) => s.games > 0 && (s.markets == null || s.markets > 0));
  const named = (xs) => xs.map((s) => `${s.sport}: ${s.reason}`).join(' | ');
  if (!ok.length) return { publish: false, reason: `no sport can be published (${named(excluded)}); not replacing the last-known-good feed`, sports };
  if (excluded.length && !carries) return { publish: false, reason: `excluded ${named(excluded)}; no other sport carries a current game with markets, so the last-known-good feed is not replaced`, sports };
  const published = new Set(ok.map((s) => s.sport));
  return {
    publish: true,
    reason: excluded.length ? `published ${[...published].join(', ')}; excluded ${named(excluded)}` : ok.some((s) => s.games > 0) ? sports.map((s) => `${s.sport} ${s.games} game key(s), ${s.markets ?? '?'} market(s)`).join('; ') : 'no current games: a healthy empty feed',
    sports,
    games: games.filter((g) => published.has(g.sport)),
  };
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

export function buildFiles(games, byKey, { generatedAt, source = 'kalshi-public via github-actions (sift live-quotes feed)', sports = ['NFL'], errors = [], requests = 0, publications = null, sportStatus = null }) {
  const files = new Map();
  const index = { schema: INDEX_SCHEMA, generated_at: generatedAt, sports, requests, errors, games: [] };
  // Source health (optional, additive): which publication was read, how old it was, how many current games it
  // listed, and its status. A reader can tell a healthy empty feed (NO_CURRENT_GAMES) from a broken source.
  if (publications) Object.assign(index, { status: feedStatus(publications), publications });
  // Per-sport status (optional, additive; planFeed): every configured sport, whether its games are in this feed and
  // why not. `status` then describes the PUBLISHED sports only; `excluded_sports` names the ones left out (fail closed:
  // a stale sport's games are absent, never shown as current).
  if (sportStatus) {
    const published = new Set(sportStatus.filter((s) => s.published).map((s) => s.sport));
    Object.assign(index, {
      status: feedStatus((publications ?? []).filter((p) => published.has(p.sport))),
      sport_status: sportStatus,
      excluded_sports: sportStatus.filter((s) => !s.published).map((s) => s.sport),
    });
  }
  const grouped = new Map();
  for (const g of games) {
    const cur = grouped.get(g.key) ?? { key: g.key, sport: g.sport ?? null, event_ids: [], tickers: new Set() };
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
    index.games.push({ key: g.key, ...(g.sport ? { sport: g.sport } : {}), file: `games/${g.key}.json`, event_ids: [...new Set(g.event_ids)].sort(), markets: markets.length, published: g.tickers.size, newly_listed: markets.filter((m) => !g.tickers.has(m.ticker)).length, observed_from: obs[0] ?? null, observed_to: obs[obs.length - 1] ?? null });
  }
  index.games.sort((a, b) => a.key.localeCompare(b.key));
  files.set('index.json', index);
  return files;
}
