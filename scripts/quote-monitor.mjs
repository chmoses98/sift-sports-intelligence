#!/usr/bin/env node
// Independent quote monitor (.github/workflows/quote-monitor.yml, every 15 minutes). READ-ONLY: public GETs only,
// no secret, nothing is written anywhere (the only file touched is the runner's own step summary).
//
//   node scripts/quote-monitor.mjs
//
// It reads what a reader of the feed and relay would read and FAILS THE RUN (so GitHub emails the owner) when:
//   1. the newest feed `generated_at` (index.json, health.json, the game file) is more than 10 minutes old, or the
//      feed cannot be read at all;
//   2. the heartbeat sequence (health.json) has not advanced: it is read, then re-read until it changes or the
//      window closes (default 9 minutes: the feed publishes every ~3.5 min and raw.githubusercontent.com caches
//      for up to 5, so a healthy loop shows a new sequence within ~8.5 minutes);
//   3. the relay returns anything but HTTP 200 for one quote batch, or only observations older than 60 s
//      (X-Sift-Observed-At, the time Kalshi's data was observed, not the time of the request), or answers 200 without
//      one of the open contracts it was asked about, for every game tried.
//
// The exact rules (docs/quote-track/CI_DRILL.md repeats them, tests/live/quote-monitor.test.ts pins each):
//   * The monitor keeps NO state between runs. A run judges only what it sees now, so a system that has recovered
//     passes on its very next run: there is nothing to "clear".
//   * One transient failure inside a run is retried ONCE before it counts. Transient = no answer (network error or
//     timeout), HTTP 429, HTTP 5xx, or an HTTP 200 that is unusable (not JSON, no markets[], no observation time,
//     observation over 60 s old or in the future, none of the requested contracts returned). The retry waits 5 s
//     (SIFT_MONITOR_RETRY_DELAY_S), or the relay's Retry-After on a 429, never more than 30 s. A pass on the retry is a
//     PASS that says so (a ::notice, never an error). A failure on the retry is the failure, reported with both
//     attempts. Other 4xx (403, 404, ...) are configuration errors and fail at once. Feed files get the same single
//     retry (2 s) on a network error or 5xx.
//   * Only contracts the feed itself lists as open (status active/open) are asked of the relay: a closed or settled
//     market is never asserted. Up to 3 games are tried (SIFT_MONITOR_RELAY_GAMES): a game whose contracts the relay
//     returns none of (HTTP 200, no requested ticker) is treated as delisted/closed while another game answers, and
//     the check PASSes with that noted; it FAILs only when EVERY game tried comes back empty (after the one retry).
//     If the feed lists no open contract at all the relay part is skipped, not passed.
//   * A game that is OVER is not an outage. Between a game ending and the feed (published every ~3.5 min, cached up to 5)
//     catching up, the feed still lists contracts as open that Kalshi already reports closed/settled/finalised. The relay
//     then answers HTTP 200, with a fresh X-Sift-Observed-At, and those markets carry a closed status (or a settlement
//     `result`). That is a healthy relay talking about a market that stopped trading: the game is NOT asserted, the next
//     game is tried for a tradable market, and when every game tried is closed the check PASSes saying so (an
//     `::notice`, never an error, never a retry). A closed answer still has to be fresh: an old observation fails as ever.
//     The status words are the ones src/live/tradable.ts reads (a test keeps the two lists equal).
//
// Degrading honestly. Until the heartbeat is deployed there is no health.json. That is reported as the distinct state
// HEARTBEAT_NOT_PUBLISHED: NOT a failure by default (the feed freshness check still runs from index.json, which has
// always carried generated_at), and clearly labelled in the output. Set SIFT_MONITOR_REQUIRE_HEARTBEAT=1 (the workflow
// reads the repository variable of the same name) once the heartbeat is live, and a missing health.json then fails.
// Likewise an unset SIFT_QUOTE_RELAY_URL skips the relay part cleanly (reported as skipped, not as a pass).
//
// Environment (all optional):
//   SIFT_FEED_URL                    default https://raw.githubusercontent.com/<GITHUB_REPOSITORY>/live-quotes
//   SIFT_QUOTE_RELAY_URL             relay base URL; unset/empty = skip the relay part
//   SIFT_ORIGIN                      Origin header sent to the relay (default https://chmoses98.github.io)
//   SIFT_MONITOR_REQUIRE_HEARTBEAT   1/true = a missing health.json is a failure
//   SIFT_MONITOR_SEQUENCE_WINDOW_S   how long to wait for the sequence to advance (default 540; 0 = do not wait)
//   SIFT_MONITOR_FEED_MAX_AGE_S      default 600
//   SIFT_MONITOR_RELAY_MAX_AGE_S     default 60
//   SIFT_MONITOR_RETRY_DELAY_S       wait before the single retry of a transient failure (default 5)
//   SIFT_MONITOR_FETCH_TIMEOUT_S     per-request timeout (default 20; the CI drill shortens it for its unroutable-host stage)
//   SIFT_MONITOR_RELAY_GAMES         how many games to try before an empty relay answer is a failure (default 3)
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FEED_SCHEMA = 'sift.live_quotes.v1';
export const INDEX_SCHEMA = 'sift.live_quotes.index.v1';
export const HEALTH_SCHEMA = 'sift.live_quotes.health.v1';
export const DEFAULT_REPO = 'chmoses98/sift-sports-intelligence';
export const DEFAULT_ORIGIN = 'https://chmoses98.github.io';

