#!/usr/bin/env node
// Local failure-injection drill for the quote monitor. It starts a FAKE feed and a FAKE relay on 127.0.0.1 (nothing
// leaves this machine, nothing production is read or written), points scripts/quote-monitor.mjs at them with the
// monitor's own environment overrides, runs one scenario after another, and checks that the monitor reaches the
// verdict it is specified to reach.
//
//   node scripts/quote-monitor-drill.mjs                    every scenario, in order
//   node scripts/quote-monitor-drill.mjs outage healthy     just these, in this order (an outage followed by a recovery)
//   node scripts/quote-monitor-drill.mjs --list
//   node scripts/quote-monitor-drill.mjs --ci [--stages=2,3]   the staged CI drill (below)
//
// THE STAGED CI DRILL (--ci). Run by .github/workflows/quote-drill.yml on a throwaway branch, from a GitHub-hosted
// runner. READ-ONLY: only GET requests, to the public feed, to the deployed relay (the SIFT_QUOTE_RELAY_URL repository
// variable) and to a fake world on 127.0.0.1. No secret, no token, nothing is written anywhere except the runner's
// step summary. Five stages, each with an expectation the script itself asserts:
//   1. healthy      the real relay and the real feed: the monitor must PASS, with the relay actually exercised
//   2. outage       forced failures against the real relay URL (an unroutable host, a black-holed address, a wrong path,
//                   an impossible freshness limit, an impossible feed limit): the monitor must FAIL with the right diagnosis
//   3. fake relay   forced 429, empty, delisted, closed (game over), partial and mixed batches, inside the runner
//   4. recovery     the very next healthy run passes with no trace of the failures (loopback and real)
//   5. heartbeat    health.json on the real feed branch: HEARTBEAT_NOT_PUBLISHED is a distinct, non-failing state while
//                   it is not published, and the strict switch (SIFT_MONITOR_REQUIRE_HEARTBEAT) fails on it
// The process exits 0 only when EVERY stage matched; otherwise it exits 1 and names the stage(s).
//
// The drill passes (exit 0) when every scenario produced the expected verdict: a monitor that correctly FAILs an
// outage is a drill pass. Timings are shortened through the monitor's overrides (poll 0.2 s, sequence window 3 s,
// retry delay 0.3 s); the rules are the same ones the real run applies. docs/quote-track/CI_DRILL.md explains how to read
// the output and what this does and does not prove.
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { report, runMonitor } from './quote-monitor.mjs';

const GAME_A = { key: '26OCT26TORCGY', tickers: ['KXNHLGOAL-26OCT26TORCGY-TOR19', 'KXNHLGOAL-26OCT26TORCGY-CGY7', 'KXNHLPTS-26OCT26TORCGY-TOR19-2'] };
const GAME_B = { key: '26OCT26BOSNYR', tickers: ['KXNHLGOAL-26OCT26BOSNYR-BOS1', 'KXNHLGOAL-26OCT26BOSNYR-NYR2'] };

/**
 * Each scenario describes the fake world and what the monitor must conclude.
 *   feedAgeS      age of the feed's generated_at
 *   heartbeat     'advancing' (a new sequence every 2nd read) | 'stalled' | 'missing' (HTTP 404)
 *   relay         'ok' | 'flaky' (first request 503) | 'always503' | '429' (Retry-After 1, always) | '429once' | 'empty' | 'stale'
 *                 | 'unreachable' | 'delistedFirstGame' | 'partial' (last asked market missing) | 'gameOver' (every market
 *                 finalized) | 'closedAmongOpen' (one market finalized) | 'firstGameOver' (game A finalized, game B open)
 *   games         the games the feed lists (the first is read for freshness)
 *   env           extra monitor environment for this scenario
 *   expect        { ok, status?, checks?: [[checkId, regex], ...] }  (the regex must match that check's detail)
 */
