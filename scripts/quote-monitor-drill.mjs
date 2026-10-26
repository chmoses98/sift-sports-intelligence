#!/usr/bin/env node
// Local failure-injection drill for the quote monitor. It starts a FAKE feed and a FAKE relay on 127.0.0.1 (nothing
// leaves this machine, nothing production is read or written), points scripts/quote-monitor.mjs at them with the
// monitor's own environment overrides, runs one scenario after another, and checks that the monitor reaches the
// verdict it is specified to reach.
//
//   node scripts/quote-monitor-drill.mjs                    every scenario, in order
//   node scripts/quote-monitor-drill.mjs outage healthy     just these, in this order (an outage followed by a recovery)
//   node scripts/quote-monitor-drill.mjs --list
//
// The drill passes (exit 0) when every scenario produced the expected verdict: a monitor that correctly FAILs an
// outage is a drill pass. Timings are shortened through the monitor's overrides (poll 0.2 s, sequence window 3 s,
// retry delay 0.3 s); the rules are the same ones the real run applies. docs/quote-track/CI_DRILL.md explains how to read
// the output and what this does and does not prove.
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
 *                 | 'unreachable' | 'delistedFirstGame'
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
  for (const [id, re] of ex.checks ?? []) {
    const detail = check(result, id)?.detail ?? '';
    if (!re.test(detail)) bad.push(`expected the ${id} check to match ${re}, got: ${detail}`);
  }
  return bad;
}

async function main(argv) {
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