export const LIMITS = {
  feedMaxAgeMs: 10 * 60_000,
  relayMaxAgeMs: 60_000,
  sequenceWindowMs: 9 * 60_000,
  pollMs: 30_000,
  fetchTimeoutMs: 20_000,
  relayBatch: 25,
  /** Wait before the one retry of a transient failure (a 429's Retry-After replaces it, capped below). */
  retryDelayMs: 5_000,
  retryAfterCapMs: 30_000,
  /** Games tried before "the relay returned none of the open contracts" is a failure. */
  relayGames: 3,
  /** An observation stamped further ahead than this is not believable (runner clock is NTP-synced). */
  futureToleranceMs: 5_000,
};

/**
 * What a relay market object positively reports about trading (mirror of src/live/tradable.ts, which the quote store
 * uses; tests/live/quote-monitor.test.ts keeps them equal). 'tradable' = an open status or no status at all; a status
 * word nobody knows is reported as 'unrecognised' and counts as an answer (the monitor judges the relay, not the market).
 */
const SETTLED_WORDS = new Set(['settled', 'finalized', 'finalised', 'resolved', 'voided', 'void', 'cancelled', 'canceled']);
const CLOSED_WORDS = new Set(['closed', 'determined', 'disputed', 'amended']);
const SUSPENDED_WORDS = new Set(['inactive', 'paused', 'suspended', 'halted', 'frozen']);
const UNOPENED_WORDS = new Set(['initialized', 'initialised', 'unopened']);
export function marketState(m) {
  if (typeof m?.result === 'string' && m.result.trim() !== '') return 'settled';
  const w = String(m?.status ?? '').trim().toLowerCase();
  if (w === '' || w === 'active' || w === 'open') return 'tradable';
  if (SETTLED_WORDS.has(w)) return 'settled';
  if (CLOSED_WORDS.has(w)) return 'closed';
  if (w === 'expired') return 'expired';
  if (SUSPENDED_WORDS.has(w)) return 'suspended';
  if (UNOPENED_WORDS.has(w)) return 'unopened';
  return 'unrecognised';
}
const NOT_TRADING = new Set(['settled', 'closed', 'expired', 'suspended', 'unopened']);