export const SCENARIOS = {
  healthy: { feedAgeS: 30, heartbeat: 'advancing', relay: 'ok', games: [GAME_A], expect: { ok: true, status: 'PASS' } },
  'feed-stale': { feedAgeS: 30 * 60, heartbeat: 'advancing', relay: 'ok', games: [GAME_A], expect: { ok: false, checks: [['feed_fresh', /\d+s old; limit 600s/]] } },
  'heartbeat-stalled': { feedAgeS: 30, heartbeat: 'stalled', relay: 'ok', games: [GAME_A], expect: { ok: false, checks: [['heartbeat_advance', /still at sequence/]] } },
  'heartbeat-missing': { feedAgeS: 30, heartbeat: 'missing', relay: 'ok', games: [GAME_A], expect: { ok: true, status: 'PASS_HEARTBEAT_NOT_PUBLISHED' } },
  'heartbeat-missing-required': { feedAgeS: 30, heartbeat: 'missing', relay: 'ok', games: [GAME_A], env: { SIFT_MONITOR_REQUIRE_HEARTBEAT: '1' }, expect: { ok: false, checks: [['heartbeat', /does not exist/]] } },
  outage: { feedAgeS: 30, heartbeat: 'advancing', relay: 'always503', games: [GAME_A], expect: { ok: false, checks: [['relay', /HTTP 503.*the same on the single retry/]] } },
  unreachable: { feedAgeS: 30, heartbeat: 'advancing', relay: 'unreachable', games: [GAME_A], expect: { ok: false, checks: [['relay', /relay unreachable/]] } },
  'relay-429': { feedAgeS: 30, heartbeat: 'advancing', relay: '429', games: [GAME_A], expect: { ok: false, checks: [['relay', /HTTP 429 \(Retry-After 1\).*the same on the single retry/]] } },
  'relay-429-once': { feedAgeS: 30, heartbeat: 'advancing', relay: '429once', games: [GAME_A], expect: { ok: true, status: 'PASS', checks: [['relay', /recovered on the single retry.*HTTP 429/]] } },
  'relay-flaky': { feedAgeS: 30, heartbeat: 'advancing', relay: 'flaky', games: [GAME_A], expect: { ok: true, status: 'PASS', checks: [['relay', /recovered on the single retry.*HTTP 503/]] } },
  'relay-stale': { feedAgeS: 30, heartbeat: 'advancing', relay: 'stale', games: [GAME_A], expect: { ok: false, checks: [['relay', /newest observation .* is 30\ds old; limit 60s/]] } },
  'relay-empty': { feedAgeS: 30, heartbeat: 'advancing', relay: 'empty', games: [GAME_A], expect: { ok: false, checks: [['relay', /no markets for the 1 game\(s\) tried/]] } },
  'relay-delisted-game': { feedAgeS: 30, heartbeat: 'advancing', relay: 'delistedFirstGame', games: [GAME_A, GAME_B], expect: { ok: true, status: 'PASS', checks: [['relay', /1 other game\(s\) came back empty and are treated as delisted or closed/]] } },
  'all-games-delisted': { feedAgeS: 30, heartbeat: 'advancing', relay: 'empty', games: [GAME_A, GAME_B], expect: { ok: false, checks: [['relay', /no markets for the 2 game\(s\) tried/]] } },
  'no-open-contracts': { feedAgeS: 30, heartbeat: 'advancing', relay: 'ok', games: [GAME_A], gameStatus: 'closed', expect: { ok: true, status: 'PASS', checks: [['relay', /the feed lists no open contract/]] } },
  'relay-partial': { feedAgeS: 30, heartbeat: 'advancing', relay: 'partial', games: [GAME_A], expect: { ok: true, status: 'PASS', checks: [['relay', /HTTP 200, 2 of 3 requested markets/]] } },
  // The feed (cache up to 5 min) still lists the contracts as open while Kalshi already reports the game finished.
  'relay-game-over': { feedAgeS: 30, heartbeat: 'advancing', relay: 'gameOver', games: [GAME_A], expect: { ok: true, status: 'PASS', checks: [['relay', /^GAME_OVER: .*every market the relay returned is closed or settled/]] } },
  'relay-closed-among-open': { feedAgeS: 30, heartbeat: 'advancing', relay: 'closedAmongOpen', games: [GAME_A], expect: { ok: true, status: 'PASS', checks: [['relay', /HTTP 200, 3 of 3 requested markets.*1 of the 3 returned market\(s\) report settled and are not asserted/]] } },
  'relay-first-game-over': { feedAgeS: 30, heartbeat: 'advancing', relay: 'firstGameOver', games: [GAME_A, GAME_B], expect: { ok: true, status: 'PASS', checks: [['relay', /2 of 2 requested markets from games\/26OCT26BOSNYR\.json.*1 game\(s\) tried first are over/]] } },
};

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The fake feed and relay. `state.scenario` can be switched between runs; counters reset per scenario. */
export function startFakeWorld() {
  const state = { scenario: SCENARIOS.healthy, healthReads: 0, relayCalls: 0, relayRequests: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const sc = state.scenario;
    const json = (body, status = 200, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    const gen = iso(Date.now() - sc.feedAgeS * 1000);
    if (url.pathname === '/feed/index.json') return json({ schema: 'sift.live_quotes.index.v1', generated_at: gen, status: 'CURRENT_SLATE', games: sc.games.map((g) => ({ key: g.key, file: `games/${g.key}.json`, markets: g.tickers.length })) });
    if (url.pathname === '/feed/health.json') {
      if (sc.heartbeat === 'missing') return json({ error: 'not found' }, 404);
      state.healthReads++;
      const sequence = sc.heartbeat === 'advancing' ? 1 + Math.floor(state.healthReads / 2) : 1;
      return json({ schema: 'sift.live_quotes.health.v1', generated_at: gen, run_id: '9001', sequence, cycle_started_at: gen, cycle_finished_at: gen, sweep_duration_ms: 9000, requests: 70, errors: 0, last_success_at: gen });
    }
    const game = sc.games.find((g) => url.pathname === `/feed/games/${g.key}.json`);
    if (game) return json({ schema: 'sift.live_quotes.v1', game_key: game.key, generated_at: gen, tickers_checked: game.tickers, markets: game.tickers.map((ticker) => ({ ticker, status: sc.gameStatus ?? 'active', observed_at: iso(Date.now() - sc.feedAgeS * 1000 - 4000) })) });
    if (url.pathname === '/relay/markets') {
      state.relayCalls++;
      const asked = (url.searchParams.get('tickers') ?? '').split(',').filter(Boolean);
      state.relayRequests.push(asked);
      const n = state.relayCalls;
      const observed = (ageMs) => ({ 'x-sift-observed-at': iso(Date.now() - ageMs) });
      switch (sc.relay) {
        case 'always503': return json({ error: 'upstream' }, 503);
        case 'flaky': return n === 1 ? json({ error: 'upstream' }, 503) : json({ markets: asked.map((ticker) => ({ ticker })) }, 200, observed(2000));
        case '429': return json({ error: 'rate limited' }, 429, { 'retry-after': '1' });
        case '429once': return n === 1 ? json({ error: 'rate limited' }, 429, { 'retry-after': '1' }) : json({ markets: asked.map((ticker) => ({ ticker })) }, 200, observed(2000));
        case 'unreachable': req.socket.destroy(); return undefined;
        case 'empty': return json({ markets: [] }, 200, observed(1000));
        case 'stale': return json({ markets: asked.map((ticker) => ({ ticker })) }, 200, observed(300_000));
        case 'delistedFirstGame': return json({ markets: asked.filter((t) => !GAME_A.tickers.includes(t)).map((ticker) => ({ ticker })) }, 200, observed(2000));
        case 'partial': return json({ markets: asked.slice(0, -1).map((ticker) => ({ ticker })) }, 200, observed(2000));
        case 'gameOver': return json({ markets: asked.map((ticker) => ({ ticker, status: 'finalized', result: 'yes' })) }, 200, observed(2000));
        case 'closedAmongOpen': return json({ markets: asked.map((ticker, i) => (i === 1 ? { ticker, status: 'finalized', result: 'no' } : { ticker, status: 'active' })) }, 200, observed(2000));
        case 'firstGameOver': return json({ markets: asked.map((ticker) => (GAME_A.tickers.includes(ticker) ? { ticker, status: 'closed' } : { ticker, status: 'active' })) }, 200, observed(2000));
        default: return json({ markets: asked.map((ticker) => ({ ticker })) }, 200, observed(2000));
      }
    }
    res.writeHead(404);
    res.end('not found');
    return undefined;
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ state, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const check = (result, id) => result.checks.find((c) => c.id === id);

/** Does the monitor's result match what the scenario says it must be? Returns the list of mismatches. */
export function mismatches(result, ex) {
  const bad = [];
  if (result.ok !== ex.ok) bad.push(`expected ok=${ex.ok}, got ok=${result.ok}`);
  if (ex.status && result.status !== ex.status) bad.push(`expected status ${ex.status}, got ${result.status}`);
  if (ex.statusIn && !ex.statusIn.includes(result.status)) bad.push(`expected status ${ex.statusIn.join(' or ')}, got ${result.status}`);
  for (const [id, st] of ex.checkStatus ?? []) {
    const got = check(result, id)?.status ?? 'absent';
    if (got !== st) bad.push(`expected the ${id} check to be ${st}, got ${got}`);
  }
  for (const [id, re] of ex.checks ?? []) {
    const detail = check(result, id)?.detail ?? '';
    if (!re.test(detail)) bad.push(`expected the ${id} check to match ${re}, got: ${detail}`);
  }
  return bad;
}

// ------------------------------------------------------------------------------------------------------------------
// The staged CI drill (--ci)
// ------------------------------------------------------------------------------------------------------------------

/** The loopback world's scenarios used by stage 3 (a forced 429, empty, delisted, closed, partial and mixed batches). */
export const STAGE3_SCENARIOS = [
  'relay-429', 'relay-429-once', 'relay-flaky', 'outage', 'relay-stale', 'relay-empty', 'relay-delisted-game', 'all-games-delisted',
  'no-open-contracts', 'relay-partial', 'relay-game-over', 'relay-closed-among-open', 'relay-first-game-over',
];

export const STAGE_NAMES = {
  1: 'healthy run against the real relay and the real feed',
  2: 'forced outage against the actual relay URL path',
  3: 'forced 429, empty, delisted, closed and partial answers (loopback fake relay)',
  4: 'recovery: healthy again, no false alarm',
  5: 'heartbeat on the real feed branch',
};

/** Workflow commands in the monitor's own output would turn a forced failure into a real annotation on a green run. */
export const neutralise = (text) => String(text).replace(/^::(error|warning|notice|debug|group|endgroup|add-mask|stop-commands|set-output|save-state)/gm, '[annotation, not emitted by the drill: $1]');

const clip = (t, n = 400) => (String(t).length > n ? `${String(t).slice(0, n)}...` : String(t));
const redactUrl = (u) => {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname === '/' ? '' : x.pathname}`;
  } catch {
    return String(u);
  }
};

/**
 * Run the staged drill. `env` supplies SIFT_QUOTE_RELAY_URL (the repository variable), GITHUB_REPOSITORY and optionally
 * SIFT_FEED_URL; nothing else from the ambient environment reaches the monitor, so a stray SIFT_MONITOR_* variable
 * cannot bend a stage. `deps` ({ fetchImpl, now, sleep }) and `tune` (extra monitor environment, e.g. a short heartbeat
 * poll) exist for the unit tests; the workflow passes neither.
 * Returns { ok, stages: [{ stage, name, ok, items: [{ name, expected, observed, ok, problems }] }], failedStages }.
 */
export async function runCiDrill({ env = process.env, stages = null, log = console.log, deps = {}, tune = {}, summaryFile = env.GITHUB_STEP_SUMMARY } = {}) {
  const want = stages ?? [1, 2, 3, 4, 5];
  const real = { ...tune, ...(env.SIFT_FEED_URL ? { SIFT_FEED_URL: env.SIFT_FEED_URL } : {}), ...(env.GITHUB_REPOSITORY ? { GITHUB_REPOSITORY: env.GITHUB_REPOSITORY } : {}), ...(env.SIFT_ORIGIN ? { SIFT_ORIGIN: env.SIFT_ORIGIN } : {}) };
  const relayUrl = (env.SIFT_QUOTE_RELAY_URL ?? '').trim().replace(/\/+$/, '');
  const mon = (e) => runMonitor({ env: e, ...deps });
  const results = [];
  let world = null;

  /** Run the monitor once with `e`, print its (neutralised) report, judge it against `ex`, and return the item. */
  async function item(name, expected, e, ex, extraJudge) {
    log(`--- ${name}`);
    log(`expect: ${expected}`);
    let result;
    let problems = [];
    let observed;
    try {
      result = await mon(e);
      log(neutralise(report(result)));
      problems = mismatches(result, ex);
      if (extraJudge) problems.push(...extraJudge(result));
      const relay = check(result, 'relay');
      const hb = check(result, 'heartbeat');
      observed = `${result.ok ? 'PASS' : 'FAIL'} (${result.status})${relay ? `; relay ${relay.status}: ${clip(relay.detail, 220)}` : ''}${hb && hb.status === 'note' ? '; heartbeat: HEARTBEAT_NOT_PUBLISHED' : ''}`;
    } catch (err) {
      problems = [`the monitor threw: ${err?.stack ?? err}`];
      observed = `threw: ${err?.message ?? err}`;
    }
    log(`observed: ${observed}`);
    log(problems.length ? `MISMATCH: ${problems.join('; ')}` : 'MATCH');
    return { name, expected, observed, ok: !problems.length, problems, result };
  }

  const needRelay = () => (relayUrl ? [] : ['the SIFT_QUOTE_RELAY_URL repository variable is not set, so the real relay cannot be exercised']);

  const stageFns = {
    1: async () => {
      log(`real feed: ${real.SIFT_FEED_URL ?? `https://raw.githubusercontent.com/${real.GITHUB_REPOSITORY ?? '<repo>'}/live-quotes`}`);
      log(`real relay: ${relayUrl ? redactUrl(relayUrl) : '(SIFT_QUOTE_RELAY_URL is not set)'}`);
      const it = await item('healthy run, real relay and feed', 'PASS (or PASS with HEARTBEAT_NOT_PUBLISHED), and the relay check actually passed (not skipped)', { ...real, SIFT_QUOTE_RELAY_URL: relayUrl }, { ok: true, statusIn: ['PASS', 'PASS_HEARTBEAT_NOT_PUBLISHED'], checkStatus: [['feed_index', 'pass'], ['feed_fresh', 'pass'], ['relay', 'pass']] }, () => needRelay());
      return [it];
    },
    2: async () => {
      const fast = { SIFT_MONITOR_FETCH_TIMEOUT_S: '4', SIFT_MONITOR_RETRY_DELAY_S: '1' };
      const out = [];
      out.push(await item('unroutable host (DNS cannot resolve it)', 'FAIL, relay check "relay unreachable", retried once', { ...real, ...fast, SIFT_QUOTE_RELAY_URL: 'https://sift-quote-relay-drill-unroutable.invalid' }, { ok: false, checks: [['relay', /relay unreachable.*the same on the single retry/]], checkStatus: [['relay', 'fail']] }));
      out.push(await item('black-holed address (TEST-NET-1, nothing answers)', 'FAIL, relay check "relay unreachable", retried once', { ...real, ...fast, SIFT_QUOTE_RELAY_URL: 'https://192.0.2.1' }, { ok: false, checks: [['relay', /relay unreachable.*the same on the single retry/]], checkStatus: [['relay', 'fail']] }));
      out.push(await item('wrong path on the actual relay host', 'FAIL, relay check "relay answered HTTP <code>" (or HTTP 200 without markets[])', { ...real, ...fast, SIFT_QUOTE_RELAY_URL: `${relayUrl || 'https://relay.invalid'}/__quote_drill_no_such_route__` }, { ok: false, checks: [['relay', /relay answered HTTP \d{3}|relay answered HTTP 200 but the body has no markets\[\]/]], checkStatus: [['relay', 'fail']] }, () => needRelay()));
      out.push(await item('impossible relay freshness limit on the real relay (SIFT_MONITOR_RELAY_MAX_AGE_S=0.001)', 'FAIL, relay check "newest observation ... old; limit 0s", retried once', { ...real, ...fast, SIFT_QUOTE_RELAY_URL: relayUrl, SIFT_MONITOR_RELAY_MAX_AGE_S: '0.001' }, { ok: false, checks: [['relay', /newest observation .* is \d+s old; limit 0s/]], checkStatus: [['relay', 'fail']] }, () => needRelay()));
      out.push(await item('impossible feed limit on the real feed (SIFT_MONITOR_FEED_MAX_AGE_S=1)', 'FAIL, "Feed generated_at is recent" ... limit 1s', { ...real, ...fast, SIFT_QUOTE_RELAY_URL: relayUrl, SIFT_MONITOR_FEED_MAX_AGE_S: '1' }, { ok: false, checks: [['feed_fresh', /\d+s old; limit 1s/]], checkStatus: [['feed_fresh', 'fail']] }));
      return out;
    },
    3: async () => {
      world ??= await startFakeWorld();
      const out = [];
      for (const name of STAGE3_SCENARIOS) {
        const sc = SCENARIOS[name];
        world.state.scenario = sc;
        world.state.healthReads = 0;
        world.state.relayCalls = 0;
        world.state.relayRequests = [];
        const e = { SIFT_FEED_URL: `${world.base}/feed`, SIFT_QUOTE_RELAY_URL: `${world.base}/relay`, SIFT_MONITOR_POLL_S: '0.2', SIFT_MONITOR_SEQUENCE_WINDOW_S: '3', SIFT_MONITOR_RETRY_DELAY_S: '0.3', ...sc.env };
        const it = await item(`loopback: ${name}`, `${sc.expect.ok ? 'PASS' : 'FAIL'}${sc.expect.status && sc.expect.status !== 'PASS' ? ` (${sc.expect.status})` : ''}`, e, sc.expect);
        log(`(the loopback relay saw ${world.state.relayCalls} request(s))`);
        out.push(it);
      }
      return out;
    },
    4: async () => {
      world ??= await startFakeWorld();
      const out = [];
      const e = () => ({ SIFT_FEED_URL: `${world.base}/feed`, SIFT_QUOTE_RELAY_URL: `${world.base}/relay`, SIFT_MONITOR_POLL_S: '0.2', SIFT_MONITOR_SEQUENCE_WINDOW_S: '3', SIFT_MONITOR_RETRY_DELAY_S: '0.3' });
      world.state.scenario = SCENARIOS.outage;
      out.push(await item('loopback: the outage', 'FAIL', e(), SCENARIOS.outage.expect));
      world.state.scenario = SCENARIOS.healthy;
      world.state.healthReads = 0;
      out.push(await item('loopback: the very next run after recovery', 'PASS with no failure, no retry, no notice, nothing left over', e(), SCENARIOS.healthy.expect, (r) => {
        const text = report(r);
        return [/FAIL|::error|::notice|retry|recovered/.test(text) ? `the recovered run still mentions the outage: ${clip(text.split('\n').filter((l) => /FAIL|::error|::notice|retry|recovered/.test(l)).join(' | '), 300)}` : null].filter(Boolean);
      }));
      out.push(await item('real relay and feed again after the forced failures', 'PASS, every check pass or note, no failure line, no error annotation', { ...real, SIFT_QUOTE_RELAY_URL: relayUrl }, { ok: true, statusIn: ['PASS', 'PASS_HEARTBEAT_NOT_PUBLISHED'], checkStatus: [['relay', 'pass']] }, (r) => {
        const text = report(r);
        return [...needRelay(), ...(/\[FAIL\]|::error/.test(text) ? ['the real run after the failures contains a failure or an error annotation'] : [])];
      }));
      return out;
    },
    5: async () => {
      const out = [];
      const base = { ...real };
      const a = await item('heartbeat on the real feed branch (relay part not under test)', 'PASS; health.json missing = the distinct non-failing state HEARTBEAT_NOT_PUBLISHED, health.json present = sequence advances', base, { ok: true, statusIn: ['PASS', 'PASS_HEARTBEAT_NOT_PUBLISHED'] }, (r) => {
        const hb = check(r, 'heartbeat');
        if (!hb) return ['no heartbeat check in the result'];
        if (hb.status === 'note') return /^HEARTBEAT_NOT_PUBLISHED/.test(hb.detail) && r.status === 'PASS_HEARTBEAT_NOT_PUBLISHED' ? [] : ['an unpublished heartbeat must be reported as the distinct HEARTBEAT_NOT_PUBLISHED state'];
        const adv = check(r, 'heartbeat_advance');
        return hb.status === 'pass' && adv?.status === 'pass' ? [] : [`health.json is published but the heartbeat did not pass (heartbeat ${hb.status}, advance ${adv?.status ?? 'absent'})`];
      });
      out.push(a);
      const published = check(a.result ?? { checks: [] }, 'heartbeat')?.status === 'pass';
      log(`heartbeat state on the real feed branch: ${published ? 'PUBLISHED' : 'HEARTBEAT_NOT_PUBLISHED'}`);
      if (!published && a.ok) {
        out.push(await item('same feed with the strict switch (SIFT_MONITOR_REQUIRE_HEARTBEAT=1)', 'FAIL: a missing health.json becomes a failure only when required', { ...base, SIFT_MONITOR_REQUIRE_HEARTBEAT: '1' }, { ok: false, checks: [['heartbeat', /does not exist on the live-quotes branch.*SIFT_MONITOR_REQUIRE_HEARTBEAT/]], checkStatus: [['heartbeat', 'fail']] }));
      }
      // The detection logic itself, whatever the real branch looks like today (loopback, deterministic).
      world ??= await startFakeWorld();
      for (const name of ['heartbeat-missing', 'heartbeat-stalled', 'heartbeat-missing-required']) {
        const sc = SCENARIOS[name];
        world.state.scenario = sc;
        world.state.healthReads = 0;
        const e = { SIFT_FEED_URL: `${world.base}/feed`, SIFT_QUOTE_RELAY_URL: `${world.base}/relay`, SIFT_MONITOR_POLL_S: '0.2', SIFT_MONITOR_SEQUENCE_WINDOW_S: '3', SIFT_MONITOR_RETRY_DELAY_S: '0.3', ...sc.env };
        out.push(await item(`loopback: ${name}`, `${sc.expect.ok ? 'PASS' : 'FAIL'}${sc.expect.status && sc.expect.status !== 'PASS' ? ` (${sc.expect.status})` : ''}`, e, sc.expect));
      }
      return out;
    },
  };

  try {
    for (const n of want) {
      log(`::group::Stage ${n}: ${STAGE_NAMES[n]}`);
      let items;
      try {
        items = await stageFns[n]();
      } catch (err) {
        items = [{ name: 'the stage itself', expected: 'to run', observed: `threw: ${err?.message ?? err}`, ok: false, problems: [`the stage threw: ${err?.stack ?? err}`] }];
      }
      log('::endgroup::');
      const ok = items.every((i) => i.ok);
      log(`${ok ? 'STAGE MATCHED' : 'STAGE MISMATCH'}: stage ${n} (${STAGE_NAMES[n]}): ${items.filter((i) => i.ok).length} of ${items.length} item(s) matched`);
      // One notice annotation per stage: the observed result of every item, readable from the run's check annotations even
      // where the job log itself cannot be fetched (an informational notice, never an error; mismatches add an error below).
      const line = items.map((i) => `[${i.ok ? 'MATCH' : 'MISMATCH'}] ${i.name} => ${i.observed}`).join(' || ').replace(/[\r\n%]+/g, ' ');
      log(`::notice title=Quote drill stage ${n} ${ok ? 'matched' : 'MISMATCH'} (${STAGE_NAMES[n]})::${clip(line, 3500)}`);
      results.push({ stage: n, name: STAGE_NAMES[n], ok, items });
    }
  } finally {
    await world?.close();
  }
  const failedStages = results.filter((r) => !r.ok);
  const summary = ciSummary(results);
  log(`\n${summary.text}`);
  if (summaryFile) {
    try {
      appendFileSync(summaryFile, summary.markdown);
    } catch {
      /* the summary is a convenience */
    }
  }
  for (const f of failedStages) {
    const bad = f.items.filter((i) => !i.ok).map((i) => `${i.name}: ${i.problems.join('; ')}`).join(' | ');
    log(`::error title=Quote drill: stage ${f.stage} did not match (${f.name})::${clip(bad.replace(/\n/g, ' '), 900)}`);
  }
  return { ok: !failedStages.length, stages: results, failedStages: failedStages.map((f) => f.stage) };
}

function ciSummary(results) {
  const lines = ['--- CI drill summary ---'];
  const md = ['### Quote CI drill', '', '| Stage | Item | Expected | Observed | Result |', '| --- | --- | --- | --- | --- |'];
  for (const r of results) {
    for (const i of r.items) {
      lines.push(`${i.ok ? 'MATCH   ' : 'MISMATCH'}  stage ${r.stage}  ${i.name}${i.ok ? '' : `  <- ${i.problems.join('; ')}`}`);
      md.push(`| ${r.stage}. ${r.name} | ${i.name} | ${String(i.expected).replace(/\|/g, '\\|')} | ${clip(i.observed, 300).replace(/\|/g, '\\|')} | ${i.ok ? 'MATCH' : `**MISMATCH**: ${clip(i.problems.join('; '), 300).replace(/\|/g, '\\|')}`} |`);
    }
  }
  const bad = results.filter((r) => !r.ok);
  const verdict = bad.length ? `DRILL FAILED: stage(s) ${bad.map((b) => `${b.stage} (${b.name})`).join(', ')} did not match` : `DRILL PASSED: all ${results.length} stage(s) matched their expectation`;
  lines.push(verdict);
  md.push('', `**${verdict}**`, '');
  return { text: lines.join('\n'), markdown: md.join('\n') };
}

async function main(argv) {
  if (argv.includes('--ci')) {
    const st = argv.find((a) => a.startsWith('--stages='));
    const stages = st ? st.slice('--stages='.length).split(',').map(Number).filter((n) => STAGE_NAMES[n]) : null;
    const r = await runCiDrill({ stages });
    return r.ok ? 0 : 1;
  }
  if (argv.includes('--list')) {
    for (const [name, s] of Object.entries(SCENARIOS)) console.log(`${name.padEnd(28)} expects ${s.expect.ok ? 'PASS' : 'FAIL'}${s.expect.status && s.expect.status !== 'PASS' ? ` (${s.expect.status})` : ''}`);
    return 0;
  }
  const names = argv.filter((a) => !a.startsWith('--'));
  const chosen = names.length ? names : Object.keys(SCENARIOS);
  for (const n of chosen) if (!SCENARIOS[n]) { console.error(`unknown scenario ${n}; try --list`); return 2; }
  const world = await startFakeWorld();
  const rows = [];
  try {
    for (const name of chosen) {
      const sc = SCENARIOS[name];
      world.state.scenario = sc;
      world.state.healthReads = 0;
      world.state.relayCalls = 0;
      world.state.relayRequests = [];
      console.log(`\n=== scenario: ${name} (the monitor is expected to ${sc.expect.ok ? 'PASS' : 'FAIL'}${sc.expect.status && sc.expect.status !== 'PASS' ? `, ${sc.expect.status}` : ''}) ===`);
      const env = {
        SIFT_FEED_URL: `${world.base}/feed`, SIFT_QUOTE_RELAY_URL: `${world.base}/relay`,
        SIFT_MONITOR_POLL_S: '0.2', SIFT_MONITOR_SEQUENCE_WINDOW_S: '3', SIFT_MONITOR_RETRY_DELAY_S: '0.3', ...sc.env,
      };
      const result = await runMonitor({ env });
      console.log(report(result));
      console.log(`(the fake relay saw ${world.state.relayCalls} request(s); the fake feed served health.json ${world.state.healthReads} time(s))`);
      const bad = mismatches(result, sc.expect);
      rows.push({ name, bad });
      console.log(bad.length ? `DRILL MISMATCH: ${bad.join('; ')}` : 'DRILL OK: the monitor reached the specified verdict');
    }
  } finally {
    await world.close();
  }
  console.log('\n--- drill summary ---');
  for (const r of rows) console.log(`${r.bad.length ? 'MISMATCH' : 'ok      '}  ${r.name}`);
  const failed = rows.filter((r) => r.bad.length);
  console.log(failed.length ? `DRILL FAILED: ${failed.length} of ${rows.length} scenarios did not match` : `DRILL PASSED: ${rows.length} of ${rows.length} scenarios matched`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