/** The one non-https relay URL accepted: this machine, for the local failure-injection drill (scripts/quote-monitor-drill.mjs). */
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const secs = (ms) => `${Math.round(ms / 1000)}s`;
const flag = (v) => ['1', 'true', 'yes'].includes(String(v ?? '').trim().toLowerCase());
const num = (v, d) => (v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

/** One GET. Never throws: a network error or timeout is reported as { error }. */
async function get(url, { fetchImpl, timeoutMs, headers = {} }) {
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  } catch (e) {
    return { status: 0, error: String(e?.cause?.message ?? e?.message ?? e) };
  }
}

/** The feed lives on raw.githubusercontent.com, which flakes now and then: one retry on a network error or 5xx. */
async function getFeed(url, ctx) {
  let r = await get(url, ctx);
  if (r.status === 0 || r.status >= 500) {
    await ctx.sleep(2_000);
    r = await get(url, ctx);
  }
  return r;
}

const describeHttp = (r) => (r.error ? `network error: ${r.error}` : `HTTP ${r.status}`);

/** True when `b` is a later heartbeat than `a`: a new loop (run id changed) or a higher sequence. */
export function advanced(a, b) {
  return b.run_id !== a.run_id || b.sequence > a.sequence;
}

/**
 * Run every check. Pure with respect to its inputs: all I/O goes through `fetchImpl`, time through `now` and `sleep`,
 * so every failure row can be unit-tested. Returns { ok, status, checks }, where each check is
 * { id, status: 'pass' | 'fail' | 'skip' | 'note', title, detail }.
 *   status: 'PASS' | 'FAIL' | 'PASS_HEARTBEAT_NOT_PUBLISHED'
 */
export async function runMonitor({ env = {}, fetchImpl = fetch, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const limits = {
    ...LIMITS,
    feedMaxAgeMs: num(env.SIFT_MONITOR_FEED_MAX_AGE_S, LIMITS.feedMaxAgeMs / 1000) * 1000,
    relayMaxAgeMs: num(env.SIFT_MONITOR_RELAY_MAX_AGE_S, LIMITS.relayMaxAgeMs / 1000) * 1000,
    sequenceWindowMs: num(env.SIFT_MONITOR_SEQUENCE_WINDOW_S, LIMITS.sequenceWindowMs / 1000) * 1000,
    pollMs: num(env.SIFT_MONITOR_POLL_S, LIMITS.pollMs / 1000) * 1000,
    retryDelayMs: num(env.SIFT_MONITOR_RETRY_DELAY_S, LIMITS.retryDelayMs / 1000) * 1000,
    fetchTimeoutMs: Math.max(100, num(env.SIFT_MONITOR_FETCH_TIMEOUT_S, LIMITS.fetchTimeoutMs / 1000) * 1000),
    relayGames: Math.max(1, Math.floor(num(env.SIFT_MONITOR_RELAY_GAMES, LIMITS.relayGames))),
  };
  const requireHeartbeat = flag(env.SIFT_MONITOR_REQUIRE_HEARTBEAT);
  const feedBase = (env.SIFT_FEED_URL ?? '').trim().replace(/\/+$/, '') || `https://raw.githubusercontent.com/${env.GITHUB_REPOSITORY || DEFAULT_REPO}/live-quotes`;
  const relayBase = (env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
  const origin = (env.SIFT_ORIGIN ?? '').trim() || DEFAULT_ORIGIN;
  const ctx = { fetchImpl, timeoutMs: limits.fetchTimeoutMs, sleep };

  const checks = [];
  const add = (id, status, title, detail, extra = {}) => checks.push({ id, status, title, detail, ...extra });
  const stamps = []; // every feed generated_at we saw, with where

  // ---- 1. the feed index (always present on a live feed)
  const index = await getFeed(`${feedBase}/index.json`, ctx);
  let indexDoc = null;
  if (index.status !== 200) add('feed_index', 'fail', 'Feed index readable', `${feedBase}/index.json: ${describeHttp(index)}`);
  else if (!index.json || typeof index.json !== 'object') add('feed_index', 'fail', 'Feed index readable', `${feedBase}/index.json is not JSON`);
  else if (index.json.schema !== INDEX_SCHEMA) add('feed_index', 'fail', 'Feed index readable', `unexpected index schema ${JSON.stringify(index.json.schema)} (expected ${INDEX_SCHEMA})`);
  else {
    indexDoc = index.json;
    add('feed_index', 'pass', 'Feed index readable', `status ${indexDoc.status ?? 'n/a'}, ${indexDoc.games?.length ?? 0} game file(s), generated_at ${indexDoc.generated_at}`);
    stamps.push({ from: 'index.json', at: indexDoc.generated_at });
  }

  // ---- 2. the heartbeat (health.json) and one game file
  const health = await readHeartbeat(feedBase, ctx);
  let hb0 = null;
  if (health.kind === 'not_published') {
    if (requireHeartbeat) add('heartbeat', 'fail', 'Heartbeat published', 'health.json does not exist on the live-quotes branch (HTTP 404) and SIFT_MONITOR_REQUIRE_HEARTBEAT is set');
    else add('heartbeat', 'note', 'Heartbeat published', 'HEARTBEAT_NOT_PUBLISHED: health.json is not on the live-quotes branch yet (HTTP 404). Not a failure: the feed publisher has not been deployed with the heartbeat. Feed freshness is checked from index.json; the sequence check is skipped. Set the SIFT_MONITOR_REQUIRE_HEARTBEAT repository variable to 1 once the heartbeat is live.');
  } else if (health.kind === 'error') {
    add('heartbeat', 'fail', 'Heartbeat readable', health.detail);
  } else {
    hb0 = health.doc;
    add('heartbeat', 'pass', 'Heartbeat readable', `run ${hb0.run_id}, sequence ${hb0.sequence}, cycle finished ${hb0.cycle_finished_at}, sweep ${hb0.sweep_duration_ms} ms, ${hb0.requests} requests`);
    stamps.push({ from: 'health.json', at: hb0.generated_at });
  }

  let game = null; // { doc, file }
  if (indexDoc) {
    const games = Array.isArray(indexDoc.games) ? indexDoc.games : [];
    const pick = games.find((g) => g?.markets > 0 && /^games\/[A-Za-z0-9._-]+\.json$/.test(g.file ?? '')) ?? games.find((g) => /^games\/[A-Za-z0-9._-]+\.json$/.test(g?.file ?? ''));
    if (!pick) add('game_file', 'skip', 'Game file readable', `the feed lists no current game (status ${indexDoc.status ?? 'n/a'}); nothing to read`);
    else {
      const r = await getFeed(`${feedBase}/${pick.file}`, ctx);
      if (r.status !== 200) add('game_file', 'fail', 'Game file readable', `${pick.file}: ${describeHttp(r)}`);
      else if (!r.json || r.json.schema !== FEED_SCHEMA || !Array.isArray(r.json.markets)) add('game_file', 'fail', 'Game file readable', `${pick.file}: not a ${FEED_SCHEMA} document`);
      else {
        game = { doc: r.json, file: pick.file };
        stamps.push({ from: pick.file, at: r.json.generated_at });
        const obs = r.json.markets.map((m) => Date.parse(m?.observed_at)).filter((t) => !Number.isNaN(t));
        const detail = r.json.markets.length === 0 ? 'no markets' : obs.length ? `${r.json.markets.length} markets, newest observation ${secs(now() - Math.max(...obs))} old` : `${r.json.markets.length} markets, none with a parseable observed_at`;
        if (r.json.markets.length > 0 && !obs.length) add('game_file', 'fail', 'Game file readable', `${pick.file}: ${detail}`);
        else add('game_file', 'pass', 'Game file readable', `${pick.file}: ${detail}`);
      }
    }
  }

  // ---- 3. newest feed generated_at
  const parsed = stamps.map((s) => ({ ...s, ms: Date.parse(s.at) })).filter((s) => !Number.isNaN(s.ms));
  if (!stamps.length) add('feed_fresh', 'fail', 'Feed generated_at is recent', 'no feed file could be read, so there is no generated_at to judge');
  else if (!parsed.length) add('feed_fresh', 'fail', 'Feed generated_at is recent', `generated_at missing or unparseable in ${stamps.map((s) => s.from).join(', ')}`);
  else {
    const newest = parsed.reduce((a, b) => (b.ms > a.ms ? b : a));
    const age = now() - newest.ms;
    if (age > limits.feedMaxAgeMs) add('feed_fresh', 'fail', 'Feed generated_at is recent', `newest generated_at is ${newest.at} (${newest.from}), ${secs(age)} old; limit ${secs(limits.feedMaxAgeMs)}. The live-quotes loop has stalled or its pushes are failing.`);
    else if (age < -limits.futureToleranceMs) add('feed_fresh', 'fail', 'Feed generated_at is recent', `newest generated_at ${newest.at} (${newest.from}) is ${secs(-age)} in the future of this runner's clock`);
    else add('feed_fresh', 'pass', 'Feed generated_at is recent', `newest generated_at ${newest.at} (${newest.from}), ${secs(Math.max(0, age))} old; limit ${secs(limits.feedMaxAgeMs)}`);
  }
  const feedFresh = checks.find((c) => c.id === 'feed_fresh').status === 'pass';

  // ---- 4. the heartbeat sequence advances
  if (hb0) {
    // No point waiting for a loop that the freshness check already shows as stalled.
    const window = feedFresh ? limits.sequenceWindowMs : 0;
    const start = now();
    let latest = hb0;
    let moved = false;
    let lastError = null;
    while (!moved && now() - start < window) {
      await sleep(Math.min(limits.pollMs, Math.max(0, window - (now() - start))));
      const again = await readHeartbeat(feedBase, ctx);
      if (again.kind === 'ok') {
        latest = again.doc;
        lastError = null;
        moved = advanced(hb0, latest);
      } else lastError = again.kind === 'error' ? again.detail : 'health.json disappeared (HTTP 404)';
    }
    const waited = now() - start;
    if (moved) {
      add('heartbeat_advance', 'pass', 'Heartbeat sequence advances', `run ${hb0.run_id} sequence ${hb0.sequence} -> run ${latest.run_id} sequence ${latest.sequence} after ${secs(waited)}`);
    } else if (latest.run_id === hb0.run_id && latest.sequence < hb0.sequence) {
      add('heartbeat_advance', 'fail', 'Heartbeat sequence advances', `sequence went BACKWARDS within run ${hb0.run_id}: ${hb0.sequence} -> ${latest.sequence}`);
    } else {
      add('heartbeat_advance', 'fail', 'Heartbeat sequence advances', `run ${hb0.run_id} is still at sequence ${hb0.sequence} (cycle finished ${hb0.cycle_finished_at})${window ? ` after waiting ${secs(waited)} (the feed publishes every ~3.5 min; the CDN caches up to 5)` : ' (not waited: the feed is already stale)'}${lastError ? `; last re-read: ${lastError}` : ''}`);
    }
  } else {
    add('heartbeat_advance', 'skip', 'Heartbeat sequence advances', health.kind === 'not_published' ? 'skipped: no heartbeat published yet' : 'skipped: heartbeat unreadable (see above)');
  }

  // ---- 5. one relay quote batch (one retry of a transient failure; several games before "empty" is a failure)
  if (!relayBase) {
    add('relay', 'skip', 'Relay quote batch', 'skipped: SIFT_QUOTE_RELAY_URL is not set');
  } else if (!/^https:\/\//.test(relayBase) && !LOOPBACK.test(relayBase)) {
    add('relay', 'fail', 'Relay quote batch', 'SIFT_QUOTE_RELAY_URL is set but is not an https URL (plain http is accepted only for a loopback address, used by the local drill)');
  } else if (!game) {
    add('relay', 'skip', 'Relay quote batch', 'skipped: no game file to take tickers from');
  } else {
    const games = [{ file: game.file, doc: game.doc }];
    const more = (Array.isArray(indexDoc?.games) ? indexDoc.games : []).filter((g) => g?.file !== game.file && /^games\/[A-Za-z0-9._-]+\.json$/.test(g?.file ?? ''));
    const loadMore = async () => {
      // Lazily: extra game files are only read when the first game's contracts came back empty.
      while (more.length && games.length < limits.relayGames) {
        const g = more.shift();
        const r = await getFeed(`${feedBase}/${g.file}`, ctx);
        if (r.status === 200 && r.json?.schema === FEED_SCHEMA && Array.isArray(r.json.markets)) {
          games.push({ file: g.file, doc: r.json });
          return true;
        }
      }
      return false;
    };
    const rc = { ...ctx, relayBase, origin, limits, now, loadMore, games };
    let first = await relayRound(rc);
    if (first.verdict === 'skip') add('relay', 'skip', 'Relay quote batch', first.detail);
    else if (first.verdict === 'pass') add('relay', 'pass', 'Relay quote batch', first.detail, first.closed ? { closed: true } : {});
    else if (!first.transient) add('relay', 'fail', 'Relay quote batch', first.detail);
    else {
      const wait = first.retryAfterMs != null ? Math.min(limits.retryAfterCapMs, Math.max(limits.retryDelayMs, first.retryAfterMs)) : limits.retryDelayMs;
      await sleep(wait);
      const second = await relayRound(rc);
      if (second.verdict === 'pass') add('relay', 'pass', 'Relay quote batch', `${second.detail}; recovered on the single retry after ${secs(wait)} (first attempt: ${first.detail})`, { recovered: true, ...(second.closed ? { closed: true } : {}) });
      else if (second.verdict === 'skip') add('relay', 'skip', 'Relay quote batch', second.detail);
      else add('relay', 'fail', 'Relay quote batch', second.detail === first.detail ? `${second.detail}; the same on the single retry after ${secs(wait)}` : `${second.detail}; the single retry after ${secs(wait)} failed too (first attempt: ${first.detail})`);
    }
  }

  const failed = checks.filter((c) => c.status === 'fail');
  const status = failed.length ? 'FAIL' : checks.some((c) => c.id === 'heartbeat' && c.status === 'note') ? 'PASS_HEARTBEAT_NOT_PUBLISHED' : 'PASS';
  return { ok: !failed.length, status, checks };
}

/**
 * One pass over the games: ask the relay for the feed's open contracts, game by game. A pass as soon as one game's
 * batch is answered usably; "empty" (HTTP 200, none of the requested contracts) moves on to the next game; every
 * other problem ends the round at once. verdict: 'pass' | 'fail' | 'skip'. `transient` tells the caller whether one
 * retry makes sense.
 */
async function relayRound(rc) {
  const { relayBase, origin, limits, now } = rc;
  const empties = [];
  const closedGames = [];
  let asked = 0;
  for (let i = 0; i < rc.games.length || (await rc.loadMore() && i < rc.games.length); i++) {
    const g = rc.games[i];
    const tickers = openTickers(g.doc, limits.relayBatch);
    if (!tickers.length) {
      empties.push(`${g.file}: the feed lists no open contract`);
      continue;
    }
    asked++;
    const url = `${relayBase}/markets?tickers=${tickers.map(encodeURIComponent).join(',')}&limit=1000`;
    const r = await get(url, { ...rc, headers: { Origin: origin } });
    const at = now();
    const fail = (detail, transient, retryAfterMs = null) => ({ verdict: 'fail', detail, transient, retryAfterMs });
    if (r.error) return fail(`relay unreachable: ${r.error}`, true);
    if (r.status === 429) {
      const ra = Number(r.headers?.get('retry-after'));
      return fail(`relay answered HTTP 429${r.headers?.get('retry-after') ? ` (Retry-After ${r.headers.get('retry-after')})` : ''} for ${tickers.length} tickers: ${(r.text ?? '').slice(0, 160).replace(/\s+/g, ' ')}`, true, Number.isFinite(ra) && ra > 0 ? ra * 1000 : null);
    }
    if (r.status !== 200) return fail(`relay answered HTTP ${r.status} for ${tickers.length} tickers: ${(r.text ?? '').slice(0, 160).replace(/\s+/g, ' ')}`, r.status >= 500);
    if (!r.json || !Array.isArray(r.json.markets)) return fail('relay answered HTTP 200 but the body has no markets[]', true);
    const stamp = r.headers.get('x-sift-observed-at');
    const observed = stamp ? Date.parse(stamp) : NaN;
    if (Number.isNaN(observed)) return fail(`relay answered HTTP 200 without a usable X-Sift-Observed-At (${JSON.stringify(stamp)}): there is no observation time to judge`, true);
    const wanted = new Set(tickers);
    const got = r.json.markets.filter((m) => wanted.has(m?.ticker));
    if (got.length === 0) {
      empties.push(`${g.file}: HTTP 200 with no market for any of the ${tickers.length} requested open contracts${r.json.markets.length ? ` (${r.json.markets.length} unrelated)` : ''}`);
      continue;
    }
    if (at - observed > limits.relayMaxAgeMs) return fail(`relay answered HTTP 200 but its newest observation (${iso(observed)}) is ${secs(at - observed)} old; limit ${secs(limits.relayMaxAgeMs)} (${got.length} markets)`, true);
    if (observed - at > limits.futureToleranceMs) return fail(`relay observation ${iso(observed)} is ${secs(observed - at)} in the future of this runner's clock`, true);
    // The relay answered, fresh. Does it report the markets as trading? A game that is over is not an outage.
    const states = got.map((m) => marketState(m));
    const notTrading = states.filter((x) => NOT_TRADING.has(x));
    if (notTrading.length === got.length) {
      const words = [...new Set(notTrading)].join('/');
      closedGames.push(`${g.file}: all ${got.length} of ${tickers.length} requested markets report ${words} (observation ${secs(Math.max(0, at - observed))} old)`);
      continue;
    }
    const oddWords = [...new Set(got.filter((m, i) => states[i] === 'unrecognised').map((m) => JSON.stringify(m.status)))];
    const closedNote = notTrading.length ? `; ${notTrading.length} of the ${got.length} returned market(s) report ${[...new Set(notTrading)].join('/')} and are not asserted` : '';
    const oddNote = oddWords.length ? `; unrecognised market status ${oddWords.join(', ')} (not a relay fault)` : '';
    const note = empties.length ? `; ${empties.length} other game(s) came back empty and are treated as delisted or closed (${empties.join('; ')})` : '';
    const over = closedGames.length ? `; ${closedGames.length} game(s) tried first are over (${closedGames.join('; ')})` : '';
    return { verdict: 'pass', detail: `HTTP 200, ${got.length} of ${tickers.length} requested markets from ${g.file}, newest observation ${secs(Math.max(0, at - observed))} old; limit ${secs(limits.relayMaxAgeMs)}${closedNote}${oddNote}${note}${over}` };
  }
  if (closedGames.length) {
    // Every game that answered is over (closed / settled / finalised ...): a healthy relay reporting finished games.
    const empt = empties.length ? `; ${empties.length} game(s) came back empty (${empties.join('; ')})` : '';
    return { verdict: 'pass', closed: true, detail: `GAME_OVER: HTTP 200 with a current observation, and every market the relay returned is closed or settled, so there is no tradable price to assert (${closedGames.join('; ')})${empt}. Not a failure: the relay is answering, the games are finished.` };
  }
  if (!asked) return { verdict: 'skip', detail: `skipped: the feed lists no open contract to ask the relay about (${empties.join('; ') || 'no game'})` };
  return { verdict: 'fail', transient: true, retryAfterMs: null, detail: `relay answered HTTP 200 with no markets for the ${asked} game(s) tried, though the feed lists their contracts as open (${empties.join('; ')})` };
}

async function readHeartbeat(feedBase, ctx) {
  const r = await getFeed(`${feedBase}/health.json`, ctx);
  if (r.status === 404) return { kind: 'not_published' };
  if (r.status !== 200) return { kind: 'error', detail: `health.json: ${describeHttp(r)}` };
  const d = r.json;
  if (!d || typeof d !== 'object') return { kind: 'error', detail: 'health.json is not JSON' };
  if (d.schema !== HEALTH_SCHEMA) return { kind: 'error', detail: `health.json has schema ${JSON.stringify(d.schema)} (expected ${HEALTH_SCHEMA})` };
  if (typeof d.run_id !== 'string' || !Number.isInteger(d.sequence) || typeof d.generated_at !== 'string') return { kind: 'error', detail: 'health.json lacks run_id / sequence / generated_at' };
  return { kind: 'ok', doc: d };
}

/** Up to `max` tickers from the game file, open ones first (a closed contract is still answered, but an open one is the real test). */
export function relayTickers(doc, max = LIMITS.relayBatch) {
  const ms = Array.isArray(doc?.markets) ? doc.markets.filter((m) => typeof m?.ticker === 'string') : [];
  const open = ms.filter((m) => ['active', 'open'].includes(String(m.status ?? '').toLowerCase()));
  return [...new Set([...open, ...ms].map((m) => m.ticker))].slice(0, max);
}

/** Up to `max` tickers the feed itself lists as open (status active/open). A closed or settled contract is never asserted against the relay. */
export function openTickers(doc, max = LIMITS.relayBatch) {
  const ms = Array.isArray(doc?.markets) ? doc.markets : [];
  return [...new Set(ms.filter((m) => typeof m?.ticker === 'string' && ['active', 'open'].includes(String(m.status ?? '').toLowerCase())).map((m) => m.ticker))].slice(0, max);
}

/** Human-readable report; failures also become GitHub annotations so they show on the run and in the email. */
export function report(result) {
  const lines = [];
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', note: 'NOTE' };
  for (const c of result.checks) lines.push(`[${mark[c.status]}] ${c.title}: ${c.detail}`);
  for (const c of result.checks) {
    if (c.status === 'fail') lines.push(`::error title=Quote monitor: ${c.title}::${c.detail}`);
    if (c.status === 'note') lines.push(`::notice title=Quote monitor: heartbeat not published yet::${c.detail}`);
    if (c.closed) lines.push(`::notice title=Quote monitor: games over::${c.title}: ${c.detail}`);
    if (c.recovered) lines.push(`::notice title=Quote monitor: transient failure recovered::${c.title}: ${c.detail}`);
  }
  lines.push(`RESULT: ${result.status === 'PASS_HEARTBEAT_NOT_PUBLISHED' ? 'PASS (heartbeat not published yet: not a failure)' : result.status}`);
  return lines.join('\n');
}

export function summaryMarkdown(result) {
  const icon = { pass: 'pass', fail: '**FAIL**', skip: 'skipped', note: 'note' };
  return [`### Quote monitor: ${result.status === 'PASS_HEARTBEAT_NOT_PUBLISHED' ? 'PASS (heartbeat not published yet)' : result.status}`, '', '| Check | Result | Detail |', '| --- | --- | --- |', ...result.checks.map((c) => `| ${c.title} | ${icon[c.status]} | ${String(c.detail).replace(/\|/g, '\\|')} |`), ''].join('\n');
}

async function main() {
  const result = await runMonitor({ env: process.env });
  console.log(report(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(result));
    } catch {
      /* the summary is a convenience */
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
